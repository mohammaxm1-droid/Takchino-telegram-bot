import { getDb, saveDb, addLog, getSetting, setSetting, PostRow } from '../db/database.ts';
import { runDiscoveryCycle, ScoredCandidate } from '../discovery/discoveryEngine.ts';
import { processArticleWithAI } from '../ai/aiEngine.ts';
import { publishPostToChannel } from '../telegram/telegramBot.ts';
import { fetchArticleOpenGraphImage } from '../sources/sourceManager.ts';

let schedulerTimer: NodeJS.Timeout | null = null;
let isCycleRunning = false;
let testCycleCount = 0;

export async function initScheduler(): Promise<void> {
  const db = await getDb();
  
  // Calculate next run time
  await scheduleNextRun();

  // Tick checker every 10 seconds for high precision
  if (schedulerTimer) clearInterval(schedulerTimer);
  schedulerTimer = setInterval(async () => {
    try {
      await checkAndRunScheduledCycle();
    } catch (err: any) {
      console.error('Scheduler check error:', err);
    }
  }, 10 * 1000);

  await addLog('info', 'Scheduler', 'زمان‌بند خودکار دقیق (ثانیه/دقیقه/ساعت/روز) با موفقیت فعال شد.');
}

export async function scheduleNextRun(): Promise<void> {
  const db = await getDb();
  const schedRes = db.exec('SELECT * FROM schedules LIMIT 1;');
  if (schedRes.length === 0 || schedRes[0].values.length === 0) return;

  const cols = schedRes[0].columns;
  const row = schedRes[0].values[0];
  const sched: any = {};
  cols.forEach((c, idx) => (sched[c] = row[idx]));

  const mode = sched.scheduleMode || 'interval';
  const now = new Date();
  let nextDate: Date;

  if (mode === 'specific_times') {
    // Specific time slots mode
    let slots: string[] = ['09:30', '13:00', '17:30', '21:00'];
    if (sched.specificTimesJson) {
      try {
        const parsed = JSON.parse(sched.specificTimesJson);
        if (Array.isArray(parsed) && parsed.length > 0) slots = parsed;
      } catch {}
    }
    slots.sort();

    // Find the next slot today
    let foundSlot: Date | null = null;
    for (const slot of slots) {
      const [h, m] = slot.split(':').map(Number);
      const slotCandidate = new Date(now);
      slotCandidate.setHours(h, m, 0, 0);
      if (slotCandidate.getTime() > now.getTime() + 10000) {
        foundSlot = slotCandidate;
        break;
      }
    }

    if (!foundSlot) {
      // Pick first slot of tomorrow
      const [firstH, firstM] = slots[0].split(':').map(Number);
      foundSlot = new Date(now);
      foundSlot.setDate(foundSlot.getDate() + 1);
      foundSlot.setHours(firstH, firstM, 0, 0);
    }
    nextDate = foundSlot;
  } else {
    // Interval mode
    const unit = sched.intervalUnit || 'minutes';
    const val = Number(sched.intervalValue || sched.intervalMinutes || 60);
    let stepMs: number;

    switch (unit) {
      case 'seconds':
        stepMs = Math.max(10, val) * 1000;
        break;
      case 'hours':
        stepMs = Math.max(1, val) * 3600 * 1000;
        break;
      case 'days':
        stepMs = Math.max(1, val) * 86400 * 1000;
        break;
      case 'minutes':
      default:
        stepMs = Math.max(1, val) * 60 * 1000;
        break;
    }
    nextDate = new Date(now.getTime() + stepMs);
  }

  // Add random delay jitter if configured (for human-like posting rhythm)
  const jitterMin = Number(sched.randomDelayMinutes || 0);
  if (jitterMin > 0) {
    const jitterMs = Math.floor(Math.random() * jitterMin * 60 * 1000);
    nextDate = new Date(nextDate.getTime() + jitterMs);
  }

  const nextIso = nextDate.toISOString();
  db.run(`UPDATE schedules SET nextRunAt = ?;`, [nextIso]);
  saveDb();
}

async function checkAndRunScheduledCycle(): Promise<void> {
  if (isCycleRunning) return;

  const db = await getDb();
  const schedRes = db.exec('SELECT * FROM schedules LIMIT 1;');
  if (schedRes.length === 0 || schedRes[0].values.length === 0) return;

  const cols = schedRes[0].columns;
  const row = schedRes[0].values[0];
  const sched: any = {};
  cols.forEach((c, idx) => (sched[c] = row[idx]));

  if (!sched.isAutoActive) return;

  // 1. Day of week check
  if (sched.activeDaysJson) {
    try {
      const activeDays: string[] = JSON.parse(sched.activeDaysJson);
      const currentDay = String(new Date().getDay()); // 0=Sun, 1=Mon, ..., 6=Sat
      if (Array.isArray(activeDays) && activeDays.length > 0 && !activeDays.includes(currentDay)) {
        return; // Today is not an active scheduled day
      }
    } catch {}
  }

  // 2. Quiet hours check
  if (sched.quietHoursStart && sched.quietHoursEnd) {
    const nowTime = new Date().toTimeString().slice(0, 5); // "HH:MM"
    if (isQuietHour(nowTime, sched.quietHoursStart, sched.quietHoursEnd)) {
      return;
    }
  }

  // 3. Daily limit check
  const dailyLimit = Number(sched.dailyLimit || 20);
  if (dailyLimit > 0) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const pubCountRes = db.exec(`SELECT COUNT(*) FROM posts WHERE status = 'published' AND publishedAt >= '${today.toISOString()}';`);
    const todayCount = (pubCountRes[0]?.values[0]?.[0] as number) || 0;
    if (todayCount >= dailyLimit) {
      return; // Daily limit reached
    }
  }

  const nextRunAt = sched.nextRunAt ? new Date(sched.nextRunAt).getTime() : 0;
  if (Date.now() >= nextRunAt) {
    await runPublishCycle('auto');
    await scheduleNextRun();
  }
}

function isQuietHour(current: string, start: string, end: string): boolean {
  if (start < end) {
    return current >= start && current <= end;
  } else {
    // Crosses midnight, e.g. 23:00 to 07:00
    return current >= start || current <= end;
  }
}

/**
 * Executes a full discovery, AI processing, QC and Telegram publish cycle
 */
export async function runPublishCycle(triggerSource: 'auto' | 'manual' | 'test' = 'manual'): Promise<{
  success: boolean;
  publishedCount: number;
  post?: any;
  message?: string;
}> {
  if (isCycleRunning) {
    return { success: false, publishedCount: 0, message: 'یک چرخه در حال حاضر در حال اجرا است.' };
  }

  isCycleRunning = true;
  await addLog('info', 'Cycle', `آغاز چرخه انتشار محتوا (منبع: ${triggerSource})...`);

  try {
    // 1. Run discovery across sources
    const candidates = await runDiscoveryCycle(20);
    if (candidates.length === 0) {
      await addLog('warn', 'Cycle', 'مطلب جدیدی در این چرخه کشف نشد. چرخه عبور داده شد.');
      return { success: false, publishedCount: 0, message: 'مطلب جدیدی کشف نشد.' };
    }

    const minQualityScore = Number(await getSetting('minQualityScore', '7.0'));
    let publishedPost = null;

    // 2. Iterate candidates to find one that passes quality control and AI formatting
    for (const candidate of candidates) {
      try {
        await addLog('info', 'Cycle', `در حال تحلیل محتوا با هوش مصنوعی برای: «${candidate.title.slice(0, 40)}...»`);

        // Ensure authentic source image is fetched
        if (!candidate.imageUrl) {
          try {
            candidate.imageUrl = await fetchArticleOpenGraphImage(candidate.url);
          } catch (imgErr) {
            // Ignore if fails
          }
        }

        // AI Localization
        const aiResult = await processArticleWithAI({
          title: candidate.title,
          content: candidate.content || candidate.summary,
          url: candidate.url,
          sourceName: candidate.sourceName,
          category: candidate.sourceCategory
        });

        // Quality Control Check
        if (aiResult.qualityScore < minQualityScore) {
          await addLog(
            'warn',
            'QC',
            `مطلب «${candidate.title.slice(0, 30)}» امتیاز کیفی کافی نیاورد (${aiResult.qualityScore} < ${minQualityScore}). رد شد.`
          );
          continue;
        }

        // Create post in DB
        const db = await getDb();
        const postId = 'post-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6);
        const nowStr = new Date().toISOString();

        db.run(
          `INSERT INTO posts 
          (id, title, hook, persianContent, hashtags, sourceUrl, imageUrl, status, qualityScore, breakdownJson, createdAt)
          VALUES (?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?);`,
          [
            postId,
            aiResult.title,
            aiResult.hook,
            aiResult.fullTelegramPost,
            aiResult.hashtags.join(' '),
            candidate.url,
            candidate.imageUrl || null,
            aiResult.qualityScore,
            JSON.stringify({
              titleOptions: aiResult.titleOptions,
              scores: aiResult.scores,
              highlightTitle: aiResult.highlightTitle,
              highlightText: aiResult.highlightText,
              reasoning: aiResult.reasoning
            }),
            nowStr
          ]
        );
        saveDb();

        const schedRes = db.exec('SELECT approvalMode FROM schedules LIMIT 1;');
        const approvalMode = schedRes[0]?.values[0]?.[0] || 'auto';

        if (triggerSource === 'auto' && approvalMode === 'manual') {
          // Manual approval mode: Keep as draft, notify admin, do not publish to public channel
          await addLog('info', 'Cycle', `مطلب «${aiResult.title.slice(0, 35)}...» به عنوان پیش‌نویس ذخیره شد (منتظر تأیید دستی ادمین).`);
          db.run(`UPDATE schedules SET lastRunAt = ?;`, [nowStr]);
          saveDb();
          publishedPost = {
            id: postId,
            title: aiResult.title,
            persianContent: aiResult.fullTelegramPost,
            status: 'draft'
          };
          break;
        }

        // 3. Publish directly to Telegram channel (Auto mode or explicit trigger)
        const pubResult = await publishPostToChannel({
          id: postId,
          title: aiResult.title,
          hook: aiResult.hook,
          persianContent: aiResult.fullTelegramPost,
          sourceUrl: candidate.url,
          imageUrl: candidate.imageUrl,
          category: aiResult.category
        });

        if (pubResult.success) {
          // Update schedule lastRunAt
          db.run(`UPDATE schedules SET lastRunAt = ?;`, [nowStr]);
          saveDb();

          publishedPost = {
            id: postId,
            title: aiResult.title,
            persianContent: aiResult.fullTelegramPost,
            telegramMessageId: pubResult.messageId
          };
          break; // Successfully published 1 post
        }
      } catch (articleErr: any) {
        console.error('Error processing article:', articleErr);
        await addLog('error', 'Cycle', `خطا در پردازش مقاله: ${articleErr.message}`);
      }
    }

    if (publishedPost) {
      await addLog('publish', 'Cycle', `چرخه با انتشار موفقیت‌آمیز پست «${publishedPost.title}» به پایان رسید.`);
      return { success: true, publishedCount: 1, post: publishedPost };
    } else {
      await addLog('warn', 'Cycle', 'هیچ مطلبی موفق به عبور از آزمون کیفی و انتشار نشد.');
      return { success: false, publishedCount: 0, message: 'هیچ مطلبی از آزمون کیفی عبور نکرد.' };
    }
  } finally {
    isCycleRunning = false;
  }
}
