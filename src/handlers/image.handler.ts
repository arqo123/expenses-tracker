import type { Context } from 'hono';
import type { TelegramMessage } from '../types/telegram.types.ts';
import { getUserName } from './webhook.handler.ts';

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

    // Create expenses for each product
    const createdExpenses: string[] = [];

    for (const product of visionResult.products) {
      const expense = await database.createExpense({
        amount: product.price,
        category: product.category || 'Inne',
        shop: visionResult.source || 'Unknown',
        user: userName,
        source: 'telegram_image',
        description: product.name,
        raw_input: `[OCR] ${product.name} ${product.price}`,
      });
      createdExpenses.push(expense.id);
    }

    // Send summary
    const totalAmount = visionResult.products.reduce((sum, p) => sum + p.price, 0);
    const productsText = visionResult.products
      .map(p => `  - ${p.name}: ${p.price.toFixed(2)} zl`)
      .join('\n');

    await telegram.sendMessage({
      chat_id: chatId,
      text: `📷 Paragon z *${visionResult.source}*

${productsText}

💰 Razem: *${totalAmount.toFixed(2)} zl*
✅ Utworzono ${createdExpenses.length} wydatkow`,
      parse_mode: 'Markdown',
    });

    // Audit log
    await database.createAuditLog(
      'BATCH_CREATE',
      {
        source: visionResult.source,
        product_count: visionResult.products.length,
        total: totalAmount,
        image_type: visionResult.image_type,
      },
      userName
    );

    console.log(`[ImageHandler] Created ${createdExpenses.length} expenses from image`);
    return c.json({ ok: true, expenses: createdExpenses });
  } catch (error) {
    console.error('[ImageHandler] Error:', error);
    await telegram.sendError(chatId, 'Blad przetwarzania zdjecia.');
    return c.json({ ok: false }, 500);
  }
}
