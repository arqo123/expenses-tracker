import type { Context } from 'hono';
import type { TelegramMessage } from '../types/telegram.types.ts';
import { getUserName } from './webhook.handler.ts';
import { CATEGORY_EMOJI, type ExpenseCategory } from '../types/expense.types.ts';
import { ReceiptMatcherService } from '../services/receipt-matcher.service.ts';
import { ShoppingDatabaseService } from '../services/shopping-database.service.ts';

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

    // ===== PROPORCJONALNA KOREKTA CEN =====
    // Jeśli suma produktów różni się od total z paragonu - skoryguj proporcjonalnie
    const receiptTotal = visionResult.total;
    const productSum = validProducts.reduce((sum, p) => sum + p.price, 0);

    if (receiptTotal > 0 && Math.abs(productSum - receiptTotal) > 0.10) {
      const correctionRatio = receiptTotal / productSum;
      console.log(`[ImageHandler] Price correction: ${productSum.toFixed(2)} → ${receiptTotal.toFixed(2)} (ratio: ${correctionRatio.toFixed(4)})`);

      for (const product of validProducts) {
        product.price = Math.round(product.price * correctionRatio * 100) / 100;
      }
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

    // Generate unique receipt ID for grouping all items from this receipt
    const receiptId = crypto.randomUUID();

    // Create expense inputs (not saved yet - may need user decision)
    const expenseInputs = validProducts.map(product => ({
      amount: product.price,
      category: product.category || 'Inne' as const,
      shop: visionResult.source || 'Unknown',
      user: userName,
      source: 'telegram_image' as const,
      description: product.name,
      raw_input: `[OCR] ${product.name} ${product.price}`,
      receipt_id: receiptId,
    }));

    // Calculate total and group by category first (needed for both paths)
    const totalAmount = validProducts.reduce((sum, p) => sum + p.price, 0);
    const categoryGroups: Record<string, Array<{ name: string; price: number }>> = {};
    for (const product of validProducts) {
      const cat = product.category || 'Inne';
      if (!categoryGroups[cat]) categoryGroups[cat] = [];
      categoryGroups[cat].push({ name: product.name, price: product.price });
    }

    // ===== RECEIPT MATCHING: Check for similar manual expenses =====
    const receiptMatcher = new ReceiptMatcherService();
    const shopName = visionResult.source || 'Unknown';
    const today = new Date().toISOString().split('T')[0] || new Date().toISOString().slice(0, 10);
    const matches = await database.findMatchingManualExpenses(
      userName,
      today,
      totalAmount,
      shopName
    );

    if (matches.length > 0) {
      // Found potential duplicates - ask user before saving
      const sessionId = receiptMatcher.generateSessionId();

      await database.saveReceiptSession({
        sessionId,
        userName,
        chatId,
        receiptData: {
          source: shopName,
          total: totalAmount,
          productCount: validProducts.length,
          expenseInputs,
          categoryGroups,
        },
        matchedExpenses: matches,
        status: 'pending',
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      });

      const message = receiptMatcher.formatMatchMessage({
        receiptShop: shopName,
        receiptTotal: totalAmount,
        productCount: validProducts.length,
        categoryGroups,
        matches,
      });

      const keyboard = receiptMatcher.buildMatchKeyboard({ matches, sessionId });

      await telegram.sendMessage({
        chat_id: chatId,
        text: message,
        parse_mode: 'Markdown',
        reply_markup: keyboard,
      });

      await database.createAuditLog(
        'RECEIPT_MATCH',
        {
          receipt_shop: shopName,
          receipt_total: totalAmount,
          matched_count: matches.length,
          session_id: sessionId,
        },
        userName
      );

      console.log(`[ImageHandler] Found ${matches.length} matching expenses, waiting for user decision`);
      return c.json({ ok: true, pending_decision: true });
    }

    // ===== No matches - proceed with normal expense creation =====
    const { created, duplicates } = await database.createExpensesBatch(expenseInputs);
    const createdExpenses = created.map(e => e.id);

    // ===== AUTO-CHECK: Remove matching items from shopping list =====
    let checkedFromList: string[] = [];
    try {
      const shoppingDb = new ShoppingDatabaseService(database.getPool());
      const listItems = await shoppingDb.getItems();

      if (listItems.length > 0) {
        const productNames = validProducts.map(p => p.name);
        const matches = await shoppingDb.matchReceiptToList(productNames);

        if (matches.length > 0) {
          checkedFromList = await shoppingDb.checkMatchedItems(matches, userName);
          console.log(`[ImageHandler] Auto-checked ${checkedFromList.length} items from shopping list`);
        }
      }
    } catch (error) {
      console.error('[ImageHandler] Shopping list auto-check failed:', error);
      // Continue without auto-check on error
    }

    // ===== SYNC: Update shopping stats and product correlations =====
    try {
      const shoppingDb = new ShoppingDatabaseService(database.getPool());

      // Sync products to shopping_stats for future suggestions
      const receiptProducts = validProducts.map(p => ({
        name: p.name,
        price: p.price,
        shop: shopName,
        category: p.category,
      }));
      await shoppingDb.syncReceiptToStats(receiptProducts);

      // Update product correlations for basket analysis
      if (receiptId && validProducts.length >= 2) {
        await database.updateProductCorrelations(receiptId);
        console.log(`[ImageHandler] Updated correlations for receipt ${receiptId}`);
      }

      console.log(`[ImageHandler] Synced ${validProducts.length} products to shopping_stats`);
    } catch (error) {
      console.error('[ImageHandler] Shopping stats sync failed:', error);
      // Continue without sync on error
    }

    // Build response message with products grouped by category
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

    // Info o rabatach
    if (visionResult.total_discounts && visionResult.total_discounts > 0) {
      text += `🏷️ Uwzględniono rabaty: *-${visionResult.total_discounts.toFixed(2)} zł*\n`;
    }

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

    // Info about items checked from shopping list
    if (checkedFromList.length > 0) {
      text += `\n\n🛒 *Odhaczono z listy:* ${checkedFromList.join(', ')}`;
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
        total_discounts: visionResult.total_discounts || 0,
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
