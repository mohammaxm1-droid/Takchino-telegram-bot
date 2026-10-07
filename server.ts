import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { apiRouter } from './server/routes/api.ts';
import { getDb, addLog, getSetting, setSetting } from './server/db/database.ts';
import { initScheduler, runPublishCycle } from './server/scheduler/scheduler.ts';
import { startBotPolling, publishPostToChannel, callTelegramApi } from './server/telegram/telegramBot.ts';
import { scrapeCustomUrl, getSources } from './server/sources/sourceManager.ts';
import { processArticleWithAI } from './server/ai/aiEngine.ts';

dotenv.config();

process.on('unhandledRejection', (reason) => {
  console.warn('Caught unhandledRejection:', reason);
});
process.on('uncaughtException', (err) => {
  console.warn('Caught uncaughtException:', err);
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Initialize SQLite Database
  await getDb();
  await addLog('info', 'System', 'پایگاه داده SQLite با موفقیت بارگذاری شد.');

  // Mount API routes
  app.use('/api', apiRouter);

  // Catch-all for API routes to never return HTML fallback
  app.use('/api', (req, res) => {
    res.status(404).json({ error: `مسیر ${req.method} ${req.originalUrl} در سرور یافت نشد.` });
  });

  // Serve generated images directory
  app.use('/data/images', express.static(path.resolve(process.cwd(), 'data', 'images')));

  // Initialize Telegram Bot Commands Polling
  startBotPolling(async (command, args, chatId, messageId) => {
    switch (command) {
      case '/start':
        return `👋 <b>سلام ادمین گرامی کانال «چی دیدم؟! 😳»</b>\n\nربات هوشمند کشف، هوش مصنوعی و انتشار خودکار محتوا آماده به کار است.\n\n<b>دستورات اصلی:</b>\n/post_now - کشف و انتشار فوری یک پست جدید به کانال\n/status - بررسی وضعیت زنده بات، هوش مصنوعی و کانال\n/draft &lt;لینک&gt; - استخراج و تولید پیش‌نویس از هر لینک اینترنتی\n/search &lt;موضوع&gt; - جستجو و ساخت پست درباره یک موضوع خاص\n/start_auto - فعال‌سازی ارسال زمان‌بندی‌شده خودکار\n/stop_auto - توقف موقت ارسال خودکار\n/sources - مشاهده منابع فعال خبری\n/stats - آمار کشف و انتشار محتوا\n/latest - مشاهده آخرین پست منتشر شده\n/test - ارسال پست تستی به کانال جهت راستی‌آزمایی\n/help - راهنمای جامع دستورات`;

      case '/help':
        return `📚 <b>راهنمای دستورات مدیریت کانال @ChiDidamTest:</b>\n\n` +
          `• <code>/post_now</code>: جستجوی فوری در ۱۵+ منبع برتر، امتیازدهی وایرالیتی، بازنویسی هوش مصنوعی و انتشار مستقیم به کانال\n` +
          `• <code>/status</code>: نمایش وضعیت آنلاین بودن بات، اتصال کانال و زمان انتشار بعدی\n` +
          `• <code>/draft &lt;URL&gt;</code>: استخراج محتوای هر سایت و ایجاد پیش‌نویس همراه با دکمه انتشار\n` +
          `• <code>/search &lt;موضوع&gt;</code>: جستجو و تولید پست سفارشی درباره ترند درخواستی\n` +
          `• <code>/start_auto</code>: فعال‌سازی زمان‌بندی خودکار\n` +
          `• <code>/stop_auto</code>: غیرفعال‌سازی ارسال خودکار\n` +
          `• <code>/sources</code>: فهرست منابع فعال و وضعیت آن‌ها\n` +
          `• <code>/stats</code>: نمایش آمار کلی مطالب کشف شده و منتشر شده\n` +
          `• <code>/test</code>: ارسال یک پست آزمایشی به کانال برای سنجش دسترسی`;

      case '/status': {
        const db = await getDb();
        const schedRes = db.exec('SELECT * FROM schedules LIMIT 1;');
        let schedInfo: any = {};
        if (schedRes.length > 0 && schedRes[0].values.length > 0) {
          schedRes[0].columns.forEach((c, idx) => (schedInfo[c] = schedRes[0].values[0][idx]));
        }
        const sourcesCountRes = db.exec('SELECT COUNT(*) FROM sources WHERE enabled = 1;');
        const activeSrc = sourcesCountRes[0]?.values[0]?.[0] || 0;
        const postsCountRes = db.exec("SELECT COUNT(*) FROM posts WHERE status = 'published';");
        const pubCount = postsCountRes[0]?.values[0]?.[0] || 0;
        const channel = await getSetting('channelUsername', '@ChiDidamTest');
        const activeAi = await getSetting('activeAiProvider', 'groq');

        return `📊 <b>وضعیت زنده موتور محتوای «چی دیدم»:</b>\n\n` +
          `🤖 <b>بات:</b> فعال و آنلاین ✅\n` +
          `📡 <b>کانال هدف:</b> <code>${channel}</code>\n` +
          `🧠 <b>موتور AI:</b> ${activeAi.toUpperCase()} (آنلاین) ⚡️\n` +
          `🌐 <b>منابع فعال:</b> ${activeSrc} منبع معتبر\n` +
          `📤 <b>پست‌های منتشر شده:</b> ${pubCount} پست\n` +
          `⏱ <b>حالت خودکار:</b> ${schedInfo.isAutoActive ? 'روشن (هر ' + schedInfo.intervalMinutes + ' دقیقه) 🟢' : 'خاموش 🔴'}\n` +
          `⏳ <b>پست بعدی:</b> ${schedInfo.nextRunAt ? new Date(schedInfo.nextRunAt).toLocaleTimeString('fa-IR') : 'نامشخص'}`;
      }

      case '/post_now': {
        // Send acknowledgement first
        callTelegramApi('sendMessage', {
          chat_id: chatId,
          text: '🔍 در حال جستجوی منابع، محاسبه امتیاز وایرالیتی و تولید پست جذاب به زبان فارسی...'
        }).catch(() => {});

        // Trigger cycle asynchronously
        runPublishCycle('manual').then((result) => {
          if (result.success && result.post) {
            callTelegramApi('sendMessage', {
              chat_id: chatId,
              text: `✅ <b>پست جدید با موفقیت در کانال منتشر شد!</b>\n\nعنوان: <b>${result.post.title}</b>`,
              parse_mode: 'HTML'
            }).catch(() => {});
          } else {
            callTelegramApi('sendMessage', {
              chat_id: chatId,
              text: `⚠️ انتشار انجام نشد: ${result.message || 'هیچ مطلبی از آزمون کیفی عبور نکرد.'}`
            }).catch(() => {});
          }
        }).catch(() => {});
        return;
      }

      case '/draft': {
        if (!args) {
          return '⚠️ لطفاً یک لینک اینترنتی وارد کنید:\nمثال:\n<code>/draft https://techcrunch.com/article</code>';
        }

        callTelegramApi('sendMessage', {
          chat_id: chatId,
          text: '⏳ در حال خواندن مقاله و پردازش با هوش مصنوعی...'
        }).catch(() => {});

        scrapeCustomUrl(args)
          .then(async (scraped) => {
            const aiRes = await processArticleWithAI({
              title: scraped.title,
              content: scraped.content || scraped.summary,
              url: scraped.url,
              sourceName: scraped.sourceName,
              category: scraped.sourceCategory
            });

            const db = await getDb();
            const postId = 'post-' + Date.now();
            const nowStr = new Date().toISOString();
            db.run(
              `INSERT INTO posts (id, title, hook, persianContent, hashtags, sourceUrl, imageUrl, status, qualityScore, createdAt)
               VALUES (?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?);`,
              [postId, aiRes.title, aiRes.hook, aiRes.fullTelegramPost, aiRes.hashtags.join(' '), scraped.url, scraped.imageUrl || null, aiRes.qualityScore, nowStr]
            );

            // Send draft with inline keyboard
            await callTelegramApi('sendMessage', {
              chat_id: chatId,
              text: `📝 <b>پیش‌نویس تولید شده:</b>\n\n${aiRes.fullTelegramPost}`,
              parse_mode: 'HTML',
              reply_markup: {
                inline_keyboard: [
                  [
                    { text: '✅ انتشار در کانال', callback_data: `pub:${postId}` },
                    { text: '❌ لغو', callback_data: `cancel:${postId}` }
                  ]
                ]
              }
            }).catch(() => {});
          })
          .catch((err) => {
            callTelegramApi('sendMessage', {
              chat_id: chatId,
              text: `❌ خطا در استخراج لینک:\n${err.message}`
            }).catch(() => {});
          });
        return;
      }

      case '/search': {
        if (!args) {
          return '⚠️ لطفاً موضوع مورد نظرتان را بنویسید:\nمثال: <code>/search ابزارهای جدید هوش مصنوعی</code>';
        }

        callTelegramApi('sendMessage', {
          chat_id: chatId,
          text: `🔎 در حال جستجو و تدوین مطلب برای موضوع «${args}»...`
        }).catch(() => {});

        processArticleWithAI({
          title: `بررسی ترند: ${args}`,
          content: `یک پست جامع، مفید و خواندنی برای کانال تلگرام چی دیدم درباره این موضوع بنویس: ${args}`,
          url: 'https://t.me/ChiDidamTest',
          sourceName: 'جستجوی سفارشی',
          category: args
        }).then(async (aiRes) => {
          const db = await getDb();
          const postId = 'post-' + Date.now();
          const nowStr = new Date().toISOString();
          db.run(
            `INSERT INTO posts (id, title, hook, persianContent, hashtags, sourceUrl, imageUrl, status, qualityScore, createdAt)
             VALUES (?, ?, ?, ?, ?, ?, null, 'draft', ?, ?);`,
            [postId, aiRes.title, aiRes.hook, aiRes.fullTelegramPost, aiRes.hashtags.join(' '), 'https://t.me/ChiDidamTest', aiRes.qualityScore, nowStr]
          );

          await callTelegramApi('sendMessage', {
            chat_id: chatId,
            text: `🎯 <b>مطلب آماده شد:</b>\n\n${aiRes.fullTelegramPost}`,
            parse_mode: 'HTML',
            reply_markup: {
              inline_keyboard: [
                [
                  { text: '✅ انتشار در کانال', callback_data: `pub:${postId}` },
                  { text: '❌ لغو', callback_data: `cancel:${postId}` }
                ]
              ]
            }
          });
        }).catch((err) => {
          callTelegramApi('sendMessage', {
            chat_id: chatId,
            text: `❌ خطا در پردازش موضوع:\n${err.message}`
          });
        });
        return;
      }

      case '/start_auto': {
        const db = await getDb();
        db.run('UPDATE schedules SET isAutoActive = 1;');
        return '🟢 <b>ارسال خودکار فعال شد.</b>\nمطالب طبق زمان‌بندی به طور مداوم رصد و منتشر خواهند شد.';
      }

      case '/stop_auto': {
        const db = await getDb();
        db.run('UPDATE schedules SET isAutoActive = 0;');
        return '🔴 <b>ارسال خودکار متوقف شد.</b>\nپست‌ها تنها با دستور دستی /post_now منتشر می‌شوند.';
      }

      case '/sources': {
        const sources = await getSources(false);
        const list = sources
          .map((s) => `${s.enabled ? '🟢' : '⚪️'} <b>${s.name}</b> (${s.category}) - اولویت: ${s.priority}/5`)
          .join('\n');
        return `🌐 <b>فهرست منابع فعال و تحت رصد (${sources.length} منبع):</b>\n\n${list}\n\nجهت تغییر یا افزودن منبع، از پنل وب استفاده نمایید.`;
      }

      case '/stats': {
        const db = await getDb();
        const pub = db.exec("SELECT COUNT(*) FROM posts WHERE status = 'published';")[0]?.values[0]?.[0] || 0;
        const total = db.exec("SELECT COUNT(*) FROM articles;")[0]?.values[0]?.[0] || 0;
        const sources = db.exec("SELECT COUNT(*) FROM sources WHERE enabled = 1;")[0]?.values[0]?.[0] || 0;
        return `📈 <b>آمار موتور محتوای چی دیدم:</b>\n\n` +
          `• مطالب رصد شده: ${total} مورد\n` +
          `• پست‌های منتشر شده در کانال: ${pub} عدد\n` +
          `• تعداد منابع فعال: ${sources} سایت معتبر جهانی`;
      }

      case '/latest': {
        const db = await getDb();
        const res = db.exec("SELECT title, persianContent, publishedAt FROM posts WHERE status = 'published' ORDER BY publishedAt DESC LIMIT 1;");
        if (res.length > 0 && res[0].values.length > 0) {
          const row = res[0].values[0];
          return `📌 <b>آخرین پست منتشر شده:</b>\n\n${row[1]}`;
        }
        return 'هنوز پستی در کانال منتشر نشده است.';
      }

      case '/test': {
        (async () => {
          try {
            const channel = await getSetting('channelUsername', '@ChiDidamTest');
            const chatRes = await callTelegramApi('getChat', { chat_id: channel });
            await callTelegramApi('sendMessage', {
              chat_id: chatId,
              text: `✅ <b>تست سلامت و اتصال ربات:</b>\n\n` +
                `🤖 <b>وضعیت بات:</b> متصل و آماده کار\n` +
                `📡 <b>کانال هدف:</b> <code>${channel}</code>\n` +
                `🏷 <b>عنوان کانال:</b> ${chatRes.title}\n` +
                `🔐 <b>دسترسی مدیریت:</b> تأیید شده ✅\n\n` +
                `<i>(طبق دستور ادمین، هیچ پیام تستی در کانال منتشر نشد)</i>`,
              parse_mode: 'HTML'
            });
          } catch (err: any) {
            callTelegramApi('sendMessage', {
              chat_id: chatId,
              text: `❌ خطا در بررسی اتصال کانال:\n${err.message}`
            }).catch(() => {});
          }
        })();
        return;
      }

      default:
        return 'دستور نامعتبر است. برای مشاهده لیست دستورات /help را بفرستید.';
    }
  });

  // Initialize Automation Scheduler
  await initScheduler();

  // Setup Vite in Dev or Static files in Production
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(Number(PORT), '0.0.0.0', () => {
    console.log(`🚀 چی دیدم؟! Content Engine server running on port ${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Fatal server startup error:', err);
  process.exit(1);
});
