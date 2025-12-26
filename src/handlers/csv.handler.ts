import type { Context } from 'hono';
import type { TelegramMessage } from '../types/telegram.types.ts';
import { getUserName } from './webhook.handler.ts';
import { parseCSV } from '../parsers/csv/index.ts';

const MAX_CSV_SIZE = 5 * 1024 * 1024; // 5 MB

export async function csvHandler(c: Context, message: TelegramMessage): Promise<Response> {
  const telegram = c.get('telegram');
  const aiCategorizer = c.get('aiCategorizer');
  const database = c.get('database');

  const chatId = message.chat.id;
  const document = message.document!;
  const userName = getUserName(chatId, message.from.first_name);

  try {
    // Validate file size
    if (document.file_size && document.file_size > MAX_CSV_SIZE) {
      await telegram.sendError(chatId, 'Plik CSV za duzy (max 5 MB)');
      return c.json({ ok: true });
    }

    // Download CSV file
    console.log(`[CSVHandler] Processing CSV for ${userName}: ${document.file_name}`);
    const fileInfo = await telegram.getFile(document.file_id);
    const csvBuffer = await telegram.downloadFile(fileInfo.file_path);
    const csvContent = new TextDecoder('utf-8').decode(csvBuffer);

    // Parse CSV
    const parseResult = parseCSV(csvContent);
    console.log(`[CSVHandler] Detected bank: ${parseResult.bank}, transactions: ${parseResult.transactions.length}`);

    if (parseResult.transactions.length === 0) {
      await telegram.sendError(
        chatId,
        `Nie znaleziono transakcji w pliku. Format: ${parseResult.bank}`
      );
      return c.json({ ok: true });
    }

    // Send progress message and save message_id for updates
    const totalTransactions = parseResult.transactions.length;
    const bankName = parseResult.bank;
    const progressMsg = await telegram.sendMessage({
      chat_id: chatId,
      text: `📊 Przetwarzam ${totalTransactions} transakcji (${bankName})...\n⏳ 0%`,
    });
    const progressMsgId = progressMsg.message_id;

    // Progress tracking
    let lastProgressUpdate = Date.now();
    const PROGRESS_INTERVAL_MS = 30_000; // 30 seconds

    const updateProgress = async (processed: number) => {
      const now = Date.now();
      if (now - lastProgressUpdate < PROGRESS_INTERVAL_MS) return;

      lastProgressUpdate = now;
      const percent = Math.round((processed / totalTransactions) * 100);
      try {
        await telegram.editMessage(
          chatId,
          progressMsgId,
          `📊 Przetwarzam ${totalTransactions} transakcji (${bankName})...\n⏳ ${percent}% (${processed}/${totalTransactions})`
        );
      } catch {
        // Ignore edit errors (e.g., message unchanged)
      }
    };

    // Prepare batch for AI categorization
    const batchItems = parseResult.transactions.map((t, idx) => ({
      idx,
      text: `${t.merchant} ${t.amount}`,
      date: t.date,
      source: 'csv',
    }));

    // Categorize in batches of 50
    const BATCH_SIZE = 50;
    const allCategorized: Array<{
      idx: number;
      shop: string;
      category: string;
      amount: number;
      confidence: number;
    }> = [];

    for (let i = 0; i < batchItems.length; i += BATCH_SIZE) {
      const batch = batchItems.slice(i, i + BATCH_SIZE);
      try {
        const categorized = await aiCategorizer.categorizeBatch(batch);
        allCategorized.push(...categorized);
      } catch (error) {
        console.error(`[CSVHandler] Batch ${i / BATCH_SIZE} failed:`, error);
        // Fallback: use original data with "Inne" category
        for (const item of batch) {
          const tx = parseResult.transactions[item.idx];
          if (tx) {
            allCategorized.push({
              idx: item.idx,
              shop: tx.merchant,
              category: 'Inne',
              amount: tx.amount,
              confidence: 0,
            });
          }
        }
      }

      // Update progress every 30 seconds
      await updateProgress(Math.min(i + BATCH_SIZE, batchItems.length));
    }

    // Create expenses
    const expensesToCreate = allCategorized.map((cat) => {
      const tx = parseResult.transactions[cat.idx];
      return {
        amount: cat.amount || tx?.amount || 0,
        category: (cat.category || 'Inne') as import('../types/expense.types.ts').ExpenseCategory,
        shop: cat.shop || tx?.merchant || 'Unknown',
        user: userName,
        source: 'telegram_csv' as const,
        date: tx?.date,
        raw_input: tx?.rawLine || '',
      };
    });

    const { created, duplicates } = await database.createExpensesBatch(expensesToCreate);

    // Delete progress message and send final summary
    try {
      await telegram.deleteMessage(chatId, progressMsgId);
    } catch {
      // Ignore delete errors
    }

    // Send summary
    await telegram.sendBatchSummary(
      chatId,
      created.length,
      duplicates.length,
      parseResult.transactions.length
    );

    // Audit log
    await database.createAuditLog(
      'BATCH_CREATE',
      {
        bank: parseResult.bank,
        total_transactions: parseResult.transactions.length,
        created: created.length,
        duplicates: duplicates.length,
        file_name: document.file_name,
      },
      userName
    );

    console.log(`[CSVHandler] Created ${created.length}/${parseResult.transactions.length} expenses`);
    return c.json({
      ok: true,
      created: created.length,
      duplicates: duplicates.length,
    });
  } catch (error) {
    console.error('[CSVHandler] Error:', error);
    await telegram.sendError(chatId, 'Blad przetwarzania pliku CSV.');
    return c.json({ ok: false }, 500);
  }
}
