import type { Context } from 'hono';
import type { TelegramMessage } from '../types/telegram.types.ts';
import { getUserName } from './webhook.handler.ts';
import { CATEGORY_EMOJI, type ExpenseCategory } from '../types/expense.types.ts';

const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10 MB

export async function imageHandler(c: Context, message: TelegramMessage): Promise<Response> {
  const telegram = c.get('telegram');
  const aiCategorizer = c.get('aiCategorizer');
  const database = c.get('database');

  const chatId = message.chat.id;
  const userName = getUserName(chatId, message.from.first_name);

  try {
    // Get file ID (highest resolution for photos, or document)
    let fileId: string;
    let mimeType = 'image/jpeg';

    if (message.photo && message.photo.length > 0) {
      // Get highest resolution photo
      const photo = message.photo[message.photo.length - 1]!;
      fileId = photo.file_id;

      if (photo.file_size && photo.file_size > MAX_IMAGE_SIZE) {
        await telegram.sendError(chatId, 'Zdjecie za duze (max 10 MB)');
        return c.json({ ok: true });
      }
    } else if (message.document) {
      fileId = message.document.file_id;
      mimeType = message.document.mime_type || 'image/jpeg';

      if (message.document.file_size && message.document.file_size > MAX_IMAGE_SIZE) {
        await telegram.sendError(chatId, 'Plik za duzy (max 10 MB)');
        return c.json({ ok: true });
      }
    } else {
      await telegram.sendError(chatId, 'Brak zdjecia do przetworzenia');
      return c.json({ ok: true });
    }

    // Download image
    console.log(`[ImageHandler] Processing image for ${userName}`);
    const fileInfo = await telegram.getFile(fileId);
    const imageBuffer = await telegram.downloadFile(fileInfo.file_path);

    // Convert to base64
    const base64 = Buffer.from(imageBuffer).toString('base64');

    // OCR with AI Vision
    console.log(`[ImageHandler] Running OCR (${imageBuffer.byteLength} bytes)`);
    const visionResult = await aiCategorizer.categorizeImage(base64, mimeType);

    if (!visionResult.products || visionResult.products.length === 0) {
      await telegram.sendError(
        chatId,
        'Nie udalo sie odczytac produktow. Sprobuj wyrazniejsze zdjecie.'
      );
      return c.json({ ok: true });
    }

    // Filter out discounts/rebates (negative or zero prices)
    const validProducts = visionResult.products.filter(p => p.price > 0);
    const skippedCount = visionResult.products.length - validProducts.length;

    if (validProducts.length === 0) {
      await telegram.sendError(
        chatId,
        'Brak produktow do zapisania (tylko rabaty/znizki?)'
      );
      return c.json({ ok: true });
    }

    // Apply learned categories from previous corrections
    const productNames = validProducts.map(p => p.name);
    const learnings = await database.getProductLearnings(productNames, visionResult.source);

    // Update product categories with learned ones
    for (const product of validProducts) {
      const learnedCategory = learnings.get(product.name);
      if (learnedCategory) {
        console.log(`[ImageHandler] Applying learned category for "${product.name}": ${product.category} → ${learnedCategory}`);
        product.category = learnedCategory;
      }
    }

    // Create expenses using batch with deduplication
    const expenseInputs = validProducts.map(product => ({
      amount: product.price,
      category: product.category || 'Inne' as const,
      shop: visionResult.source || 'Unknown',
      user: userName,
      source: 'telegram_image' as const,
      description: product.name,
      raw_input: `[OCR] ${product.name} ${product.price}`,
    }));

    const { created, duplicates } = await database.createExpensesBatch(expenseInputs);
    const createdExpenses = created.map(e => e.id);

    // Group products by category
    const categoryGroups: Record<string, Array<{ name: string; price: number }>> = {};
    for (const product of validProducts) {
      const cat = product.category || 'Inne';
      if (!categoryGroups[cat]) categoryGroups[cat] = [];
      categoryGroups[cat].push({ name: product.name, price: product.price });
    }

    // Build response message with products grouped by category
    const totalAmount = validProducts.reduce((sum, p) => sum + p.price, 0);
    let text = `📷 Paragon z *${visionResult.source}*\n\n`;

    // Products grouped by category
    for (const [category, products] of Object.entries(categoryGroups)) {
      const emoji = CATEGORY_EMOJI[category as ExpenseCategory] || '❓';
      text += `${emoji} *${category}*:\n`;
      for (const p of products) {
        text += `  - ${p.name}: ${p.price.toFixed(2)} zł\n`;
      }
      text += '\n';
    }

    // Total
    text += `💰 Razem: *${totalAmount.toFixed(2)} zł*\n`;

    // Category stats
    const categoryStats = Object.entries(categoryGroups)
      .map(([cat, prods]) => `${prods.length}x ${cat}`)
      .join(', ');

    if (createdExpenses.length > 0) {
      text += `✅ Utworzono ${createdExpenses.length} wydatków (${categoryStats})`;
    }

    // Info about duplicates
    if (duplicates.length > 0) {
      text += `\n🔄 Duplikaty: ${duplicates.length} (juz istnieja)`;
    }

    // Info about skipped products (rebates)
    if (skippedCount > 0) {
      text += `\n⏭️ Pominieto ${skippedCount} rabatów/zniżek`;
    }

    // Handle case when all products are duplicates
    if (createdExpenses.length === 0) {
      text += `\n\n_Ten paragon został już wcześniej przetworzony._`;
    }

    // Build edit keyboard only if we have new expenses
    // Note: Telegram has 64-byte limit for callback_data, so we pass count and query by source
    const editKeyboard = createdExpenses.length > 0
      ? {
          inline_keyboard: [
            [{ text: '✏️ Edytuj kategorie', callback_data: `ocr_list:${createdExpenses.length}` }]
          ]
        }
      : undefined;

    await telegram.sendMessage({
      chat_id: chatId,
      text,
      parse_mode: 'Markdown',
      reply_markup: editKeyboard,
    });

    // Audit log
    await database.createAuditLog(
      'BATCH_CREATE',
      {
        source: visionResult.source,
        product_count: validProducts.length,
        created_count: createdExpenses.length,
        duplicate_count: duplicates.length,
        skipped_count: skippedCount,
        total: totalAmount,
        image_type: visionResult.image_type,
      },
      userName
    );

    console.log(`[ImageHandler] Created ${createdExpenses.length} expenses, ${duplicates.length} duplicates from image`);
    return c.json({ ok: true, expenses: createdExpenses });
  } catch (error) {
    console.error('[ImageHandler] Error:', error);
    await telegram.sendError(chatId, 'Blad przetwarzania zdjecia.');
    return c.json({ ok: false }, 500);
  }
}
