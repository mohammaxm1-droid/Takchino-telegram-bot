import { GoogleGenAI } from '@google/genai';
import { getSetting, addLog } from '../db/database.ts';

export interface ProcessedArticleResult {
  title: string;
  hook: string;
  summary: string;
  highlightTitle: string;
  highlightText: string;
  fullTelegramPost: string;
  hashtags: string[];
  category: string;
  titleOptions: string[];
  qualityScore: number;
  scores: {
    novelty: number;
    curiosity: number;
    usefulness: number;
    virality: number;
    freshness: number;
    persianRelevance: number;
    visualPotential: number;
    reliability: number;
  };
  reasoning: string;
}

export async function processArticleWithAI(
  rawArticle: { title: string; content: string; url: string; sourceName: string; category?: string },
  customInstructions?: string
): Promise<ProcessedArticleResult> {
  const activeProvider = await getSetting('activeAiProvider', 'groq');
  const groqApiKey = await getSetting('groqApiKey', process.env.GROQ_API_KEY || '');
  const groqModel = await getSetting('groqModel', 'openai/gpt-oss-120b');
  const geminiApiKey = await getSetting('geminiApiKey', process.env.GEMINI_API_KEY || '');

  const botPersona = await getSetting('botPersona', 'witty_geek');
  const botMission = await getSetting('botMission', 'کشف داغ‌ترین نوآوری‌ها، ترفندهای کاربردی و ابزارهای هوش مصنوعی و تبدیل آن به پست‌های ویروسی تلگرام');
  const postLength = await getSetting('postLength', 'standard');
  const channelUsername = await getSetting('channelUsername', '@ChiDidamTest');

  let personaDescription = 'خودمانی، پرانرژی، هوشمندانه، کنجکاوی‌برانگیز و هیجان‌انگیز (مثل حرف زدن یک گیک حرفه‌ای و مسلط به ترندهای روز با دوستانش).';
  if (botPersona === 'sharp_analyst') {
    personaDescription = 'تحلیل‌گر بسیار تیزبین، مستقیم و بدون حاشیه؛ به سرعت ارزش اصلی خبر را بیان کن و از عبارات پرکننده بپرهیز.';
  } else if (botPersona === 'practical_mentor') {
    personaDescription = 'آموزش‌محور، شفاف و کاربردی؛ دقیقاً روی کاربرد مستقیم این ابزار یا ترفند در زندگی روزمره و کسب‌وکار مخاطب تمرکز کن.';
  } else if (botPersona === 'elite_journalist') {
    personaDescription = 'خبرگزاری مدرن و موثق؛ سنجیده، محترمانه و دقیق، با حفظ جذابیت ژورنالیستی و دوری از اغراق‌های زرد.';
  } else if (botPersona === 'ai_hunter') {
    personaDescription = 'شکارچی ابزارهای هوش مصنوعی؛ تمرکز ویژه روی امکانات رایگان، پرامپت‌ها، صرفه‌جویی در زمان و کاربرد مدل‌های AI.';
  }

  let lengthDescription = 'توضیحات شفاف در ۲ پاراگراف کوتاه با فاصله‌گذاری تمیز، بدون پیچیده‌گویی یا اصطلاحات گیج‌کننده.';
  if (postLength === 'short') {
    lengthDescription = 'پست بسیار خلاصه و ضربتی در ۱ پاراگراف منسجم و سریع برای مخاطبان کم‌حوصله.';
  } else if (postLength === 'deep') {
    lengthDescription = 'توضیحات جامع و عمیق در ۳ پاراگراف جذاب با جزئیات فنی و نکات کاربردی.';
  }

  const systemPrompt = `تو ارشدترین استراتژیست محتوا و ادیتور ارشد کانال تلگرام «چی دیدم؟! 😳» (${channelUsername}) هستی.
ماموریت و وظیفه اصلی تو: ${botMission}

قوانین طلایی برای ماکزیمم بازدید و خوانایی (VIRAL CONTENT RULES):
۱. راست‌چین بودن مطلق و ۱۰۰٪ فارسی (Strict RTL):
   - تمام خطوط و جملات باید با کلمات فارسی شروع شوند تا در تلگرام به هیچ‌وجه به چپ نپرند.
   - نام‌های انگلیسی را حتماً در میانه جمله یا بعد از واژه فارسی بیاور (مثال درست: «ابزار جدید گوگل به نام کلوت معرفی شد»).
۲. لحن پست:
   - ${personaDescription}
   - خشک، رسمی و ماشینی اصلاً نباشد!
۳. هوک اول (Line 1 Hook):
   - تیتر یا خط اول باید با ایموجی کوبنده (😳، 🤯، 🔥، 💡، 🤖، 🚀) شروع شود و مخاطب را در کسری از ثانیه کنجکاو کند تا استاپ کند و بخواند.
۴. دیسکریپشن و حجم متن:
   - ${lengthDescription}
   - عبارات کلیدی مهم را با تگ <b> پررنگ کن.
۵. بخش هایلایت کاربردی و میخکوب‌کننده:
   - یک بخش مجزا با تیتر بولد مانند:
     🔥 <b>ماجرا چیه؟</b>
     یا:
     ✅ <b>به چه دردی می‌خوره؟</b>
     یا:
     👀 <b>نکته شگفت‌انگیز:</b>
     به همراه ۲ الی ۳ خط توضیح شفاف و ملموس.
۶. هشتگ‌های دقیق و هوشمندانه:
   - هشتگ اول حتماً #چی_دیدم
   - ۲ تا ۳ هشتگ پرجستجوی فارسی متناسب با موضوع: مانند #هوش_مصنوعی #ترفند_مخفی #ابزار_رایگان #فناوری_روز #گجت
۷. تمیزی و پرهیز از لینک:
   - به هیچ عنوان هیچ لینک منبع، آدرس سایت یا URL خارجی در متن ننویس!
۸. امضای پایانی:
   - انتهای پست فقط:
     🆔 ${channelUsername}

خروجی تو باید الزاماً فقط یک JSON معتبر باشد:
{
  "title": "عنوان جذاب فارسی برای دیتابیس",
  "hook": "متن هوک اول به همراه ایموجی (مثال: 😳 فاش شدن راز جدید آیفون ۱۶!)",
  "summary": "توضیح کوتاه و جذاب در دو پاراگراف روان",
  "highlightTitle": "یکی از موارد: 🔥 ماجرا چیه؟ / ✅ به چه دردی می‌خوره؟ / 👀 نکته کلیدی:",
  "highlightText": "توضیح شفاف و جذاب بخش هایلایت",
  "hashtags": ["#چی_دیدم", "#هشتگ_مرتبط۱", "#هشتگ_مرتبط۲"],
  "category": "دسته‌بندی دقیق به فارسی",
  "titleOptions": ["عنوان اول", "عنوان دوم", "عنوان سوم"],
  "qualityScore": 8.8,
  "scores": {
    "novelty": 9,
    "curiosity": 9,
    "usefulness": 8,
    "virality": 9,
    "freshness": 9,
    "persianRelevance": 9,
    "visualPotential": 8,
    "reliability": 9
  },
  "reasoning": "دلیل ارزش بازدید بالا برای مخاطب ایرانی"
}`;

  const userPrompt = `مقاله جدید دریافت شده برای پردازش:
منبع: ${rawArticle.sourceName}
آدرس: ${rawArticle.url}
عنوان انگلیسی: ${rawArticle.title}
دسته‌بندی احتمالی: ${rawArticle.category || 'تکنولوژی'}

متن یا خلاصه محتوا:
${rawArticle.content.slice(0, 3500)}

${customInstructions ? `دستورات اختصاصی ادمین:\n${customInstructions}` : ''}

لطفاً محتوا را تجزیه و تحلیل کرده و خروجی JSON با کیفیت بالا به فارسی برگردان.`;

  const openaiApiKey = await getSetting('openaiApiKey', '');
  const openaiBaseUrl = await getSetting('openaiBaseUrl', 'https://api.openai.com/v1');
  const openaiModel = await getSetting('openaiModel', 'gpt-4o-mini');

  // Try primary provider, fallback to others
  if (activeProvider === 'groq' && groqApiKey) {
    try {
      return await callGroq(groqApiKey, groqModel, systemPrompt, userPrompt, rawArticle.url, channelUsername);
    } catch (err: any) {
      console.warn('Groq failed, attempting Gemini fallback:', err.message);
      await addLog('warn', 'AI', `خطا در پردازش با Groq، سوئیچ به جمینای: ${err.message}`);
      if (geminiApiKey) {
        return await callGemini(geminiApiKey, systemPrompt, userPrompt, rawArticle.url, channelUsername);
      }
      throw err;
    }
  } else if ((activeProvider === 'openai' || activeProvider === 'custom') && openaiApiKey) {
    try {
      return await callOpenAICompatible(openaiApiKey, openaiBaseUrl, openaiModel, systemPrompt, userPrompt, rawArticle.url, channelUsername);
    } catch (err: any) {
      console.warn('OpenAI/Custom failed, fallback to Groq/Gemini:', err.message);
      await addLog('warn', 'AI', `خطا در پردازش با OpenAI/Custom: ${err.message}`);
      if (groqApiKey) return await callGroq(groqApiKey, groqModel, systemPrompt, userPrompt, rawArticle.url, channelUsername);
      if (geminiApiKey) return await callGemini(geminiApiKey, systemPrompt, userPrompt, rawArticle.url, channelUsername);
      throw err;
    }
  } else if (geminiApiKey) {
    try {
      return await callGemini(geminiApiKey, systemPrompt, userPrompt, rawArticle.url, channelUsername);
    } catch (err: any) {
      console.warn('Gemini failed, attempting Groq fallback:', err.message);
      await addLog('warn', 'AI', `خطا در پردازش با Gemini، سوئیچ به گروک: ${err.message}`);
      if (groqApiKey) {
        return await callGroq(groqApiKey, groqModel, systemPrompt, userPrompt, rawArticle.url, channelUsername);
      }
      throw err;
    }
  } else {
    // If no provider key in settings, check groq or openai
    if (groqApiKey) {
      return await callGroq(groqApiKey, groqModel, systemPrompt, userPrompt, rawArticle.url, channelUsername);
    }
    if (openaiApiKey) {
      return await callOpenAICompatible(openaiApiKey, openaiBaseUrl, openaiModel, systemPrompt, userPrompt, rawArticle.url, channelUsername);
    }
    throw new Error('هیچ کلید هوش مصنوعی فعالی (Groq یا Gemini یا OpenAI) یافت نشد.');
  }
}

async function callOpenAICompatible(
  apiKey: string,
  baseUrl: string,
  model: string,
  systemPrompt: string,
  userPrompt: string,
  url: string,
  channelUsername: string = '@ChiDidamTest'
): Promise<ProcessedArticleResult> {
  const chosenModel = model || 'gpt-4o-mini';
  const urlEndpoint = baseUrl.replace(/\/+$/, '') + '/chat/completions';
  const response = await fetch(urlEndpoint, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: chosenModel,
      messages: [
        { role: 'system', content: `${systemPrompt}\n\nIMPORTANT: Be concise and output valid JSON directly.` },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.5,
      response_format: { type: 'json_object' }
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  const rawContent = data.choices?.[0]?.message?.content || '{}';
  return parseAIResponse(rawContent, url, channelUsername);
}

export async function testAiConnection(params: {
  provider: string;
  apiKey: string;
  model?: string;
  baseUrl?: string;
}): Promise<{ success: boolean; message: string; latencyMs: number; sampleResponse?: string }> {
  const start = Date.now();
  const { provider, apiKey, model, baseUrl } = params;

  if (!apiKey) {
    return { success: false, message: 'کلید API وارد نشده است.', latencyMs: 0 };
  }

  try {
    if (provider === 'groq') {
      const chosenModel = model || 'openai/gpt-oss-120b';
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: chosenModel,
          messages: [{ role: 'user', content: 'پاسخ کوتاه بده: وضعیت تست هوش مصنوعی چطوره؟' }],
          max_tokens: 60
        })
      });
      const latency = Date.now() - start;
      if (!res.ok) {
        const errText = await res.text();
        return { success: false, message: `خطای Groq (${res.status}): ${errText}`, latencyMs: latency };
      }
      const data = await res.json();
      return {
        success: true,
        message: `اتصال موفق به Groq مدل ${chosenModel}`,
        latencyMs: latency,
        sampleResponse: data.choices?.[0]?.message?.content
      };
    } else if (provider === 'gemini') {
      const ai = new GoogleGenAI({ apiKey });
      const chosenModel = model || 'gemini-2.5-flash';
      const response = await ai.models.generateContent({
        model: chosenModel,
        contents: 'پاسخ کوتاه بده: تست اتصال سیستم تلگرام چطور است؟'
      });
      const latency = Date.now() - start;
      return {
        success: true,
        message: `اتصال موفق به Gemini مدل ${chosenModel}`,
        latencyMs: latency,
        sampleResponse: response.text
      };
    } else if (provider === 'openai' || provider === 'custom') {
      const urlEndpoint = (baseUrl || 'https://api.openai.com/v1').replace(/\/+$/, '') + '/chat/completions';
      const chosenModel = model || 'gpt-4o-mini';
      const res = await fetch(urlEndpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: chosenModel,
          messages: [{ role: 'user', content: 'پاسخ کوتاه بده: تست اتصال موفق است؟' }],
          max_tokens: 60
        })
      });
      const latency = Date.now() - start;
      if (!res.ok) {
        const errText = await res.text();
        return { success: false, message: `خطای سرور (${res.status}): ${errText}`, latencyMs: latency };
      }
      const data = await res.json();
      return {
        success: true,
        message: `اتصال موفق به ${provider.toUpperCase()} مدل ${chosenModel}`,
        latencyMs: latency,
        sampleResponse: data.choices?.[0]?.message?.content
      };
    }

    return { success: false, message: 'ارائه‌دهنده نامعتبر است.', latencyMs: 0 };
  } catch (err: any) {
    return { success: false, message: err.message || 'خطای ناشناخته در برقراری ارتباط', latencyMs: Date.now() - start };
  }
}

async function callGroq(
  apiKey: string,
  model: string,
  systemPrompt: string,
  userPrompt: string,
  url: string,
  channelUsername: string = '@ChiDidamTest'
): Promise<ProcessedArticleResult> {
  const chosenModel = model || 'openai/gpt-oss-120b';
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: chosenModel,
      messages: [
        { role: 'system', content: `${systemPrompt}\n\nIMPORTANT: Be concise and output valid JSON directly.` },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.5,
      max_tokens: 3500,
      response_format: { type: 'json_object' }
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    // If model not found or token issue, try openai/gpt-oss-20b
    if (chosenModel !== 'openai/gpt-oss-20b' && (errorText.includes('model_not_found') || errorText.includes('max completion tokens'))) {
      console.warn('Groq 120b failed, falling back to openai/gpt-oss-20b:', errorText);
      return callGroq(apiKey, 'openai/gpt-oss-20b', systemPrompt, userPrompt, url, channelUsername);
    }
    throw new Error(`Groq API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  const rawContent = data.choices?.[0]?.message?.content || '{}';
  return parseAIResponse(rawContent, url, channelUsername);
}

async function callGemini(
  apiKey: string,
  systemPrompt: string,
  userPrompt: string,
  url: string,
  channelUsername: string = '@ChiDidamTest'
): Promise<ProcessedArticleResult> {
  const ai = new GoogleGenAI({ apiKey });
  let modelName = 'gemini-3.8-flash';
  try {
    const response = await ai.models.generateContent({
      model: modelName,
      contents: `${systemPrompt}\n\n${userPrompt}`,
      config: {
        responseMimeType: 'application/json',
        temperature: 0.6
      }
    });
    const rawText = response.text || '{}';
    return parseAIResponse(rawText, url, channelUsername);
  } catch (err: any) {
    console.warn(`Gemini ${modelName} failed, trying gemini-2.0-flash:`, err.message);
    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: `${systemPrompt}\n\n${userPrompt}`,
      config: {
        responseMimeType: 'application/json',
        temperature: 0.6
      }
    });
    const rawText = response.text || '{}';
    return parseAIResponse(rawText, url, channelUsername);
  }
}

function parseAIResponse(rawContent: string, url: string, targetChannelUsername: string = '@ChiDidamTest'): ProcessedArticleResult {
  try {
    // Extract JSON block if wrapped in markdown code fence
    let clean = rawContent.trim();
    if (clean.startsWith('```json')) {
      clean = clean.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    } else if (clean.startsWith('```')) {
      clean = clean.replace(/^```\s*/, '').replace(/\s*```$/, '');
    }

    const parsed = JSON.parse(clean);

    // Fallbacks if some fields are missing
    const title = parsed.title || 'مطلب جدید تکنولوژی در کانال چی دیدم';
    const hook = parsed.hook || `😳 ${title}`;
    const summary = parsed.summary || 'بررسی جدیدترین تغییرات و قابلیت‌های روز دنیای تکنولوژی و وب.';
    const highlightTitle = parsed.highlightTitle || '🔥 چرا جذابه؟';
    const highlightText = parsed.highlightText || 'یک تحول بسیار کاربردی و جالب در دنیای تکنولوژی و اینترنت.';

    // Ensure hashtags include #چی_دیدم and are properly formatted
    const rawTags = Array.isArray(parsed.hashtags) ? parsed.hashtags : ['#چی_دیدم', '#تکنولوژی', '#ترفند_مخفی'];
    let cleanTags = rawTags
      .map((t: string) => String(t).trim().replace(/^#+/, ''))
      .filter((t: string) => t.length > 1)
      .map((t: string) => `#${t.replace(/\s+/g, '_')}`);

    if (!cleanTags.some((t: string) => t.includes('چی_دیدم'))) {
      cleanTags = ['#چی_دیدم', ...cleanTags.slice(0, 3)];
    } else {
      cleanTags = cleanTags.slice(0, 4);
    }
    const hashtags = cleanTags;

    // Build standard, gorgeous, viral post structure with clean breathing space
    const titleHeader = hook.includes('<b>') ? hook : `<b>${hook}</b>`;
    const cleanSummary = summary.replace(/https?:\/\/[^\s<"']+/gi, '').trim();
    const cleanHighlight = highlightText.replace(/https?:\/\/[^\s<"']+/gi, '').trim();
    const highlightHeader = highlightTitle.includes('<b>') ? highlightTitle : `<b>${highlightTitle}</b>`;
    const tagsString = hashtags.join(' ');
    const sourceAnchor = url && url.startsWith('http') && !url.includes('t.me')
      ? `<a href="${url}">🔗 منبع خبر و جزئیات بیشتر</a>`
      : '';
    const channelTag = `🆔 ${targetChannelUsername}`;

    // Assemble distinct sections
    const sections = [
      titleHeader,
      cleanSummary,
      `${highlightHeader}\n${cleanHighlight}`,
      tagsString,
      sourceAnchor ? `${sourceAnchor}\n${channelTag}` : channelTag
    ];

    // Prepend each line with Right-to-Left Mark (\u200F) for flawless RTL alignment across Telegram clients
    const fullTelegramPost = sections
      .map((sec) =>
        sec
          .split('\n')
          .map((line: string) => (line.trim().length > 0 ? '\u200F' + line.trim() : ''))
          .join('\n')
      )
      .join('\n\n');

    return {
      title,
      hook,
      summary,
      highlightTitle,
      highlightText,
      fullTelegramPost,
      hashtags,
      category: parsed.category || 'هوش مصنوعی و تکنولوژی',
      titleOptions: Array.isArray(parsed.titleOptions) && parsed.titleOptions.length > 0 ? parsed.titleOptions : [title],
      qualityScore: typeof parsed.qualityScore === 'number' ? parsed.qualityScore : 8.0,
      scores: parsed.scores || {
        novelty: 8,
        curiosity: 8,
        usefulness: 8,
        virality: 8,
        freshness: 9,
        persianRelevance: 8,
        visualPotential: 7,
        reliability: 8
      },
      reasoning: parsed.reasoning || 'محتوای جذاب برای مخاطب ایرانی'
    };
  } catch (err: any) {
    console.error('Failed to parse AI JSON response:', err, rawContent);
    throw new Error('خطا در تبدیل پاسخ هوش مصنوعی به قالب ساختاریافته: ' + err.message);
  }
}

export interface ChatAssistantMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface GeneratedPostData {
  title: string;
  hook: string;
  persianContent: string;
  hashtags: string[];
  category: string;
}

export interface ChatAssistantResult {
  reply: string;
  postData?: GeneratedPostData | null;
  shouldPublishNow?: boolean;
}

/**
 * Interactive Chatbot Engine: Converse with AI, generate viral Telegram posts on command,
 * and support immediate publishing or saving to drafts.
 */
export async function chatWithAiAssistant(params: {
  message: string;
  history?: ChatAssistantMessage[];
  autoPublishCommand?: boolean;
  instructions?: string;
}): Promise<ChatAssistantResult> {
  const { message, history = [], autoPublishCommand = false, instructions } = params;

  const activeProvider = await getSetting('activeAiProvider', 'groq');
  const groqApiKey = await getSetting('groqApiKey', process.env.GROQ_API_KEY || '');
  const groqModel = await getSetting('groqModel', 'openai/gpt-oss-120b');
  const geminiApiKey = await getSetting('geminiApiKey', process.env.GEMINI_API_KEY || '');
  const openaiApiKey = await getSetting('openaiApiKey', '');
  const openaiBaseUrl = await getSetting('openaiBaseUrl', 'https://api.openai.com/v1');
  const openaiModel = await getSetting('openaiModel', 'gpt-4o-mini');
  const channelUsername = await getSetting('channelUsername', '@ChiDidamTest');
  const botPersona = await getSetting('botPersona', 'witty_geek');

  const systemPrompt = `تو دستیار ارشد هوش مصنوعی و ادیتور ارشد کانال تلگرام «چی دیدم؟! 😳» (${channelUsername}) هستی.
وظیفه تو: گفتگو با کاربر/ادمین، اجرای دقیق دستورات و در صورت درخواست، تولید پست‌های تلگرام آماده و میخکوب‌کننده برای کانال است.

قوانین تولید محتوا در صورتی که کاربر درخواست نگارش پست/پیام/آموزش/ترفند کرد:
۱. زبان ۱۰۰٪ فارسی، راست‌چین (RTL) و فوق‌العاده روان، پرانرژی و جذاب.
۲. خط اول همیشه یک هوک غافلگیرکننده با ایموجی کوبنده (😳، 🔥، 💡، 🚀، 🤖) باشد.
۳. در متن از تگ‌های <b> برای کلمات کلیدی مهم و <code> برای دستورات/کدها استفاده کن.
۴. هشتگ‌های اختصاصی و پربازدید: حتماً #چی_دیدم به عنوان اولین هشتگ، به همراه ۲ تا ۳ هشتگ مرتبط فارسی (مانند #آموزش #پایتون #ترفند_مخفی #هوش_مصنوعی).
۵. هیچ لینک متفرقه یا سایت خارجی در متن قرار نده؛ در انتهای پست فقط آیدی کانال:
   🆔 ${channelUsername}
${instructions ? `دستور ویژه ادمین: ${instructions}` : ''}

فرمت پاسخ تو باید الزماً و فقط یک آبجکت JSON معتبر به شکل زیر باشد:
{
  "reply": "پاسخ دوستانه و گفتگویی شما به کاربر به فارسی",
  "hasPost": true / false,
  "post": {
    "title": "عنوان خلاصه فارسی پست",
    "hook": "متن هوک اول همراه با ایموجی",
    "persianContent": "متن کامل آماده انتشار تلگرام همراه با هوک، توضیحات، هشتگ‌ها و آیدی کانال",
    "hashtags": ["#چی_دیدم", "#هشتگ_مرتبط"],
    "category": "آموزش و تکنولوژی"
  },
  "shouldPublishNow": true / false
}

نکته مهم:
- اگر کاربر دستور داد محتوایی در کانال منتشر شود (مثلاً "یک پست درباره پایتون بنویس و در کانال بفرست" یا "همین الان ارسالش کن")، فیلد "shouldPublishNow" را برابر true قرار بده.
- اگر فقط درخواست تولید پست بود، فیلد "shouldPublishNow" را false بگذار تا کاربر بتواند پیش‌نمایش را بررسی کرده و با دکمه انتشار دستی ارسال کند.
- اگر سوال عادی پرسید، hasPost را false و post را null بگذار.`;

  // Check user intent locally as well
  const lowerMsg = message.toLowerCase();
  const publishIntentKeyword =
    lowerMsg.includes('در کانال بفرست') ||
    lowerMsg.includes('به کانال بفرست') ||
    lowerMsg.includes('در کانال بزار') ||
    lowerMsg.includes('در کانال بذار') ||
    lowerMsg.includes('ارسالش کن') ||
    lowerMsg.includes('منتشر کن');

  let rawJsonText = '';

  // Helper to format history for OpenAI-compatible APIs
  const formattedMessages = [
    { role: 'system', content: systemPrompt },
    ...history.slice(-8).map((h) => ({ role: h.role, content: h.content })),
    { role: 'user', content: message }
  ];

  // Call provider with automatic fallback
  let parsedResult: any = null;

  const tryGroq = async (): Promise<boolean> => {
    if (!groqApiKey) return false;
    try {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${groqApiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: groqModel || 'openai/gpt-oss-120b',
          messages: formattedMessages,
          temperature: 0.6,
          response_format: { type: 'json_object' }
        })
      });
      if (res.ok) {
        const data = await res.json();
        rawJsonText = data.choices?.[0]?.message?.content || '';
        return true;
      }
    } catch (e: any) {
      console.warn('Groq chat call error:', e.message);
    }
    return false;
  };

  const tryGemini = async (): Promise<boolean> => {
    if (!geminiApiKey) return false;
    try {
      const ai = new GoogleGenAI({ apiKey: geminiApiKey });
      const promptCombined = `${systemPrompt}\n\nتاریخچه گفتگو:\n${history
        .slice(-6)
        .map((h) => `${h.role === 'user' ? 'کاربر' : 'دستیار'}: ${h.content}`)
        .join('\n')}\n\nپیام جدید کاربر: ${message}`;

      const res = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: promptCombined,
        config: {
          responseMimeType: 'application/json',
          temperature: 0.6
        }
      });
      rawJsonText = res.text || '';
      return true;
    } catch (e: any) {
      console.warn('Gemini chat call error, trying gemini-2.0-flash:', e.message);
      try {
        const ai = new GoogleGenAI({ apiKey: geminiApiKey });
        const res = await ai.models.generateContent({
          model: 'gemini-2.0-flash',
          contents: `${systemPrompt}\n\nپیام کاربر: ${message}`,
          config: {
            responseMimeType: 'application/json',
            temperature: 0.6
          }
        });
        rawJsonText = res.text || '';
        return true;
      } catch (e2: any) {
        console.warn('Gemini fallback failed:', e2.message);
      }
    }
    return false;
  };

  const tryOpenAI = async (): Promise<boolean> => {
    if (!openaiApiKey) return false;
    try {
      const urlEndpoint = (openaiBaseUrl || 'https://api.openai.com/v1').replace(/\/+$/, '') + '/chat/completions';
      const res = await fetch(urlEndpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openaiApiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: openaiModel || 'gpt-4o-mini',
          messages: formattedMessages,
          temperature: 0.6,
          response_format: { type: 'json_object' }
        })
      });
      if (res.ok) {
        const data = await res.json();
        rawJsonText = data.choices?.[0]?.message?.content || '';
        return true;
      }
    } catch (e: any) {
      console.warn('OpenAI chat call error:', e.message);
    }
    return false;
  };

  let success = false;
  if (activeProvider === 'groq') {
    success = (await tryGroq()) || (await tryGemini()) || (await tryOpenAI());
  } else if (activeProvider === 'gemini') {
    success = (await tryGemini()) || (await tryGroq()) || (await tryOpenAI());
  } else {
    success = (await tryOpenAI()) || (await tryGroq()) || (await tryGemini());
  }

  if (!success || !rawJsonText) {
    throw new Error('پاسخی از ارائه‌دهنده‌های هوش مصنوعی دریافت نشد. لطفاً کلید API را در تنظیمات بررسی کنید.');
  }

  try {
    let clean = rawJsonText.trim();
    if (clean.startsWith('```json')) {
      clean = clean.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    } else if (clean.startsWith('```')) {
      clean = clean.replace(/^```\s*/, '').replace(/\s*```$/, '');
    }
    parsedResult = JSON.parse(clean);
  } catch {
    // If not JSON, return plain text
    return {
      reply: rawJsonText,
      postData: null,
      shouldPublishNow: false
    };
  }

  const reply = parsedResult.reply || 'پست با موفقیت تدوین شد.';
  let postData: GeneratedPostData | null = null;

  if (parsedResult.hasPost && parsedResult.post) {
    const rawPost = parsedResult.post;
    const title = rawPost.title || 'پست جدید کانال چی دیدم';
    const hook = rawPost.hook || `😳 ${title}`;
    let content = rawPost.persianContent || '';

    // Ensure content has RTL marks on each line
    content = content
      .split('\n')
      .map((line: string) => (line.trim().length > 0 ? (line.startsWith('\u200F') ? line : '\u200F' + line.trim()) : ''))
      .join('\n');

    // Ensure channel signature exists
    if (!content.includes(channelUsername)) {
      content += `\n\n\u200F🆔 ${channelUsername}`;
    }

    const rawTags = Array.isArray(rawPost.hashtags) ? rawPost.hashtags : ['#چی_دیدم'];
    const cleanTags = rawTags.map((t: string) => (t.startsWith('#') ? t : `#${t}`));
    if (!cleanTags.includes('#چی_دیدم')) {
      cleanTags.unshift('#چی_دیدم');
    }

    postData = {
      title,
      hook,
      persianContent: content,
      hashtags: cleanTags,
      category: rawPost.category || 'تکنولوژی و وب'
    };
  }

  const shouldPublishNow =
    Boolean(parsedResult.shouldPublishNow) ||
    Boolean(autoPublishCommand) ||
    (publishIntentKeyword && postData !== null);

  return {
    reply,
    postData,
    shouldPublishNow
  };
}
