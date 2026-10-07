import fs from 'fs';
import { getSetting, setSetting, addLog, getDb, saveDb, PostRow } from '../db/database.ts';
import { generateBrandedCardPng } from '../media/imageGenerator.ts';

let isPolling = false;
let pollingAbortController: AbortController | null = null;
let lastUpdateId = 0;

export interface PublishResult {
  success: boolean;
  messageId?: number;
  error?: string;
}

export async function getBotToken(): Promise<string> {
  return await getSetting('botToken', process.env.TELEGRAM_BOT_TOKEN || '');
}

export async function getChannelTarget(): Promise<string> {
  const username = await getSetting('channelUsername', process.env.TELEGRAM_CHANNEL_USERNAME || '@ChiDidamTest');
  return username;
}

/**
 * Execute Telegram API call with 429 Retry-After handling
 */
export async function callTelegramApi(endpoint: string, payload: any, isFormData: boolean = false): Promise<any> {
  const token = await getBotToken();
  if (!token) throw new Error('توکن بات تلگرام تنظیم نشده است.');

  const url = `https://api.telegram.org/bot${token}/${endpoint}`;

  let attempts = 0;
  while (attempts < 3) {
    attempts++;
    try {
      let response: Response;
      if (isFormData) {
        response = await fetch(url, {
          method: 'POST',
          body: payload
        });
      } else {
        response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      }

      if (response.status === 429) {
        let retryAfter = 5;
        try {
          const errJson = await response.json();
          retryAfter = errJson.parameters?.retry_after || 5;
        } catch {}
        await addLog('warn', 'Telegram', `محدودیت نرخ تلگرام (429). صبر به مدت ${retryAfter} ثانیه...`);
        await new Promise((resolve) => setTimeout(resolve, (retryAfter + 1) * 1000));
        continue;
      }

      const rawText = await response.text();
      let result: any;
      try {
        result = JSON.parse(rawText);
      } catch {
        throw new Error(`پاسخ تلگرام معتبر نبود (کد ${response.status}): ${rawText.slice(0, 100)}`);
      }

      if (!result.ok) {
        throw new Error(result.description || 'خطای نامشخص تلگرام');
      }
      return result.result;
    } catch (err: any) {
      if (attempts >= 3) throw err;
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
}

/**
 * Sends text message to Telegram channel with resilient HTML parsing and automatic plain-text fallback
 */
export async function sendTextMessageSafe(channel: string, text: string): Promise<number | undefined> {
  const truncated = text.slice(0, 4000);
  try {
    const res = await callTelegramApi('sendMessage', {
      chat_id: channel,
      text: truncated,
      parse_mode: 'HTML',
      disable_web_page_preview: false
    });
    return res?.message_id;
  } catch (htmlErr: any) {
    console.warn('HTML message parse failed in Telegram, retrying as clean plain text:', htmlErr.message);
    const plain = truncated.replace(/<[^>]+>/g, '');
    const res = await callTelegramApi('sendMessage', {
      chat_id: channel,
      text: plain,
      disable_web_page_preview: false
    });
    return res?.message_id;
  }
}

/**
 * Sends a post directly to the Telegram Channel
 */
export async function publishPostToChannel(post: {
  id?: string;
  title: string;
  hook?: string;
  persianContent: string;
  sourceUrl: string;
  imageUrl?: string | null;
  category?: string;
}): Promise<PublishResult> {
  const channel = await getChannelTarget();
  await addLog('info', 'Publish', `در حال ارسال پست «${post.title.slice(0, 30)}...» به کانال ${channel}`);

  try {
    let messageId: number | undefined;
    const caption = post.persianContent;

    // Check if we have an image or if card generation is explicitly enabled
    let photoToSend: string | null = post.imageUrl || null;
    const enableCardGeneration = (await getSetting('enableCardGeneration', 'false')) === 'true';

    // Only generate artificial branded card if explicitly enabled by admin
    if ((!photoToSend || !photoToSend.startsWith('http')) && enableCardGeneration) {
      try {
        const channelName = await getSetting('channelTitle', '«چی دیدم؟! 😳»');
        const channelUsername = await getSetting('channelUsername', '@ChiDidamTest');
        photoToSend = await generateBrandedCardPng({
          title: post.title,
          category: post.category || 'تکنولوژی و هوش مصنوعی',
          hook: post.hook,
          channelName,
          channelUsername
        });
      } catch (e: any) {
        console.warn('Failed to generate branded card, continuing with text only:', e.message);
        photoToSend = null;
      }
    } else if (!photoToSend || !photoToSend.startsWith('http')) {
      photoToSend = null;
    }

    if (photoToSend) {
      if (photoToSend.startsWith('http')) {
        let sentOk = false;

        // Priority 1: Download actual image buffer from source website and upload directly
        try {
          const imgFetch = await fetch(photoToSend, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
              'Referer': post.sourceUrl || 'https://google.com'
            },
            signal: AbortSignal.timeout(8000)
          });
          const mime = (imgFetch.headers.get('content-type') || '').toLowerCase();
          // Verify it is actually an image and not HTML/Cloudflare error
          if (imgFetch.ok && (mime.startsWith('image/') || mime.includes('octet-stream')) && !mime.includes('svg')) {
            const arrBuf = await imgFetch.arrayBuffer();
            if (arrBuf.byteLength >= 4000 && arrBuf.byteLength < 10 * 1024 * 1024) {
              const formData = new FormData();
              formData.append('chat_id', channel);
              formData.append('photo', new Blob([arrBuf], { type: mime || 'image/jpeg' }), 'source_image.jpg');
              formData.append('caption', caption.slice(0, 1024));
              formData.append('parse_mode', 'HTML');
              const res = await callTelegramApi('sendPhoto', formData, true);
              messageId = res.message_id;
              sentOk = true;
            }
          }
        } catch (downloadErr: any) {
          console.warn('Direct source image upload skipped (invalid dimensions or download issue):', downloadErr.message || downloadErr);
        }

        if (!sentOk) {
          // Priority 2: Telegram remote URL (wrapped in try/catch to gracefully handle PHOTO_INVALID_DIMENSIONS)
          try {
            const res = await callTelegramApi('sendPhoto', {
              chat_id: channel,
              photo: photoToSend,
              caption: caption.slice(0, 1024),
              parse_mode: 'HTML'
            });
            messageId = res.message_id;
            sentOk = true;
          } catch (urlErr: any) {
            console.warn('Telegram URL fetch failed or invalid dimensions, falling back to clean text:', urlErr.message || urlErr);
          }
        }

        if (!sentOk) {
          // Clean text fallback with HTML entity protection
          messageId = await sendTextMessageSafe(channel, caption);
          sentOk = true;
        }
      } else if (fs.existsSync(photoToSend)) {
        // Send local generated PNG card
        try {
          const fileBuffer = fs.readFileSync(photoToSend);
          const formData = new FormData();
          formData.append('chat_id', channel);
          formData.append('photo', new Blob([fileBuffer], { type: 'image/png' }), 'card.png');
          formData.append('caption', caption.slice(0, 1024));
          formData.append('parse_mode', 'HTML');
          const res = await callTelegramApi('sendPhoto', formData, true);
          messageId = res.message_id;
        } catch (cardErr) {
          messageId = await sendTextMessageSafe(channel, caption);
        }
      }
    } else {
      // No image from source: send pure clean text post
      messageId = await sendTextMessageSafe(channel, caption);
    }

    // Update post record in DB if post.id provided
    if (post.id) {
      const db = await getDb();
      const now = new Date().toISOString();
      db.run(
        `UPDATE posts SET status = 'published', telegramMessageId = ?, publishedAt = ? WHERE id = ?;`,
        [messageId || 0, now, post.id]
      );
      saveDb();
    }

    await addLog('publish', 'Publish', `پست با موفقیت در کانال ${channel} منتشر شد. شناسه پیام: ${messageId}`);
    return { success: true, messageId };
  } catch (err: any) {
    console.error('Publish to channel failed:', err);
    if (post.id) {
      const db = await getDb();
      db.run(`UPDATE posts SET status = 'failed' WHERE id = ?;`, [post.id]);
      saveDb();
    }
    await addLog('error', 'Publish', `شکست در انتشار پست: ${err.message}`);
    return { success: false, error: err.message };
  }
}

/**
 * Start Telegram Bot Long Polling for Owner Commands
 */
export async function startBotPolling(
  onCommand: (command: string, args: string, chatId: number, messageId: number) => Promise<string | void>
): Promise<void> {
  if (isPolling) return;
  isPolling = true;
  pollingAbortController = new AbortController();

  const token = await getBotToken();
  if (!token) {
    console.warn('Bot token not set, skipping polling.');
    isPolling = false;
    return;
  }

  await addLog('info', 'Bot', 'سامانه دریافت دستورات بات تلگرام (Long Polling) فعال شد.');

  // Background loop
  (async () => {
    while (isPolling) {
      try {
        const url = `https://api.telegram.org/bot${token}/getUpdates?offset=${lastUpdateId + 1}&timeout=20`;
        const res = await fetch(url, { signal: pollingAbortController?.signal });
        if (!res.ok) {
          await new Promise((r) => setTimeout(r, 5000));
          continue;
        }

        const rawText = await res.text();
        let data: any;
        try {
          data = JSON.parse(rawText);
        } catch {
          await new Promise((r) => setTimeout(r, 5000));
          continue;
        }
        if (data.ok && Array.isArray(data.result)) {
          for (const update of data.result) {
            lastUpdateId = Math.max(lastUpdateId, update.update_id);

            // Handle incoming message
            if (update.message && update.message.text) {
              const text = update.message.text.trim();
              const chatId = update.message.chat.id;
              const msgId = update.message.message_id;

              if (text.startsWith('/')) {
                const parts = text.split(/\s+/);
                const command = parts[0].toLowerCase().split('@')[0];
                const args = parts.slice(1).join(' ');

                try {
                  const replyText = await onCommand(command, args, chatId, msgId);
                  if (replyText) {
                    try {
                      await callTelegramApi('sendMessage', {
                        chat_id: chatId,
                        text: replyText,
                        parse_mode: 'HTML',
                        reply_to_message_id: msgId
                      });
                    } catch {
                      // Fallback without reply_to_message_id if original message not found
                      await callTelegramApi('sendMessage', {
                        chat_id: chatId,
                        text: replyText,
                        parse_mode: 'HTML'
                      }).catch(() => {});
                    }
                  }
                } catch (cmdErr: any) {
                  try {
                    await callTelegramApi('sendMessage', {
                      chat_id: chatId,
                      text: `❌ خطا در اجرای دستور:\n${cmdErr.message}`
                    });
                  } catch {}
                }
              }
            }

            // Handle inline button callbacks
            if (update.callback_query && update.callback_query.data) {
              const dataStr = update.callback_query.data;
              const chatId = update.callback_query.message?.chat?.id;
              const cbQueryId = update.callback_query.id;

              if (dataStr.startsWith('pub:')) {
                const postId = dataStr.replace('pub:', '');
                const db = await getDb();
                const postRes = db.exec(`SELECT * FROM posts WHERE id = '${postId}';`);
                if (postRes.length > 0 && postRes[0].values.length > 0) {
                  const cols = postRes[0].columns;
                  const row = postRes[0].values[0];
                  const post: any = {};
                  cols.forEach((c, idx) => (post[c] = row[idx]));
                  await publishPostToChannel(post);
                  await callTelegramApi('answerCallbackQuery', {
                    callback_query_id: cbQueryId,
                    text: '✅ پست با موفقیت به کانال ارسال شد!'
                  });
                }
              } else if (dataStr.startsWith('cancel:')) {
                await callTelegramApi('answerCallbackQuery', {
                  callback_query_id: cbQueryId,
                  text: 'پیش‌نویس لغو شد.'
                });
              }
            }
          }
        }
      } catch (err: any) {
        if (!isPolling) break;
        // Wait before reconnecting
        await new Promise((r) => setTimeout(r, 4000));
      }
    }
  })();
}

export function stopBotPolling(): void {
  isPolling = false;
  if (pollingAbortController) {
    pollingAbortController.abort();
    pollingAbortController = null;
  }
}
