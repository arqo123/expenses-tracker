import type { Context } from 'hono';
import type { TelegramMessage } from '../types/telegram.types.ts';
import { getUserName } from './webhook.handler.ts';
import { parseCSV, formatSkippedStats } from '../parsers/csv/index.ts';
import { classifyDatabaseError, classifyError } from '../utils/error-classifier.ts';

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

    // Log skipped stats if any
    if (parseResult.skipped.count > 0) {
      console.log(`[CSVHandler] ${formatSkippedStats(parseResult.skipped)}`);
    }

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

    // Separate transactions: those with forced categories vs. needing AI
    const forcedCategorized: Array<{
      idx: number;
      shop: string;
      category: string;
      amount: number;
      confidence: number;
    }> = [];
    const batchItems: Array<{
      idx: number;
      text: string;
      date: string;
      source: string;
    }> = [];

    parseResult.transactions.forEach((t, idx) => {
      if (t.forcedCategory) {
        // Use pre-determined category (e.g., XTB → Inwestycje)
        forcedCategorized.push({
          idx,
          shop: t.merchant,
          category: t.forcedCategory,
          amount: t.amount,
          confidence: 1.0, // High confidence for forced categories
        });
      } else {
        // Need AI categorization
        batchItems.push({
          idx,
          text: `${t.merchant} ${t.amount}`,
          date: t.date,
          source: 'csv',
        });
      }
    });

    console.log(`[CSVHandler] Forced categories: ${forcedCategorized.length}, needing AI: ${batchItems.length}`);

    // Categorize in batches of 50, process up to 3 batches concurrently
    const BATCH_SIZE = 50;
    const CONCURRENCY_LIMIT = 3;
    const aiCategorized: Array<{
      idx: number;
      shop: string;
      category: string;
      amount: number;
      confidence: number;
    }> = [];

    // Split into batches
    const batches: typeof batchItems[] = [];
    for (let i = 0; i < batchItems.length; i += BATCH_SIZE) {
      batches.push(batchItems.slice(i, i + BATCH_SIZE));
    }

    // Process batches concurrently (max CONCURRENCY_LIMIT at a time)
    for (let i = 0; i < batches.length; i += CONCURRENCY_LIMIT) {
      const batchGroup = batches.slice(i, i + CONCURRENCY_LIMIT);

      const results = await Promise.all(
        batchGroup.map(async (batch) => {
          try {
            return await aiCategorizer.categorizeBatch(batch);
          } catch (error) {
            console.error(`[CSVHandler] Batch failed:`, error);
            // Fallback: use original data with "Inne" category
            return batch.map(item => {
              const tx = parseResult.transactions[item.idx];
              return {
                idx: item.idx,
                shop: tx?.merchant || 'Unknown',
                category: 'Inne' as const,
                amount: tx?.amount || 0,
                confidence: 0,
              };
            });
          }
        })
      );

      aiCategorized.push(...results.flat());

      // Update progress
      const processed = Math.min((i + CONCURRENCY_LIMIT) * BATCH_SIZE, batchItems.length);
      await updateProgress(processed);
    }

    // Combine forced + AI categorized
    const allCategorized = [...forcedCategorized, ...aiCategorized];

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

    // Count AI fallbacks (items that couldn't be categorized by AI)
    const aiFallbackCount = aiCategorized.filter(c => c.confidence === 0).length;

    let created: Awaited<ReturnType<typeof database.createExpensesBatchOptimized>>['created'];
    let duplicates: Awaited<ReturnType<typeof database.createExpensesBatchOptimized>>['duplicates'];

    try {
      const result = await database.createExpensesBatchOptimized(expensesToCreate);
      created = result.created;
      duplicates = result.duplicates;
    } catch (dbError) {
      const errorInfo = classifyDatabaseError(dbError);

      console.error('[CSVHandler] Database error:', {
        type: errorInfo.type,
        technicalDetail: errorInfo.technicalDetail,
        transactionsCount: expensesToCreate.length,
        retryable: errorInfo.retryable,
      });

      // Clean up progress message
      try {
        await telegram.deleteMessage(chatId, progressMsgId);
      } catch {
        // Ignore
      }

      // Send user-friendly error message
      const retryHint = errorInfo.retryable ? ' Możesz spróbować ponownie.' : '';
      await telegram.sendError(chatId, `${errorInfo.userMessage}${retryHint}`);

      return c.json({ ok: false, error: errorInfo.type }, 500);
    }

    // Aggregate categories for summary
    const categoryBreakdown: Record<string, { count: number; amount: number }> = {};
    for (const expense of expensesToCreate) {
      const cat = expense.category;
      if (!categoryBreakdown[cat]) {
        categoryBreakdown[cat] = { count: 0, amount: 0 };
      }
      categoryBreakdown[cat].count++;
      categoryBreakdown[cat].amount += expense.amount;
    }

    // Delete progress message and send final summary
    try {
      await telegram.deleteMessage(chatId, progressMsgId);
    } catch {
      // Ignore delete errors
    }

    // Send summary with category breakdown and skipped info
    const skippedInfo = parseResult.skipped.count > 0
      ? formatSkippedStats(parseResult.skipped)
      : undefined;
    await telegram.sendBatchSummary(
      chatId,
      created.length,
      duplicates.length,
      parseResult.transactions.length,
      categoryBreakdown,
      skippedInfo,
      aiFallbackCount
    );

    // Audit log
    await database.createAuditLog(
      'BATCH_CREATE',
      {
        bank: parseResult.bank,
        total_transactions: parseResult.transactions.length,
        created: created.length,
        duplicates: duplicates.length,
        skipped: parseResult.skipped,
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
    const errorInfo = classifyError(error);

    console.error('[CSVHandler] Error:', {
      type: errorInfo.type,
      technicalDetail: errorInfo.technicalDetail,
      retryable: errorInfo.retryable,
    });

    const retryHint = errorInfo.retryable ? ' Mozesz sprobowac ponownie.' : '';
    await telegram.sendError(chatId, `${errorInfo.userMessage}${retryHint}`);

    return c.json({ ok: false, error: errorInfo.type }, 500);
  }
}
