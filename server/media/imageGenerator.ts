import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const IMAGES_DIR = path.resolve(process.cwd(), 'data', 'images');

if (!fs.existsSync(IMAGES_DIR)) {
  fs.mkdirSync(IMAGES_DIR, { recursive: true });
}

export interface CardOptions {
  title: string;
  category: string;
  hook?: string;
  channelName?: string;
  channelUsername?: string;
}

export async function generateBrandedCardPng(options: CardOptions): Promise<string> {
  const channelName = options.channelName || '«چی دیدم؟! 😳»';
  const channelUsername = options.channelUsername || '@ChiDidamTest';
  const category = options.category || 'تکنولوژی و هوش مصنوعی';
  
  // Truncate title cleanly for card
  let title = options.title.trim();
  if (title.length > 80) {
    title = title.substring(0, 77) + '...';
  }

  // Escape HTML/XML entities
  const safeTitle = escapeXml(title);
  const safeCategory = escapeXml(category);
  const safeChannel = escapeXml(channelName);
  const safeUsername = escapeXml(channelUsername);

  const svg = `
  <svg width="1200" height="675" viewBox="0 0 1200 675" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <!-- Background Gradients -->
      <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#090d16" />
        <stop offset="50%" stop-color="#0f172a" />
        <stop offset="100%" stop-color="#030712" />
      </linearGradient>

      <!-- Glow Orbs -->
      <radialGradient id="cyanGlow" cx="20%" cy="20%" r="50%">
        <stop offset="0%" stop-color="#06b6d4" stop-opacity="0.3" />
        <stop offset="100%" stop-color="#06b6d4" stop-opacity="0" />
      </radialGradient>

      <radialGradient id="amberGlow" cx="85%" cy="75%" r="60%">
        <stop offset="0%" stop-color="#f59e0b" stop-opacity="0.35" />
        <stop offset="100%" stop-color="#f59e0b" stop-opacity="0" />
      </radialGradient>

      <linearGradient id="cardGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#1e293b" stop-opacity="0.75" />
        <stop offset="100%" stop-color="#0f172a" stop-opacity="0.85" />
      </linearGradient>

      <linearGradient id="goldText" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="#fef08a" />
        <stop offset="100%" stop-color="#f59e0b" />
      </linearGradient>
    </defs>

    <!-- Base Canvas -->
    <rect width="1200" height="675" fill="url(#bgGrad)" />

    <!-- Ambient Glows -->
    <rect width="1200" height="675" fill="url(#cyanGlow)" />
    <rect width="1200" height="675" fill="url(#amberGlow)" />

    <!-- Subtle Tech Grid -->
    <g opacity="0.08" stroke="#ffffff" stroke-width="1">
      <path d="M0 75 H1200 M0 150 H1200 M0 225 H1200 M0 300 H1200 M0 375 H1200 M0 450 H1200 M0 525 H1200 M0 600 H1200" />
      <path d="M150 0 V675 M300 0 V675 M450 0 V675 M600 0 V675 M750 0 V675 M900 0 V675 M1050 0 V675" />
    </g>

    <!-- Inner Card container -->
    <rect x="70" y="55" width="1060" height="565" rx="28" fill="url(#cardGrad)" stroke="#334155" stroke-width="2" />

    <!-- Top Badge Row -->
    <g transform="translate(100, 110)">
      <!-- Channel Brand Badge -->
      <rect x="0" y="0" width="230" height="54" rx="27" fill="#f59e0b" fill-opacity="0.15" stroke="#f59e0b" stroke-width="1.5" />
      <text x="115" y="35" font-family="Vazirmatn, sans-serif" font-size="22" font-weight="bold" fill="#fef08a" text-anchor="middle" direction="rtl">
        ${safeChannel}
      </text>

      <!-- Category Pill -->
      <rect x="250" y="0" width="260" height="54" rx="27" fill="#38bdf8" fill-opacity="0.12" stroke="#38bdf8" stroke-width="1.2" />
      <text x="380" y="35" font-family="Vazirmatn, sans-serif" font-size="20" font-weight="600" fill="#7dd3fc" text-anchor="middle" direction="rtl">
        ${safeCategory}
      </text>
    </g>

    <!-- Center Icon / Emoji Accent -->
    <circle cx="980" cy="140" r="45" fill="#1e293b" stroke="#475569" stroke-width="2" />
    <text x="980" y="155" font-size="44" text-anchor="middle">⚡️</text>

    <!-- Main Headline in Persian -->
    <g transform="translate(1030, 270)">
      <text x="0" y="40" font-family="Vazirmatn, sans-serif" font-size="48" font-weight="900" fill="#f8fafc" text-anchor="end" direction="rtl" letter-spacing="-0.5">
        ${safeTitle}
      </text>
    </g>

    <!-- Bottom Info Bar -->
    <line x1="120" y1="520" x2="1080" y2="520" stroke="#334155" stroke-width="1.5" stroke-dasharray="6 6" />

    <g transform="translate(100, 565)">
      <!-- Channel username handle -->
      <text x="980" y="0" font-family="Vazirmatn, sans-serif" font-size="24" font-weight="bold" fill="url(#goldText)" text-anchor="end">
        ${safeUsername}
      </text>
      <!-- Sub-label -->
      <text x="20" y="0" font-family="Vazirmatn, sans-serif" font-size="20" font-weight="500" fill="#94a3b8" text-anchor="start" direction="rtl">
        موتور هوشمند کشف و رصد محتوای روز اینترنت
      </text>
    </g>
  </svg>
  `;

  const fileName = `card-${Date.now()}-${Math.random().toString(36).substring(2, 8)}.png`;
  const filePath = path.join(IMAGES_DIR, fileName);

  const pngBuffer = await sharp(Buffer.from(svg))
    .png({ quality: 90 })
    .toBuffer();

  fs.writeFileSync(filePath, pngBuffer);
  return filePath;
}

function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
