import { getDb, saveDb, addLog, getSetting } from '../db/database.ts';
import { getSources, fetchFeedFromSource, DiscoveredCandidate } from '../sources/sourceManager.ts';

export interface ScoredCandidate extends DiscoveredCandidate {
  freshnessScore: number;
  viralityScore: number;
  smartScore: number;
  isBreaking: boolean;
  scoreBreakdown: {
    freshness: number;
    curiosity: number;
    usefulness: number;
    virality: number;
    persianRelevance: number;
    visualPotential: number;
    reliability: number;
  };
}

export async function runDiscoveryCycle(limit: number = 25): Promise<ScoredCandidate[]> {
  const sources = await getSources(true);
  if (sources.length === 0) {
    await addLog('warn', 'Discovery', 'هیچ منبع فعالی برای رصد یافت نشد.');
    return [];
  }

  await addLog('info', 'Discovery', `شروع چرخه کشف محتوا از ${sources.length} منبع فعال...`);

  // Parallel fetch with concurrency control
  const fetchPromises = sources.map((source) => fetchFeedFromSource(source));
  const results = await Promise.allSettled(fetchPromises);

  const allCandidates: DiscoveredCandidate[] = [];
  for (const res of results) {
    if (res.status === 'fulfilled') {
      allCandidates.push(...res.value);
    }
  }

  await addLog('info', 'Discovery', `در مجموع ${allCandidates.length} مطلب خام استخراج شد. در حال فیلتر و امتیازدهی...`);

  // Filter out duplicates already in DB
  const db = await getDb();
  const existingUrlsQuery = db.exec('SELECT url, title FROM articles UNION SELECT sourceUrl, title FROM posts;');
  const existingUrls = new Set<string>();
  const existingTitles: string[] = [];

  if (existingUrlsQuery.length > 0 && existingUrlsQuery[0].values) {
    for (const row of existingUrlsQuery[0].values) {
      if (row[0]) existingUrls.add(normalizeUrl(String(row[0])));
      if (row[1]) existingTitles.push(String(row[1]).toLowerCase());
    }
  }

  // Get recent published categories for diversity calculation
  const recentCategoriesQuery = db.exec(`
    SELECT p.breakdownJson, p.title, a.category 
    FROM posts p 
    LEFT JOIN articles a ON p.articleId = a.id 
    ORDER BY p.createdAt DESC 
    LIMIT 10;
  `);

  const recentCategories: string[] = [];
  if (recentCategoriesQuery.length > 0 && recentCategoriesQuery[0].values) {
    for (const row of recentCategoriesQuery[0].values) {
      const cat = row[2] ? String(row[2]) : '';
      if (cat) recentCategories.push(cat);
    }
  }

  // Get weights from settings
  let weights = {
    freshness: 0.15,
    curiosity: 0.20,
    usefulness: 0.15,
    virality: 0.25,
    persianRelevance: 0.10,
    visualPotential: 0.05,
    reliability: 0.10
  };

  try {
    const rawWeights = await getSetting('smartScoreWeights', '');
    if (rawWeights) {
      weights = { ...weights, ...JSON.parse(rawWeights) };
    }
  } catch (e) {
    console.error('Error parsing weights setting:', e);
  }

  const scoredCandidates: ScoredCandidate[] = [];

  for (const candidate of allCandidates) {
    const normUrl = normalizeUrl(candidate.url);
    if (existingUrls.has(normUrl)) {
      continue;
    }

    // Title similarity check
    const candTitleLow = candidate.title.toLowerCase();
    const isDuplicateTitle = existingTitles.some((t) => calculateSimilarity(candTitleLow, t) > 0.85);
    if (isDuplicateTitle) {
      continue;
    }

    // Calculate Freshness (0 to 10)
    const pubDate = new Date(candidate.publishedAt).getTime();
    const ageHours = Math.max(0, (Date.now() - pubDate) / (1000 * 60 * 60));
    let freshness = 5;
    if (ageHours <= 6) freshness = 10;
    else if (ageHours <= 24) freshness = 8.5;
    else if (ageHours <= 72) freshness = 6.5;
    else if (ageHours <= 168) freshness = 4;
    else freshness = 1.5;

    // Reliability from source priority (1 to 5 -> map to 2 to 10)
    const reliability = Math.min(10, candidate.sourcePriority * 2);

    // Visual potential
    const visualPotential = candidate.imageUrl ? 9 : 5;

    // Curiosity & Usefulness heuristics based on keywords in title/content
    const textSample = (candidate.title + ' ' + candidate.summary).toLowerCase();
    let curiosity = 6;
    let usefulness = 6;
    let virality = 6;
    let persianRelevance = 7;

    // Check for high curiosity/weird/novel triggers
    if (/secret|hidden|unbelievable|strange|weird|bizarre|mind-blowing|crazy|unexpected|wtf/i.test(textSample)) {
      curiosity += 3;
      virality += 2;
    }

    // Check for utility / tools / tricks
    if (/tool|app|website|trick|shortcut|how to|release|feature|workflow|github|free|open-source/i.test(textSample)) {
      usefulness += 2.5;
      persianRelevance += 1.5;
    }

    // Check for viral AI announcements
    if (/gpt|openai|gemini|claude|deepseek|midjourney|ai agent|sora|apple intelligence/i.test(textSample)) {
      virality += 2;
      curiosity += 1;
    }

    // Breaking news detection
    const isBreaking =
      candidate.sourcePriority >= 4 &&
      ageHours <= 4 &&
      /announces|launches|unveils|releases|breaking|warning|critical|new model|major update/i.test(textSample);

    if (isBreaking) {
      virality = Math.min(10, virality + 2);
      freshness = 10;
    }

    // Clamp sub-scores between 1 and 10
    curiosity = Math.min(10, Math.max(1, curiosity));
    usefulness = Math.min(10, Math.max(1, usefulness));
    virality = Math.min(10, Math.max(1, virality));
    persianRelevance = Math.min(10, Math.max(1, persianRelevance));

    // Calculate smart score
    let smartScore =
      freshness * weights.freshness +
      curiosity * weights.curiosity +
      usefulness * weights.usefulness +
      virality * weights.virality +
      persianRelevance * weights.persianRelevance +
      visualPotential * weights.visualPotential +
      reliability * weights.reliability;

    // Smart Content Diversity Bonus/Penalty (Takchino 5 pillars balance):
    // Count how often each category appeared in recent posts
    const categoryFrequency = recentCategories.filter(
      (c) => c.toLowerCase() === candidate.sourceCategory.toLowerCase()
    ).length;

    if (categoryFrequency >= 2) {
      smartScore -= 1.0; // Penalty if this category was posted twice recently
    } else if (categoryFrequency === 0) {
      smartScore += 1.2; // Significant bonus for underrepresented category (e.g. Gaming or Free Tools or Apps)
    }

    scoredCandidates.push({
      ...candidate,
      freshnessScore: Number(freshness.toFixed(1)),
      viralityScore: Number(virality.toFixed(1)),
      smartScore: Number(smartScore.toFixed(2)),
      isBreaking,
      scoreBreakdown: {
        freshness,
        curiosity,
        usefulness,
        virality,
        persianRelevance,
        visualPotential,
        reliability
      }
    });
  }

  // Sort by highest smart score first
  scoredCandidates.sort((a, b) => b.smartScore - a.smartScore);

  const topCandidates = scoredCandidates.slice(0, limit);

  // Store in DB articles table
  const nowStr = new Date().toISOString();
  for (const cand of topCandidates) {
    try {
      const artId = 'art-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6);
      db.run(
        `INSERT OR IGNORE INTO articles 
        (id, sourceId, title, url, summary, content, author, publishedAt, imageUrl, category, freshnessScore, viralityScore, smartScore, rawJson, createdAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
        [
          artId,
          cand.sourceId,
          cand.title,
          cand.url,
          cand.summary,
          cand.content,
          cand.author || null,
          cand.publishedAt,
          cand.imageUrl || null,
          cand.sourceCategory,
          cand.freshnessScore,
          cand.viralityScore,
          cand.smartScore,
          JSON.stringify(cand.scoreBreakdown),
          nowStr
        ]
      );
    } catch (e) {
      // Ignore unique constraint violation
    }
  }
  saveDb();

  await addLog(
    'info',
    'Discovery',
    `تعداد ${topCandidates.length} نامزد برتر با بالاترین امتیاز وایرالیتی و جذابیت ذخیره شدند.`
  );

  return topCandidates;
}

function normalizeUrl(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl);
    // Remove UTM tracking and unnecessary query params
    const searchParams = new URLSearchParams(parsed.search);
    for (const key of Array.from(searchParams.keys())) {
      if (key.startsWith('utm_') || key === 'ref' || key === 'fbclid' || key === 'source') {
        searchParams.delete(key);
      }
    }
    parsed.search = searchParams.toString();
    parsed.hash = '';
    return parsed.toString().toLowerCase().replace(/\/$/, '');
  } catch {
    return rawUrl.trim().toLowerCase();
  }
}

function calculateSimilarity(str1: string, str2: string): number {
  const set1 = new Set(str1.split(/\s+/).filter((w) => w.length > 2));
  const set2 = new Set(str2.split(/\s+/).filter((w) => w.length > 2));
  if (set1.size === 0 || set2.size === 0) return 0;

  let intersection = 0;
  for (const item of set1) {
    if (set2.has(item)) intersection++;
  }
  return (2 * intersection) / (set1.size + set2.size);
}
