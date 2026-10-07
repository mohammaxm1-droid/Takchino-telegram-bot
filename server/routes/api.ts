import { Router } from 'express';
import { getDb, saveDb, addLog, getSetting, setSetting } from '../db/database.ts';
import { getSources, scrapeCustomUrl, fetchFeedFromSource, testFeedUrl } from '../sources/sourceManager.ts';
import { runPublishCycle, scheduleNextRun } from '../scheduler/scheduler.ts';
import { processArticleWithAI, testAiConnection, chatWithAiAssistant } from '../ai/aiEngine.ts';
import { publishPostToChannel, callTelegramApi } from '../telegram/telegramBot.ts';

export const apiRouter = Router();

// Dashboard Overview
apiRouter.get('/dashboard', async (req, res) => {
  try {
    const db = await getDb();
    const botToken = await getSetting('botToken', '');
    const channelUsername = await getSetting('channelUsername', '@ChiDidamTest');
    const activeAiProvider = await getSetting('activeAiProvider', 'groq');
    const groqModel = await getSetting('groqModel', 'openai/gpt-oss-120b');

    // Counts
    const publishedCountRes = db.exec("SELECT COUNT(*) FROM posts WHERE status = 'published';");
    const totalPublished = publishedCountRes[0]?.values[0]?.[0] || 0;

    const sourcesCountRes = db.exec("SELECT COUNT(*) FROM sources WHERE enabled = 1;");
    const activeSources = sourcesCountRes[0]?.values[0]?.[0] || 0;

    const totalArticlesRes = db.exec("SELECT COUNT(*) FROM articles;");
    const totalDiscovered = totalArticlesRes[0]?.values[0]?.[0] || 0;

    // Scheduler info
    const schedRes = db.exec("SELECT * FROM schedules LIMIT 1;");
    let scheduleInfo: any = {};
    if (schedRes.length > 0 && schedRes[0].values.length > 0) {
      schedRes[0].columns.forEach((c, idx) => (scheduleInfo[c] = schedRes[0].values[0][idx]));
    }

    // Recent posts
    const recentPostsRes = db.exec("SELECT * FROM posts ORDER BY createdAt DESC LIMIT 6;");
    const recentPosts: any[] = [];
    if (recentPostsRes.length > 0 && recentPostsRes[0].values) {
      const cols = recentPostsRes[0].columns;
      for (const row of recentPostsRes[0].values) {
        const item: any = {};
        cols.forEach((c, idx) => (item[c] = row[idx]));
        recentPosts.push(item);
      }
    }

    res.json({
      botStatus: botToken ? 'ONLINE' : 'CONFIG_REQUIRED',
      channelStatus: 'CONNECTED',
      channelUsername,
      aiStatus: 'ONLINE',
      activeAiProvider,
      activeAiModel: groqModel,
      totalPublished,
      activeSources,
      totalDiscovered,
      schedule: scheduleInfo,
      recentPosts
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Posts Management
apiRouter.get('/posts', async (req, res) => {
  try {
    const status = req.query.status as string;
    const db = await getDb();
    let query = 'SELECT * FROM posts ';
    if (status && status !== 'all') {
      query += `WHERE status = '${status}' `;
    }
    query += 'ORDER BY createdAt DESC LIMIT 50;';

    const postsRes = db.exec(query);
    const posts: any[] = [];
    if (postsRes.length > 0 && postsRes[0].values) {
      const cols = postsRes[0].columns;
      for (const row of postsRes[0].values) {
        const item: any = {};
        cols.forEach((c, idx) => (item[c] = row[idx]));
        posts.push(item);
      }
    }

    res.json({ posts });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.post('/posts/:id/publish', async (req, res) => {
  try {
    const { id } = req.params;
    const db = await getDb();
    const postRes = db.exec(`SELECT * FROM posts WHERE id = ?;`, [id]);
    if (postRes.length === 0 || postRes[0].values.length === 0) {
      return res.status(404).json({ error: 'پست یافت نشد' });
    }

    const cols = postRes[0].columns;
    const post: any = {};
    cols.forEach((c, idx) => (post[c] = postRes[0].values[0][idx]));

    const result = await publishPostToChannel(post);
    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    res.json({ success: true, messageId: result.messageId });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.post('/posts', async (req, res) => {
  try {
    const { title, hook, persianContent, hashtags, sourceUrl, imageUrl, status } = req.body;
    if (!persianContent) {
      return res.status(400).json({ error: 'متن پست الزامی است.' });
    }

    const db = await getDb();
    const id = 'post-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6);
    const nowStr = new Date().toISOString();

    db.run(
      `INSERT INTO posts 
      (id, title, hook, persianContent, hashtags, sourceUrl, imageUrl, status, qualityScore, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 9.0, ?);`,
      [
        id,
        title || 'پست سفارشی',
        hook || title || 'چی دیدم',
        persianContent,
        hashtags || '#چی_دیدم',
        sourceUrl || 'https://t.me/ChiDidamTest',
        imageUrl || null,
        status || 'draft',
        nowStr
      ]
    );
    saveDb();

    res.json({ success: true, id });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.put('/posts/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { title, hook, persianContent, hashtags, imageUrl, status } = req.body;
    const db = await getDb();

    db.run(
      `UPDATE posts SET 
        title = COALESCE(?, title),
        hook = COALESCE(?, hook),
        persianContent = COALESCE(?, persianContent),
        hashtags = COALESCE(?, hashtags),
        imageUrl = COALESCE(?, imageUrl),
        status = COALESCE(?, status)
      WHERE id = ?;`,
      [title || null, hook || null, persianContent || null, hashtags || null, imageUrl || null, status || null, id]
    );
    saveDb();

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.delete('/posts/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const db = await getDb();
    db.run(`DELETE FROM posts WHERE id = ?;`, [id]);
    saveDb();
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Sources Management
apiRouter.get('/sources', async (req, res) => {
  try {
    const sources = await getSources(false);
    res.json({ sources });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.post('/sources', async (req, res) => {
  try {
    const { name, url, rssUrl, category, priority } = req.body;
    if (!name || !url || !rssUrl) {
      return res.status(400).json({ error: 'نام، آدرس وبسایت و آدرس فید الزامی است.' });
    }

    const id = 'src-' + Date.now();
    const now = new Date().toISOString();
    const db = await getDb();

    db.run(
      `INSERT INTO sources (id, name, url, rssUrl, category, enabled, priority, createdAt)
       VALUES (?, ?, ?, ?, ?, 1, ?, ?);`,
      [id, name, url, rssUrl, category || 'تکنولوژی', priority || 4, now]
    );
    saveDb();

    await addLog('info', 'Source', `منبع جدید اضافه شد: ${name}`);
    res.json({ success: true, id });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.put('/sources/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { enabled, priority, name, category, rssUrl } = req.body;
    const db = await getDb();

    db.run(
      `UPDATE sources SET 
        enabled = COALESCE(?, enabled), 
        priority = COALESCE(?, priority),
        name = COALESCE(?, name),
        category = COALESCE(?, category),
        rssUrl = COALESCE(?, rssUrl)
      WHERE id = ?;`,
      [enabled !== undefined ? (enabled ? 1 : 0) : null, priority || null, name || null, category || null, rssUrl || null, id]
    );
    saveDb();

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.delete('/sources/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const db = await getDb();
    db.run(`DELETE FROM sources WHERE id = ?;`, [id]);
    saveDb();
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.post('/sources/test', async (req, res) => {
  try {
    const { rssUrl } = req.body;
    if (!rssUrl) {
      return res.status(400).json({ error: 'آدرس فید یا سایت الزامی است.' });
    }
    const testResult = await testFeedUrl(rssUrl);
    res.json(testResult);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.post('/sources/:id/toggle', async (req, res) => {
  try {
    const { id } = req.params;
    const db = await getDb();
    const curr = db.exec(`SELECT enabled FROM sources WHERE id = ?;`, [id]);
    if (curr.length === 0 || curr[0].values.length === 0) {
      return res.status(404).json({ error: 'منبع یافت نشد.' });
    }
    const currentVal = curr[0].values[0][0];
    const newVal = currentVal ? 0 : 1;
    db.run(`UPDATE sources SET enabled = ? WHERE id = ?;`, [newVal, id]);
    saveDb();
    res.json({ success: true, enabled: newVal === 1 });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.post('/sources/:id/test', async (req, res) => {
  try {
    const { id } = req.params;
    const db = await getDb();
    const srcRes = db.exec(`SELECT * FROM sources WHERE id = ?;`, [id]);
    if (srcRes.length === 0 || srcRes[0].values.length === 0) {
      return res.status(404).json({ error: 'منبع یافت نشد.' });
    }

    const cols = srcRes[0].columns;
    const source: any = {};
    cols.forEach((c, idx) => (source[c] = srcRes[0].values[0][idx]));

    const items = await fetchFeedFromSource(source);
    res.json({ success: true, count: items.length, sample: items.slice(0, 3) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Composer / Manual Studio Post Generator (Replaces old extract)
apiRouter.post('/composer/generate', async (req, res) => {
  try {
    const { topic, content, instructions, imageUrl, category } = req.body;
    if (!topic && !content) {
      return res.status(400).json({ error: 'موضوع یا متن اولیه برای تولید پست الزامی است.' });
    }

    const rawContent = {
      title: topic || 'پست جدید کانال چی دیدم',
      content: content || `درباره این موضوع جدیدترین نکات، ابزارهای مرتبط و کاربرد آن را تدوین کن: ${topic}`,
      url: 'https://t.me/ChiDidamTest',
      sourceName: 'استودیو اختصاصی ادمین',
      category: category || 'تکنولوژی و وب'
    };

    const processed = await processArticleWithAI(rawContent, instructions);

    res.json({
      success: true,
      preview: {
        ...processed,
        imageUrl: imageUrl || null
      }
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// AI Connection Tester
apiRouter.post('/ai/test', async (req, res) => {
  try {
    const { provider, apiKey, model, baseUrl } = req.body;
    const result = await testAiConnection({ provider, apiKey, model, baseUrl });
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ==========================================
// AI Chatbot Assistant & Live Channel Publisher
// ==========================================

// Get chat messages history
apiRouter.get('/chat/messages', async (req, res) => {
  try {
    const db = await getDb();
    const rows = db.exec("SELECT * FROM chat_messages ORDER BY createdAt ASC LIMIT 100;");
    const messages: any[] = [];
    if (rows.length > 0 && rows[0].values) {
      const cols = rows[0].columns;
      for (const row of rows[0].values) {
        const item: any = {};
        cols.forEach((c, idx) => (item[c] = row[idx]));
        if (item.postDataJson) {
          try {
            item.postData = JSON.parse(item.postDataJson);
          } catch {}
        }
        messages.push(item);
      }
    }
    res.json({ messages });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Send message to AI Chatbot
apiRouter.post('/chat', async (req, res) => {
  try {
    const { message, autoPublish = false, instructions } = req.body;
    if (!message || !message.trim()) {
      return res.status(400).json({ error: 'متن پیام یا دستور الزامی است.' });
    }

    const db = await getDb();

    // Fetch recent history
    const historyRows = db.exec("SELECT role, content FROM chat_messages ORDER BY createdAt DESC LIMIT 10;");
    const history: Array<{ role: 'user' | 'assistant'; content: string }> = [];
    if (historyRows.length > 0 && historyRows[0].values) {
      for (const r of historyRows[0].values.reverse()) {
        history.push({ role: r[0] as 'user' | 'assistant', content: String(r[1]) });
      }
    }

    // Save user message to DB
    const userMsgId = 'msg-' + Date.now() + '-u';
    const nowStr = new Date().toISOString();
    db.run(
      `INSERT INTO chat_messages (id, role, content, createdAt) VALUES (?, 'user', ?, ?);`,
      [userMsgId, message.trim(), nowStr]
    );
    saveDb();

    const lowerMsg = message.trim().toLowerCase();
    let handledCommand = false;
    let commandReply = '';
    let commandPostData: any = null;
    let shouldPublishCommand = false;

    // Command 1: «امروز چند پست منتشر شده؟» / آمار انتشار
    if (lowerMsg.includes('چند پست منتشر') || lowerMsg.includes('آمار امروز') || lowerMsg.includes('چند تا پست منتشر شده')) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const pubTodayRes = db.exec(`SELECT COUNT(*) FROM posts WHERE status = 'published' AND publishedAt >= '${today.toISOString()}';`);
      const countToday = (pubTodayRes[0]?.values[0]?.[0] as number) || 0;
      const allPubRes = db.exec("SELECT COUNT(*) FROM posts WHERE status = 'published';");
      const totalAll = (allPubRes[0]?.values[0]?.[0] as number) || 0;
      const draftRes = db.exec("SELECT COUNT(*) FROM posts WHERE status = 'draft';");
      const draftsCount = (draftRes[0]?.values[0]?.[0] as number) || 0;

      commandReply = `📊 <b>گزارش آمار پست‌های کانال چی دیدم:</b>\n\n• <b>پست‌های منتشر شده امروز:</b> ${countToday} پست\n• <b>کل پست‌های منتشر شده تا کنون:</b> ${totalAll} پست\n• <b>پست‌های موجود در صف پیش‌نویس:</b> ${draftsCount} مورد\n\nبرای انتشار پست جدید می‌توانید دستور بدهید یا انتشار خودکار را روشن بگذارید.`;
      handledCommand = true;
    }
    // Command 2: «انتشار خودکار را روشن کن»
    else if (lowerMsg.includes('انتشار خودکار را روشن کن') || lowerMsg.includes('اتوپابلیش را روشن کن') || lowerMsg.includes('سیستم را فعال کن')) {
      db.run("UPDATE schedules SET isAutoActive = 1, approvalMode = 'auto';");
      saveDb();
      await scheduleNextRun();
      await addLog('info', 'Chatbot', 'انتشار خودکار از طریق دستور چت‌بات روشن شد.');
      commandReply = '🟢 <b>انتشار خودکار با موفقیت فعال شد!</b>\n\nسیستم هم‌اکنون در وضعیت انتشار مستقیم قرار دارد و طبق زمان‌بندی مطالب تایید شده را مستقیماً در کانال تلگرام منتشر خواهد کرد.';
      handledCommand = true;
    }
    // Command 3: «انتشار خودکار را خاموش کن» / متوقف کن
    else if (lowerMsg.includes('انتشار خودکار را خاموش کن') || lowerMsg.includes('اتوپابلیش را خاموش کن') || lowerMsg.includes('انتشار خودکار را متوقف کن')) {
      db.run("UPDATE schedules SET isAutoActive = 0;");
      saveDb();
      await addLog('info', 'Chatbot', 'انتشار خودکار از طریق دستور چت‌بات متوقف شد.');
      commandReply = '⏸ <b>انتشار خودکار متوقف شد.</b>\n\nهیچ پستی به صورت خودکار در کانال ارسال نخواهد شد تا زمانی که مجدداً آن را فعال کنید.';
      handledCommand = true;
    }
    // Command 4: «منابع فعال را نشان بده»
    else if (lowerMsg.includes('منابع فعال را نشان بده') || lowerMsg.includes('لیست منابع') || lowerMsg.includes('منابع رو نشون بده')) {
      const srcRows = db.exec("SELECT name, category, priority, url FROM sources WHERE enabled = 1 ORDER BY priority DESC;");
      const listItems: string[] = [];
      if (srcRows.length > 0 && srcRows[0].values) {
        for (const s of srcRows[0].values) {
          listItems.push(`• <b>${s[0]}</b> (${s[1]}) - اولویت ${s[2]}`);
        }
      }
      commandReply = `🌐 <b>فهرست منابع فعال سیستم (${listItems.length} منبع معتبر):</b>\n\n${listItems.slice(0, 15).join('\n')}\n\nتمامی این منابع به طور منظم پایش می‌شوند.`;
      handledCommand = true;
    }
    // Command 5: «آخرین خطاها را بررسی کن» / لاگ خطاها
    else if (lowerMsg.includes('آخرین خطاها') || lowerMsg.includes('بررسی خطاها') || lowerMsg.includes('خطاهای اخیر')) {
      const errRows = db.exec("SELECT category, message, timestamp FROM logs WHERE level = 'error' ORDER BY timestamp DESC LIMIT 5;");
      if (errRows.length > 0 && errRows[0].values && errRows[0].values.length > 0) {
        const errList = errRows[0].values.map((e) => `⚠️ [${e[0]}] ${e[1]}`).join('\n');
        commandReply = `📋 <b>آخرین خطاهای ثبت‌شده در سیستم:</b>\n\n${errList}`;
      } else {
        commandReply = '✅ <b>هیچ خطایی در لاگ‌های اخیر سیستم ثبت نشده است!</b> همه‌چیز در وضعیت پایدار و سلامت کار می‌کند.';
      }
      handledCommand = true;
    }
    // Command 6: «پست‌های صف را نشان بده»
    else if (lowerMsg.includes('پست‌های صف') || lowerMsg.includes('پیش‌نویس‌ها را نشان بده') || lowerMsg.includes('صف انتشار')) {
      const draftRows = db.exec("SELECT title, createdAt FROM posts WHERE status = 'draft' ORDER BY createdAt DESC LIMIT 5;");
      if (draftRows.length > 0 && draftRows[0].values && draftRows[0].values.length > 0) {
        const dList = draftRows[0].values.map((d, i) => `${i + 1}. <b>${d[0]}</b>`).join('\n');
        commandReply = `📝 <b>پست‌های موجود در صف پیش‌نویس:</b>\n\n${dList}\n\nمی‌توانید در تب «پست‌ها و پیش‌نویس‌ها» یا همینجا با صدور دستور آن‌ها را منتشر کنید.`;
      } else {
        commandReply = '📭 <b>در حال حاضر هیچ پستی در صف پیش‌نویس نیست.</b> می‌توانید دستور دهید: «الان ۳ پست جدید پیدا کن» تا مطالب تازه استخراج شوند.';
      }
      handledCommand = true;
    }
    // Command 7: «الان ۳ پست جدید پیدا کن» / کشف آنی مطالب
    else if (
      lowerMsg.includes('پست جدید پیدا کن') ||
      lowerMsg.includes('اخبار ai را بررسی کن') ||
      lowerMsg.includes('اخبار جدید را پیدا کن') ||
      lowerMsg.includes('مطالب جدید رو پیدا کن')
    ) {
      await addLog('info', 'Chatbot', 'دستور کشف آنی مطالب توسط چت‌بات اجرا شد.');
      const candidates = await runPublishCycle('manual');
      if (candidates.success && candidates.post) {
        commandReply = `🎯 <b>مطلب جدید با موفقیت کشف و تدوین شد:</b>\n\n«${candidates.post.title}»\n\nاین مطلب بر اساس داغ‌ترین ترند منابع معتبر انتخاب شد.`;
        if (candidates.post.persianContent) {
          commandPostData = {
            title: candidates.post.title,
            hook: `😳 ${candidates.post.title}`,
            persianContent: candidates.post.persianContent,
            hashtags: ['#چی_دیدم', '#هوش_مصنوعی', '#تکنولوژی'],
            category: 'هوش مصنوعی و تکنولوژی'
          };
        }
      } else {
        commandReply = '🔎 منابع پایش شدند؛ در این لحظه مطلب جدیدی با نمره کیفی بالاتر از حداقل امتیاز یافت نشد. کمی بعد دوباره بررسی خواهم کرد.';
      }
      handledCommand = true;
    }
    // Command 8: «این لینک را تبدیل به پست کن» / پردازش لینک خارجی
    else if (message.includes('http://') || message.includes('https://')) {
      const urlMatch = message.match(/https?:\/\/[^\s]+/i);
      if (urlMatch && urlMatch[0]) {
        const targetUrl = urlMatch[0];
        try {
          await addLog('info', 'Chatbot', `در حال استخراج و تبدیل لینک به پست: ${targetUrl}`);
          const scraped = await scrapeCustomUrl(targetUrl);
          const localized = await processArticleWithAI({
            title: scraped.title,
            content: scraped.content || scraped.summary,
            url: targetUrl,
            sourceName: scraped.sourceName,
            category: scraped.sourceCategory
          });

          commandReply = `🔗 <b>لینک مورد نظر با موفقیت استخراج و به پست آماده تلگرام تبدیل شد:</b>\n\n«${localized.title}»`;
          commandPostData = {
            title: localized.title,
            hook: localized.hook,
            persianContent: localized.fullTelegramPost,
            hashtags: localized.hashtags,
            category: localized.category
          };
          handledCommand = true;
        } catch (linkErr: any) {
          commandReply = `⚠️ خطا در استخراج لینک: ${linkErr.message}. لطفاً از در دسترس بودن آدرس اطمینان حاصل فرمایید.`;
          handledCommand = true;
        }
      }
    }

    let aiResult: any;

    if (handledCommand) {
      aiResult = {
        reply: commandReply,
        postData: commandPostData,
        shouldPublishNow: shouldPublishCommand
      };
    } else {
      // Call AI assistant for conversational post synthesis
      aiResult = await chatWithAiAssistant({
        message: message.trim(),
        history,
        autoPublishCommand: Boolean(autoPublish),
        instructions
      });
    }

    let publishedMessageId: number | undefined;
    let autoPublishedPostId: string | undefined;

    // Check if auto-publish to Telegram channel was requested
    if (aiResult.shouldPublishNow && aiResult.postData) {
      try {
        const pubPostId = 'post-' + Date.now() + '-chat';
        const pubResult = await publishPostToChannel({
          id: pubPostId,
          title: aiResult.postData.title,
          hook: aiResult.postData.hook,
          persianContent: aiResult.postData.persianContent,
          sourceUrl: 'https://t.me/ChiDidamTest',
          category: aiResult.postData.category
        });

        if (pubResult.success) {
          publishedMessageId = pubResult.messageId;
          autoPublishedPostId = pubPostId;
          aiResult.reply += `\n\n🚀 <b>این پست بلافاصله در کانال منتشر شد!</b> (شناسه تلگرام: <code>${pubResult.messageId}</code>)`;
          await addLog('publish', 'Chatbot', `پست تولید شده توسط چت‌بات در کانال منتشر شد: ${aiResult.postData.title}`);
        } else {
          aiResult.reply += `\n\n⚠️ تلاش برای انتشار خودکار با خطا مواجه شد: ${pubResult.error} (می‌توانید با دکمه زیر به صورت دستی منتشر کنید)`;
        }
      } catch (pubErr: any) {
        aiResult.reply += `\n\n⚠️ خطا در ارسال خودکار به تلگرام: ${pubErr.message}`;
      }
    }

    // Save assistant response to DB
    const assistantMsgId = 'msg-' + (Date.now() + 1) + '-a';
    const postDataJson = aiResult.postData ? JSON.stringify(aiResult.postData) : null;
    db.run(
      `INSERT INTO chat_messages (id, role, content, postDataJson, publishedMessageId, createdAt) VALUES (?, 'assistant', ?, ?, ?, ?);`,
      [assistantMsgId, aiResult.reply, postDataJson, publishedMessageId || null, new Date().toISOString()]
    );
    saveDb();

    res.json({
      success: true,
      userMessageId: userMsgId,
      assistantMessageId: assistantMsgId,
      reply: aiResult.reply,
      postData: aiResult.postData,
      shouldPublishNow: aiResult.shouldPublishNow,
      publishedMessageId,
      autoPublishedPostId
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Instant 1-Click Publish from Chat Preview
apiRouter.post('/chat/publish-instant', async (req, res) => {
  try {
    const { post, chatMessageId } = req.body;
    if (!post || !post.persianContent) {
      return res.status(400).json({ error: 'محتوای پست برای انتشار نامعتبر است.' });
    }

    const db = await getDb();
    const postId = 'post-' + Date.now() + '-chat';
    const nowStr = new Date().toISOString();
    const tags = Array.isArray(post.hashtags) ? post.hashtags.join(' ') : (post.hashtags || '#چی_دیدم');

    // Create record in posts table first
    db.run(
      `INSERT INTO posts (id, title, hook, persianContent, hashtags, sourceUrl, status, qualityScore, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, 'draft', 9.5, ?);`,
      [
        postId,
        post.title || 'پست اختصاصی چت‌بات',
        post.hook || '😳 چی دیدم',
        post.persianContent,
        tags,
        'https://t.me/ChiDidamTest',
        nowStr
      ]
    );
    saveDb();

    // Publish to Telegram Channel
    const pubResult = await publishPostToChannel({
      id: postId,
      title: post.title || 'پست اختصاصی چت‌بات',
      hook: post.hook,
      persianContent: post.persianContent,
      sourceUrl: 'https://t.me/ChiDidamTest',
      category: post.category
    });

    if (!pubResult.success) {
      return res.status(400).json({ error: pubResult.error || 'خطا در ارسال به کانال' });
    }

    // Update chat_messages if chatMessageId provided
    if (chatMessageId) {
      db.run(`UPDATE chat_messages SET publishedMessageId = ? WHERE id = ?;`, [pubResult.messageId || 0, chatMessageId]);
      saveDb();
    }

    res.json({
      success: true,
      messageId: pubResult.messageId,
      postId,
      message: 'پست با موفقیت در کانال منتشر شد.'
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Save Post to Drafts from Chat Preview
apiRouter.post('/chat/save-draft', async (req, res) => {
  try {
    const { post } = req.body;
    if (!post || !post.persianContent) {
      return res.status(400).json({ error: 'محتوای پست نامعتبر است.' });
    }

    const db = await getDb();
    const postId = 'post-' + Date.now() + '-chat';
    const nowStr = new Date().toISOString();
    const tags = Array.isArray(post.hashtags) ? post.hashtags.join(' ') : (post.hashtags || '#چی_دیدم');

    db.run(
      `INSERT INTO posts (id, title, hook, persianContent, hashtags, sourceUrl, status, qualityScore, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, 'draft', 9.0, ?);`,
      [
        postId,
        post.title || 'پیش‌نویس چت‌بات',
        post.hook || '😳 چی دیدم',
        post.persianContent,
        tags,
        'https://t.me/ChiDidamTest',
        nowStr
      ]
    );
    saveDb();

    await addLog('info', 'Chatbot', `پست چت‌بات با عنوان «${post.title}» در پیش‌نویس‌ها ذخیره شد.`);
    res.json({ success: true, postId, message: 'پست با موفقیت در پیش‌نویس‌ها ذخیره شد.' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Clear Chat Messages
apiRouter.delete('/chat/messages', async (req, res) => {
  try {
    const db = await getDb();
    db.run("DELETE FROM chat_messages;");
    saveDb();
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Scheduler Control
apiRouter.get('/scheduler', async (req, res) => {
  try {
    const db = await getDb();
    const schedRes = db.exec("SELECT * FROM schedules LIMIT 1;");
    const sched: any = {};
    if (schedRes.length > 0 && schedRes[0].values.length > 0) {
      schedRes[0].columns.forEach((c, idx) => (sched[c] = schedRes[0].values[0][idx]));
    }
    res.json({ schedule: sched });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.post('/scheduler', async (req, res) => {
  try {
    const {
      isAutoActive,
      intervalUnit,
      intervalValue,
      intervalMinutes,
      activeDays,
      quietHoursStart,
      quietHoursEnd,
      dailyLimit,
      approvalMode,
      scheduleMode,
      specificTimesJson,
      randomDelayMinutes,
      timezone
    } = req.body;

    const db = await getDb();

    const activeDaysJson = activeDays !== undefined
      ? (typeof activeDays === 'string' ? activeDays : JSON.stringify(activeDays))
      : null;

    const specTimes = specificTimesJson !== undefined
      ? (typeof specificTimesJson === 'string' ? specificTimesJson : JSON.stringify(specificTimesJson))
      : null;

    db.run(
      `UPDATE schedules SET 
        isAutoActive = COALESCE(?, isAutoActive),
        intervalUnit = COALESCE(?, intervalUnit),
        intervalValue = COALESCE(?, intervalValue),
        intervalMinutes = COALESCE(?, intervalMinutes),
        activeDaysJson = COALESCE(?, activeDaysJson),
        quietHoursStart = COALESCE(?, quietHoursStart),
        quietHoursEnd = COALESCE(?, quietHoursEnd),
        dailyLimit = COALESCE(?, dailyLimit),
        approvalMode = COALESCE(?, approvalMode),
        scheduleMode = COALESCE(?, scheduleMode),
        specificTimesJson = COALESCE(?, specificTimesJson),
        randomDelayMinutes = COALESCE(?, randomDelayMinutes),
        timezone = COALESCE(?, timezone);`,
      [
        isAutoActive !== undefined ? (isAutoActive ? 1 : 0) : null,
        intervalUnit || null,
        intervalValue !== undefined ? Number(intervalValue) : null,
        intervalMinutes !== undefined ? Number(intervalMinutes) : null,
        activeDaysJson,
        quietHoursStart || null,
        quietHoursEnd || null,
        dailyLimit !== undefined ? Number(dailyLimit) : null,
        approvalMode || null,
        scheduleMode || null,
        specTimes,
        randomDelayMinutes !== undefined ? Number(randomDelayMinutes) : null,
        timezone || null
      ]
    );
    saveDb();

    await scheduleNextRun();
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Telegram Live Status & Verification
apiRouter.get('/telegram/status', async (req, res) => {
  try {
    const channel = await getSetting('channelUsername', '@ChiDidamTest');
    const token = await getSetting('botToken', '');
    if (!token) {
      return res.json({ connected: false, error: 'توکن ربات تنظیم نشده است' });
    }

    const botInfo = await callTelegramApi('getMe', {});
    let chatInfo: any = null;
    let memberCount: number | null = null;
    let error: string | null = null;

    try {
      chatInfo = await callTelegramApi('getChat', { chat_id: channel });
      try {
        memberCount = await callTelegramApi('getChatMemberCount', { chat_id: channel });
      } catch {}
    } catch (chatErr: any) {
      error = chatErr.message;
    }

    res.json({
      connected: true,
      bot: {
        id: botInfo.id,
        firstName: botInfo.first_name,
        username: botInfo.username
      },
      channel: chatInfo
        ? {
            id: chatInfo.id,
            title: chatInfo.title,
            username: chatInfo.username ? `@${chatInfo.username}` : channel,
            type: chatInfo.type,
            description: chatInfo.description,
            memberCount
          }
        : null,
      error
    });
  } catch (err: any) {
    res.json({ connected: false, error: err.message });
  }
});

// Trigger Cycle Now (/post_now)
apiRouter.post('/scheduler/trigger', async (req, res) => {
  try {
    const result = await runPublishCycle('manual');
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Settings Management
apiRouter.get('/settings', async (req, res) => {
  try {
    const db = await getDb();
    const rows = db.exec("SELECT key, value FROM settings;");
    const settings: Record<string, string> = {};
    if (rows.length > 0 && rows[0].values) {
      for (const row of rows[0].values) {
        settings[String(row[0])] = String(row[1]);
      }
    }
    res.json({ settings });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.post('/settings', async (req, res) => {
  try {
    const newSettings = req.body;
    for (const [key, value] of Object.entries(newSettings)) {
      if (typeof value === 'object') {
        await setSetting(key, JSON.stringify(value));
      } else {
        await setSetting(key, String(value));
      }
    }
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Live Test Bot & Channel Connection (Verified without publishing dummy posts to channel)
apiRouter.post('/test/publish', async (req, res) => {
  try {
    const channel = await getSetting('channelUsername', '@ChiDidamTest');
    const token = await getSetting('botToken', '');
    if (!token) {
      return res.status(400).json({ error: 'توکن ربات تنظیم نشده است' });
    }
    const chatRes = await callTelegramApi('getChat', { chat_id: channel });
    const botInfo = await callTelegramApi('getMe', {});

    await addLog('info', 'Bot', `بررسی اتصال بات و کانال با موفقیت تأیید شد: ${chatRes.title} (${channel})`);

    res.json({
      success: true,
      botUsername: botInfo.username,
      channelTitle: chatRes.title,
      channelId: chatRes.id,
      message: 'اتصال ربات و کانال کاملاً تأیید شد. هیچ پست تستی به کانال ارسال نشد.'
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Logs
apiRouter.get('/logs', async (req, res) => {
  try {
    const db = await getDb();
    const rows = db.exec("SELECT * FROM logs ORDER BY timestamp DESC LIMIT 60;");
    const logs: any[] = [];
    if (rows.length > 0 && rows[0].values) {
      const cols = rows[0].columns;
      for (const row of rows[0].values) {
        const item: any = {};
        cols.forEach((c, idx) => (item[c] = row[idx]));
        logs.push(item);
      }
    }
    res.json({ logs });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Catch-all for unknown /api/* routes - guarantees JSON response, never HTML!
apiRouter.use((req, res) => {
  res.status(404).json({
    ok: false,
    error: `مسیر API درخواستی یافت نشد: ${req.method} ${req.originalUrl}`
  });
});

