import initSqlJs, { Database as SqlJsDatabase } from 'sql.js';
import fs from 'fs';
import path from 'path';

let dbInstance: SqlJsDatabase | null = null;
const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_PATH = path.join(DATA_DIR, 'chididam.sqlite');

export interface SourceRow {
  id: string;
  name: string;
  url: string;
  rssUrl: string;
  category: string;
  enabled: number; // 0 or 1
  priority: number; // 1 to 5
  lastChecked?: string | null;
  lastSuccess?: string | null;
  lastError?: string | null;
  createdAt: string;
}

export interface ArticleRow {
  id: string;
  sourceId: string;
  title: string;
  url: string;
  summary: string;
  content: string;
  author?: string | null;
  publishedAt: string;
  imageUrl?: string | null;
  category: string;
  freshnessScore: number;
  viralityScore: number;
  smartScore: number;
  rawJson?: string | null;
  createdAt: string;
}

export interface PostRow {
  id: string;
  articleId?: string | null;
  title: string;
  hook: string;
  persianContent: string;
  hashtags: string;
  sourceUrl: string;
  imageUrl?: string | null;
  status: 'draft' | 'scheduled' | 'published' | 'rejected' | 'failed';
  telegramMessageId?: number | null;
  qualityScore: number;
  breakdownJson?: string | null;
  scheduledAt?: string | null;
  publishedAt?: string | null;
  createdAt: string;
}

export interface SettingRow {
  key: string;
  value: string;
  updatedAt: string;
}

export interface LogRow {
  id: string;
  level: 'info' | 'warn' | 'error' | 'publish';
  category: string;
  message: string;
  detailsJson?: string | null;
  timestamp: string;
}

export interface ChatMessageRow {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  postDataJson?: string | null;
  publishedMessageId?: number | null;
  createdAt: string;
}

export async function getDb(): Promise<SqlJsDatabase> {
  if (dbInstance) return dbInstance;

  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  const SQL = await initSqlJs();

  if (fs.existsSync(DB_PATH)) {
    try {
      const buffer = fs.readFileSync(DB_PATH);
      dbInstance = new SQL.Database(buffer);
    } catch (e) {
      console.error('Error reading existing SQLite database file, creating fresh one:', e);
      dbInstance = new SQL.Database();
    }
  } else {
    dbInstance = new SQL.Database();
  }

  initSchema(dbInstance);
  saveDb();
  return dbInstance;
}

export function saveDb(): void {
  if (!dbInstance) return;
  try {
    const data = dbInstance.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(DB_PATH, buffer);
  } catch (err) {
    console.error('Failed to save SQLite database to disk:', err);
  }
}

function initSchema(db: SqlJsDatabase): void {
  db.run(`
    CREATE TABLE IF NOT EXISTS sources (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      url TEXT NOT NULL,
      rssUrl TEXT NOT NULL,
      category TEXT NOT NULL,
      enabled INTEGER DEFAULT 1,
      priority INTEGER DEFAULT 3,
      lastChecked TEXT,
      lastSuccess TEXT,
      lastError TEXT,
      createdAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS articles (
      id TEXT PRIMARY KEY,
      sourceId TEXT NOT NULL,
      title TEXT NOT NULL,
      url TEXT NOT NULL UNIQUE,
      summary TEXT,
      content TEXT,
      author TEXT,
      publishedAt TEXT,
      imageUrl TEXT,
      category TEXT NOT NULL,
      freshnessScore REAL DEFAULT 5,
      viralityScore REAL DEFAULT 5,
      smartScore REAL DEFAULT 5,
      rawJson TEXT,
      createdAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS posts (
      id TEXT PRIMARY KEY,
      articleId TEXT,
      title TEXT NOT NULL,
      hook TEXT,
      persianContent TEXT NOT NULL,
      hashtags TEXT,
      sourceUrl TEXT NOT NULL,
      imageUrl TEXT,
      status TEXT DEFAULT 'draft',
      telegramMessageId INTEGER,
      qualityScore REAL DEFAULT 8.0,
      breakdownJson TEXT,
      scheduledAt TEXT,
      publishedAt TEXT,
      createdAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS schedules (
      id TEXT PRIMARY KEY,
      type TEXT DEFAULT 'interval',
      intervalMinutes INTEGER DEFAULT 60,
      specificTimesJson TEXT DEFAULT '["09:00","13:00","17:00","21:00"]',
      postsPerCycle INTEGER DEFAULT 1,
      dailyLimit INTEGER DEFAULT 15,
      quietHoursStart TEXT DEFAULT '00:00',
      quietHoursEnd TEXT DEFAULT '07:00',
      isAutoActive INTEGER DEFAULT 1,
      nextRunAt TEXT,
      lastRunAt TEXT
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS logs (
      id TEXT PRIMARY KEY,
      level TEXT NOT NULL,
      category TEXT NOT NULL,
      message TEXT NOT NULL,
      detailsJson TEXT,
      timestamp TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS stats (
      id TEXT PRIMARY KEY,
      date TEXT NOT NULL UNIQUE,
      totalDiscovered INTEGER DEFAULT 0,
      totalAnalyzed INTEGER DEFAULT 0,
      totalPublished INTEGER DEFAULT 0,
      totalRejected INTEGER DEFAULT 0,
      topCategory TEXT,
      createdAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS chat_messages (
      id TEXT PRIMARY KEY,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      postDataJson TEXT,
      publishedMessageId INTEGER,
      createdAt TEXT NOT NULL
    );
  `);

  // Migrations for existing databases
  try { db.run("ALTER TABLE schedules ADD COLUMN intervalUnit TEXT DEFAULT 'minutes';"); } catch {}
  try { db.run("ALTER TABLE schedules ADD COLUMN intervalValue INTEGER DEFAULT 60;"); } catch {}
  try { db.run("ALTER TABLE schedules ADD COLUMN activeDaysJson TEXT DEFAULT '[\"0\",\"1\",\"2\",\"3\",\"4\",\"5\",\"6\"]';"); } catch {}
  try { db.run("ALTER TABLE schedules ADD COLUMN approvalMode TEXT DEFAULT 'auto';"); } catch {}
  try { db.run("ALTER TABLE schedules ADD COLUMN scheduleMode TEXT DEFAULT 'interval';"); } catch {}
  try { db.run("ALTER TABLE schedules ADD COLUMN randomDelayMinutes INTEGER DEFAULT 0;"); } catch {}
  try { db.run("ALTER TABLE schedules ADD COLUMN timezone TEXT DEFAULT 'Asia/Tehran';"); } catch {}

  // Seed default sources if empty
  const sourcesCount = db.exec("SELECT COUNT(*) as cnt FROM sources;");
  const count = sourcesCount.length > 0 && sourcesCount[0].values[0] ? (sourcesCount[0].values[0][0] as number) : 0;

  if (count === 0) {
    const defaultSources = [
      // 🤖 هوش مصنوعی و مدل‌های جدید
      { id: 'src-openai', name: 'OpenAI Official News', url: 'https://openai.com/news/', rssUrl: 'https://openai.com/news/rss.xml', category: 'هوش مصنوعی و مدل‌های جدید', priority: 5 },
      { id: 'src-google-ai', name: 'Google AI & DeepMind', url: 'https://blog.google/technology/ai/', rssUrl: 'https://blog.google/technology/ai/rss/', category: 'هوش مصنوعی و مدل‌های جدید', priority: 5 },
      { id: 'src-nvidia-blog', name: 'NVIDIA AI Blog', url: 'https://blogs.nvidia.com', rssUrl: 'https://blogs.nvidia.com/feed/', category: 'هوش مصنوعی و مدل‌های جدید', priority: 5 },
      { id: 'src-huggingface', name: 'Hugging Face Trending', url: 'https://huggingface.co/blog', rssUrl: 'https://huggingface.co/blog/feed.xml', category: 'هوش مصنوعی و مدل‌های جدید', priority: 5 },
      { id: 'src-mit-tr', name: 'MIT Technology Review', url: 'https://www.technologyreview.com', rssUrl: 'https://www.technologyreview.com/feed/', category: 'هوش مصنوعی و مدل‌های جدید', priority: 5 },

      // 🆕 ابزارها و سایت‌های AI & ابزارهای رایگان
      { id: 'src-producthunt', name: 'Product Hunt (Top Launches)', url: 'https://www.producthunt.com', rssUrl: 'https://www.producthunt.com/feed', category: 'ابزارها و سایت‌های AI', priority: 5 },
      { id: 'src-hackernews-best', name: 'Hacker News (Viral & Best)', url: 'https://news.ycombinator.com', rssUrl: 'https://hnrss.org/best', category: 'ابزارها و سایت‌های AI', priority: 5 },
      { id: 'src-github-blog', name: 'GitHub Trending & Blog', url: 'https://github.blog', rssUrl: 'https://github.blog/feed/', category: 'ابزارها و سایت‌های AI', priority: 4 },

      // 💻 تکنولوژی و اپلیکیشن
      { id: 'src-techcrunch', name: 'TechCrunch', url: 'https://techcrunch.com', rssUrl: 'https://techcrunch.com/feed/', category: 'تکنولوژی و اپلیکیشن', priority: 5 },
      { id: 'src-theverge', name: 'The Verge (Tech)', url: 'https://theverge.com', rssUrl: 'https://www.theverge.com/rss/index.xml', category: 'تکنولوژی و اپلیکیشن', priority: 5 },
      { id: 'src-arstechnica', name: 'Ars Technica', url: 'https://arstechnica.com', rssUrl: 'https://feeds.arstechnica.com/arstechnica/index', category: 'تکنولوژی و اپلیکیشن', priority: 5 },
      { id: 'src-engadget', name: 'Engadget', url: 'https://www.engadget.com', rssUrl: 'https://www.engadget.com/rss.xml', category: 'تکنولوژی و اپلیکیشن', priority: 4 },
      { id: 'src-androidauth', name: 'Android Authority', url: 'https://www.androidauthority.com', rssUrl: 'https://www.androidauthority.com/feed/', category: 'تکنولوژی و اپلیکیشن', priority: 4 },
      { id: 'src-9to5google', name: '9to5Google', url: 'https://9to5google.com', rssUrl: 'https://9to5google.com/feed/', category: 'تکنولوژی و اپلیکیشن', priority: 4 },
      { id: 'src-9to5mac', name: '9to5Mac', url: 'https://9to5mac.com', rssUrl: 'https://9to5mac.com/feed/', category: 'تکنولوژی و اپلیکیشن', priority: 4 },

      // 🎮 گیم و سرگرمی تکنولوژی
      { id: 'src-pcgamer', name: 'PC Gamer (Gaming & Tech)', url: 'https://www.pcgamer.com', rssUrl: 'https://www.pcgamer.com/feeds.xml', category: 'گیم و سرگرمی تکنولوژی', priority: 5 },
      { id: 'src-eurogamer', name: 'Eurogamer (Gaming News)', url: 'https://www.eurogamer.net', rssUrl: 'https://www.eurogamer.net/feed', category: 'گیم و سرگرمی تکنولوژی', priority: 4 },
      { id: 'src-gamespot', name: 'GameSpot News', url: 'https://www.gamespot.com', rssUrl: 'https://www.gamespot.com/feeds/mashup/', category: 'گیم و سرگرمی تکنولوژی', priority: 4 },

      // 🔥 قابلیت‌ها و اتفاقات جدید و جذاب
      { id: 'src-wired-culture', name: 'WIRED (Digital Culture & Tech)', url: 'https://www.wired.com', rssUrl: 'https://www.wired.com/feed/category/culture/latest/rss', category: 'قابلیت‌ها و اتفاقات جدید و جذاب', priority: 5 },
      { id: 'src-gizmodo', name: 'Gizmodo (Future & Gadgets)', url: 'https://gizmodo.com', rssUrl: 'https://gizmodo.com/feed', category: 'قابلیت‌ها و اتفاقات جدید و جذاب', priority: 4 },
      { id: 'src-mashable', name: 'Mashable Tech', url: 'https://mashable.com', rssUrl: 'https://mashable.com/feeds/rss/all', category: 'قابلیت‌ها و اتفاقات جدید و جذاب', priority: 4 }
    ];

    const now = new Date().toISOString();
    for (const src of defaultSources) {
      db.run(
        `INSERT INTO sources (id, name, url, rssUrl, category, enabled, priority, createdAt) VALUES (?, ?, ?, ?, ?, 1, ?, ?);`,
        [src.id, src.name, src.url, src.rssUrl, src.category, src.priority, now]
      );
    }
  }

  // Seed default schedule if empty
  const schedCount = db.exec("SELECT COUNT(*) as cnt FROM schedules;");
  const sCount = schedCount.length > 0 && schedCount[0].values[0] ? (schedCount[0].values[0][0] as number) : 0;
  if (sCount === 0) {
    db.run(
      `INSERT INTO schedules (id, type, intervalMinutes, specificTimesJson, postsPerCycle, dailyLimit, quietHoursStart, quietHoursEnd, isAutoActive)
       VALUES ('main-schedule', 'interval', 60, '["09:00","13:00","17:00","21:00"]', 1, 15, '00:00', '07:00', 1);`
    );
  }

  // Seed default settings if empty
  const settingsEntries = [
    { key: 'botToken', value: '8996706478:AAF1Zch4EdY97w2DI66-Iz5sCN7GSxMlpgQ' },
    { key: 'channelUsername', value: '@ChiDidamTest' },
    { key: 'channelId', value: '-1004410297520' },
    { key: 'channelTitle', value: '«چی دیدم؟! 😳»' },
    { key: 'groqApiKey', value: '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' },
    { key: 'geminiApiKey', value: process.env.GEMINI_API_KEY || '' },
    { key: 'activeAiProvider', value: 'groq' },
    { key: 'groqModel', value: 'openai/gpt-oss-120b' },
    { key: 'geminiModel', value: 'gemini-2.5-flash' },
    { key: 'testMode', value: 'false' },
    { key: 'testIntervalSeconds', value: '50' },
    { key: 'testPostsPerCycle', value: '2' },
    { key: 'testMaxCycles', value: '5' },
    {
      key: 'smartScoreWeights',
      value: JSON.stringify({
        freshness: 0.15,
        curiosity: 0.20,
        usefulness: 0.15,
        virality: 0.25,
        persianRelevance: 0.10,
        visualPotential: 0.05,
        reliability: 0.10
      })
    },
    { key: 'minQualityScore', value: '7.0' }
  ];

  const nowStr = new Date().toISOString();
  for (const s of settingsEntries) {
    const exists = db.exec(`SELECT key FROM settings WHERE key = '${s.key}';`);
    if (exists.length === 0 || exists[0].values.length === 0) {
      db.run(`INSERT INTO settings (key, value, updatedAt) VALUES (?, ?, ?);`, [s.key, s.value, nowStr]);
    }
  }
}

// Log helper
export async function addLog(level: 'info' | 'warn' | 'error' | 'publish', category: string, message: string, details?: any): Promise<void> {
  try {
    const db = await getDb();
    const id = 'log-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7);
    const timestamp = new Date().toISOString();
    const detailsJson = details ? JSON.stringify(details) : null;
    db.run(
      `INSERT INTO logs (id, level, category, message, detailsJson, timestamp) VALUES (?, ?, ?, ?, ?, ?);`,
      [id, level, category, message, detailsJson, timestamp]
    );
    saveDb();
  } catch (err) {
    console.error('Failed to write log:', err);
  }
}

// Settings getter & setter
export async function getSetting(key: string, defaultValue: string = ''): Promise<string> {
  const db = await getDb();
  const res = db.exec(`SELECT value FROM settings WHERE key = ?;`, [key]);
  if (res.length > 0 && res[0].values.length > 0) {
    return String(res[0].values[0][0]);
  }
  return defaultValue;
}

export async function setSetting(key: string, value: string): Promise<void> {
  const db = await getDb();
  const now = new Date().toISOString();
  db.run(`INSERT OR REPLACE INTO settings (key, value, updatedAt) VALUES (?, ?, ?);`, [key, value, now]);
  saveDb();
}
