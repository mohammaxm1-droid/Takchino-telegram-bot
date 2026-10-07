import Parser from 'rss-parser';
import * as cheerio from 'cheerio';
import { getDb, saveDb, addLog, SourceRow } from '../db/database.ts';

const parser = new Parser({
  timeout: 12000,
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 ChiDidamBot/1.0'
  }
});

export interface DiscoveredCandidate {
  sourceId: string;
  sourceName: string;
  sourceCategory: string;
  sourcePriority: number;
  title: string;
  url: string;
  summary: string;
  content: string;
  publishedAt: string;
  imageUrl?: string | null;
  author?: string;
}

export async function getSources(onlyEnabled: boolean = false): Promise<SourceRow[]> {
  const db = await getDb();
  const query = onlyEnabled
    ? 'SELECT * FROM sources WHERE enabled = 1 ORDER BY priority DESC, name ASC;'
    : 'SELECT * FROM sources ORDER BY priority DESC, name ASC;';

  const res = db.exec(query);
  if (res.length === 0 || res[0].values.length === 0) return [];

  const columns = res[0].columns;
  return res[0].values.map((row) => {
    const item: any = {};
    columns.forEach((col, idx) => {
      item[col] = row[idx];
    });
    return item as SourceRow;
  });
}

export async function fetchFeedFromSource(source: SourceRow): Promise<DiscoveredCandidate[]> {
  const candidates: DiscoveredCandidate[] = [];
  const db = await getDb();
  const now = new Date().toISOString();

  try {
    const feed = await parser.parseURL(source.rssUrl);
    
    // Process top 10 items per feed
    const items = (feed.items || []).slice(0, 10);
    for (const item of items) {
      if (!item.title || !item.link) continue;

      let imageUrl: string | null = null;
      if (item.enclosure && item.enclosure.url) {
        imageUrl = item.enclosure.url;
      }

      // Check media:content or media:thumbnail in custom fields
      if (!imageUrl && (item as any)['media:content'] && (item as any)['media:content']['$']?.url) {
        imageUrl = (item as any)['media:content']['$'].url;
      }
      if (!imageUrl && (item as any)['media:thumbnail'] && (item as any)['media:thumbnail']['$']?.url) {
        imageUrl = (item as any)['media:thumbnail']['$'].url;
      }

      // Check HTML content for <img> tags
      const rawHtml = (item as any)['content:encoded'] || item.content || '';
      if (!imageUrl && rawHtml) {
        const imgMatch = rawHtml.match(/<img[^>]+src=["'](https?:\/\/[^"']+)["']/i);
        if (imgMatch && imgMatch[1]) {
          imageUrl = imgMatch[1];
        }
      }

      const snippet = item.contentSnippet || item.summary || item.content || '';
      const publishedAt = item.isoDate || item.pubDate || now;

      candidates.push({
        sourceId: source.id,
        sourceName: source.name,
        sourceCategory: source.category,
        sourcePriority: source.priority,
        title: item.title.trim(),
        url: item.link.trim(),
        summary: snippet.slice(0, 500).trim(),
        content: (item.content || snippet).slice(0, 4000).trim(),
        publishedAt: new Date(publishedAt).toISOString(),
        imageUrl,
        author: item.creator || (item as any).author || undefined
      });
    }

    db.run(`UPDATE sources SET lastChecked = ?, lastSuccess = ?, lastError = NULL WHERE id = ?;`, [now, now, source.id]);
    saveDb();
  } catch (err: any) {
    console.warn(`Error fetching source ${source.name} (${source.rssUrl}):`, err.message);
    db.run(`UPDATE sources SET lastChecked = ?, lastError = ? WHERE id = ?;`, [now, err.message, source.id]);
    saveDb();
    await addLog('warn', 'Source', `خطا در واکشی منبع ${source.name}: ${err.message}`);
  }

  return candidates;
}

export async function scrapeCustomUrl(targetUrl: string): Promise<DiscoveredCandidate> {
  const response = await fetch(targetUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
    }
  });

  if (!response.ok) {
    throw new Error(`خطا در باز کردن آدرس (${response.status}): ${response.statusText}`);
  }

  const html = await response.text();
  const $ = cheerio.load(html);

  // Extract meta details
  const title =
    $('meta[property="og:title"]').attr('content') ||
    $('meta[name="twitter:title"]').attr('content') ||
    $('title').text() ||
    'مطلب بدون عنوان';

  const description =
    $('meta[property="og:description"]').attr('content') ||
    $('meta[name="twitter:description"]').attr('content') ||
    $('meta[name="description"]').attr('content') ||
    '';

  const imageUrl =
    $('meta[property="og:image"]').attr('content') ||
    $('meta[name="twitter:image"]').attr('content') ||
    null;

  // Extract main text content
  $('script, style, noscript, nav, header, footer, iframe, ads').remove();
  let articleContent = $('article').text();
  if (!articleContent || articleContent.length < 150) {
    articleContent = $('main').text();
  }
  if (!articleContent || articleContent.length < 150) {
    articleContent = $('body').text();
  }

  // Clean whitespace
  const cleanContent = articleContent.replace(/\s+/g, ' ').slice(0, 4000).trim();

  let hostname = '';
  try {
    hostname = new URL(targetUrl).hostname.replace('www.', '');
  } catch {
    hostname = 'سایت خارجی';
  }

  return {
    sourceId: 'custom-url',
    sourceName: hostname,
    sourceCategory: 'لینک سفارشی',
    sourcePriority: 5,
    title: title.trim(),
    url: targetUrl,
    summary: description.trim(),
    content: cleanContent || description,
    publishedAt: new Date().toISOString(),
    imageUrl
  };
}

export async function testFeedUrl(feedOrSiteUrl: string): Promise<{
  success: boolean;
  title?: string;
  description?: string;
  link?: string;
  itemsCount?: number;
  sampleItems?: Array<{ title: string; link: string; publishedAt: string; hasImage: boolean }>;
  error?: string;
}> {
  try {
    let targetRss = feedOrSiteUrl.trim();
    if (!targetRss.startsWith('http://') && !targetRss.startsWith('https://')) {
      targetRss = 'https://' + targetRss;
    }

    let feed;
    try {
      feed = await parser.parseURL(targetRss);
    } catch (parseErr: any) {
      // If direct parse fails, try auto-discovering RSS from HTML
      const htmlRes = await fetch(targetRss, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
        signal: AbortSignal.timeout(7000)
      });
      if (!htmlRes.ok) throw parseErr;
      const html = await htmlRes.text();
      const $ = cheerio.load(html);
      const discoveredHref =
        $('link[type="application/rss+xml"]').attr('href') ||
        $('link[type="application/atom+xml"]').attr('href') ||
        $('a[href*="rss"]').attr('href') ||
        $('a[href*="feed"]').attr('href');

      if (discoveredHref) {
        const resolvedRss = new URL(discoveredHref, targetRss).toString();
        feed = await parser.parseURL(resolvedRss);
        targetRss = resolvedRss;
      } else {
        throw new Error('فید معتبری در این آدرس یافت نشد. لطفاً آدرس مستقیم RSS یا Feed را وارد کنید.');
      }
    }

    const items = feed.items || [];
    const sampleItems = items.slice(0, 3).map((item) => {
      let hasImage = !!(item.enclosure?.url);
      if (!hasImage && (item as any)['media:content']) hasImage = true;
      return {
        title: item.title || 'بدون عنوان',
        link: item.link || '',
        publishedAt: item.isoDate || item.pubDate || new Date().toISOString(),
        hasImage
      };
    });

    return {
      success: true,
      title: feed.title || 'فید ناشناس',
      description: feed.description || '',
      link: feed.link || targetRss,
      itemsCount: items.length,
      sampleItems
    };
  } catch (err: any) {
    return {
      success: false,
      error: err.message || 'خطا در بررسی فید'
    };
  }
}

export async function fetchArticleOpenGraphImage(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
      },
      signal: AbortSignal.timeout(6000)
    });
    if (!res.ok) return null;
    const html = await res.text();
    const $ = cheerio.load(html);
    const img =
      $('meta[property="og:image"]').attr('content') ||
      $('meta[name="twitter:image"]').attr('content') ||
      $('meta[name="twitter:image:src"]').attr('content') ||
      $('article img').first().attr('src') ||
      null;
    return img;
  } catch {
    return null;
  }
}


