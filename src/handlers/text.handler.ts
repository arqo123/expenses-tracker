import type { Context } from 'hono';
import type { TelegramMessage } from '../types/telegram.types.ts';
import { getUserName } from './webhook.handler.ts';
import { parseExpenseText } from '../parsers/text.parser.ts';
import { AddressLearningService } from '../services/address-learning.service.ts';
import { normalizeShopName } from '../config/merchant-aliases.ts';

export async function textHandler(c: Context, message: TelegramMessage): Promise<Response> {
  const aiCategorizer = c.get('aiCategorizer');
  const telegram = c.get('telegram');
  const database = c.get('database');

  const chatId = message.chat.id;
  const text = message.text!.trim();
  const userName = getUserName(chatId, message.from.first_name);

  // ===== CHECK FOR PENDING ADDRESS LEARNING (custom store name input) =====
  const addressLearning = new AddressLearningService(database.getPool());
  const customState = await addressLearning.getUserState(userName, 'address_learn_custom');

  if (customState && customState.stateData.waitingForInput) {
    // User is providing a custom store name
    const merchantName = text.trim();

    // Validate input
    if (merchantName.length < 2 || merchantName.length > 100) {
      await telegram.sendMessage({
        chat_id: chatId,
        text: '❌ Nazwa sklepu musi mieć od 2 do 100 znaków. Spróbuj ponownie:',
      });
      return c.json({ ok: true });
    }

    const address = customState.stateData.address as string;
    const expenseIds = customState.stateData.expenseIds as string[];

    // Normalize and save the learning
    const normalizedMerchant = normalizeShopName(merchantName);
    await addressLearning.learnAddress(address, normalizedMerchant, userName);

    // Update recent expenses with the new merchant name
    if (expenseIds && expenseIds.length > 0) {
      for (const expenseId of expenseIds) {
        await database.getPool().query(
          `UPDATE expenses SET sprzedawca = $1 WHERE title = $2`,
          [normalizedMerchant, expenseId]
        );
      }
    }

    // Clear states
    await addressLearning.clearUserState(userName, 'address_learn');
    await addressLearning.clearUserState(userName, 'address_learn_custom');

    // Send confirmation
    const addressText = address.slice(0, 35);
    await telegram.sendMessage({
      chat_id: chatId,
      text: `✅ Zapamiętano:\n📍 _${addressText}_\n🏪 → *${normalizedMerchant}*`,
      parse_mode: 'Markdown',
    });

    await database.createAuditLog(
      'ADDRESS_LEARN',
      { address, merchant: normalizedMerchant, expense_count: expenseIds?.length || 0, source: 'custom_input' },
      userName
    );

    console.log(`[TextHandler] Learned custom address: ${address} → ${normalizedMerchant}`);
    return c.json({ ok: true });
  }

  try {
    // Try simple parsing (optional - AI will do the heavy lifting)
    const parsed = parseExpenseText(text);

    // AI categorization - always run, even if simple parser failed
    console.log(`[TextHandler] Categorizing: "${text}" for ${userName}`);
    const result = await aiCategorizer.categorizeSingle(text);

    // Use AI result or fallback to parsed values (if available)
    const shop = result.shop || parsed?.shop || 'Nieznany';
    const amount = result.amount || parsed?.amount;
    const category = result.category || 'Inne';
    const description = result.description || parsed?.description;

    // Validate we have an amount
    if (!amount || amount <= 0) {
      await telegram.sendError(chatId, 'Nie rozpoznałem kwoty. Podaj kwotę (np. "zabka 15" lub "kawa 6,50 zł")');
      return c.json({ ok: true });
    }

    // Create expense
    const expense = await database.createExpense({
      amount,
      category,
      shop,
      user: userName,
      source: 'telegram_text',
      raw_input: text,
      description,
    });

    // Send confirmation
    await telegram.sendExpenseConfirmation(
      chatId,
      shop,
      amount,
      category,
      result.confidence || 0.8,
      expense.id,
      description
    );

    // Audit log
    await database.createAuditLog(
      'CREATE',
      {
        amount,
        category,
        shop,
        confidence: result.confidence,
      },
      userName,
      expense.id
    );

    console.log(`[TextHandler] Created expense ${expense.id}: ${shop} ${amount} -> ${category}`);
    return c.json({ ok: true, expense_id: expense.id });
  } catch (error: unknown) {
    // Check for duplicate key error (expense already exists)
    const pgError = error as { code?: string };
    if (pgError.code === '23505') {
      console.log('[TextHandler] Duplicate expense, skipping');
      await telegram.sendMessage({
        chat_id: chatId,
        text: '⏭️ Wydatek już zapisany',
      });
      return c.json({ ok: true, duplicate: true });
    }

    console.error('[TextHandler] Error:', error);
    await telegram.sendError(chatId, 'Nie udalo sie przetworzyc wydatku. Sprobuj: sklep kwota');
    return c.json({ ok: false }, 500);
  }
}
