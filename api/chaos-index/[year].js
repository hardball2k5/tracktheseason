/**
 * TRACK THE SEASON — Chaos Index History
 * /api/chaos-index/2026
 * /api/chaos-index/2025
 * /api/chaos-index/2024
 * /api/chaos-index/2023
 *
 * Returns an SVG bar chart showing how many teams were
 * ±5+ wins off their prior-year pace at the same GP point
 * for the requested year vs the 3 prior seasons.
 *
 * ?gp=66  override games-played comparison point (default: current season GP)
 */

export const config = { runtime: 'edge' };

const ALL_TEAM_IDS = [
  108,109,110,111,112,113,114,115,116,117,118,119,120,121,
  133,134,135,136,137,138,139,140,141,142,143,144,145,146,147,158
];

const CHAOS_THRESHOLD = 5;

function esc(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

async function loadWins(teamId, year) {
  try {
    const res  = await fetch(
      `https://statsapi.mlb.com/api/v1/schedule?sportId=1&teamId=${teamId}&season=${year}&gameTypes=R`
    );
    const data = await res.json();
    const games = [];
    for (const d of data.dates || []) {
      for (const g of d.games || []) {
        if (g.status?.abstractGameState !== 'Final') continue;
        const h = g.teams?.home, a = g.teams?.away;
        if (h?.score == null || a?.score == null || h.score === a.score) continue;
        const isHome = String(h.team.id) === String(teamId);
        games.push(isHome ? h.score > a.score : a.score > h.score);
      }
    }
    return games; // array of booleans (true=win)
  } catch { return []; }
}

/* Count chaos teams for a given year at a given GP snapshot */
async function chaosCount(year, gp) {
  const prevYear = year - 1;
  const BATCH = 6;
  let chaotic = 0, total = 0;

  for (let i = 0; i < ALL_TEAM_IDS.length; i += BATCH) {
    const batch = ALL_TEAM_IDS.slice(i, i + BATCH);
    const results = await Promise.allSettled(
      batch.map(async id => {
        const [cur, prev] = await Promise.all([
          loadWins(id, year),
          loadWins(id, prevYear),
        ]);
        if (cur.length < 10 || prev.length < 10) return null; /* need at least 10 games */
        const useGp = Math.min(gp, cur.length, prev.length);
        const curW  = cur.slice(0, useGp).filter(Boolean).length;
        const prevW = prev.slice(0, useGp).filter(Boolean).length;
        return Math.abs(curW - prevW);
      })
    );
    for (const r of results) {
      if (r.status === 'fulfilled' && r.value !== null) {
        total++;
        if (r.value >= CHAOS_THRESHOLD) chaotic++;
      }
    }
  }
  return { chaotic, total, pct: Math.round(chaotic / 30 * 100) };
}

function buildSVG(year, rows, gpLabel) {
  const W = 1200, H = 630;
  const today = new Date().toLocaleDateString('en-US', {month:'long', day:'numeric', year:'numeric'});
  const currentYear = new Date().getFullYear();

  /* Layout */
  const PAD_L = 100, PAD_R = 60, PAD_T = 140, BAR_AREA_W = W - PAD_L - PAD_R;
  const ROW_H = 88, ROW_GAP = 8;
  const BAR_MAX_W = BAR_AREA_W - 220; /* leave room for count label */
  const maxCount = Math.max(...rows.map(r => r.chaotic), 1); /* no artificial floor */

  /* Color per row — current year is signal green, others fade */
  function rowColor(y) {
    if (y === currentYear) return '#1aff6b';
    const age = currentYear - y;
    return age === 1 ? 'rgba(26,255,107,0.55)' : age === 2 ? 'rgba(26,255,107,0.35)' : 'rgba(26,255,107,0.2)';
  }
  function textColor(y) {
    return y === currentYear ? '#e8edf8' : 'rgba(232,237,248,0.5)';
  }

  const bars = rows.map((r, i) => {
    const y   = PAD_T + i * (ROW_H + ROW_GAP);
    const bw  = Math.max(8, (r.chaotic / maxCount) * BAR_MAX_W);
    const col = rowColor(r.year);
    const tc  = textColor(r.year);
    const isCurrent = r.year === currentYear;
    const barY = y + ROW_H / 2 - 20;

    return `
    <!-- Row ${r.year} -->
    <text x="${PAD_L - 12}" y="${barY + 28}" text-anchor="end"
      font-family="'IBM Plex Mono','Courier New',monospace"
      font-size="${isCurrent ? 22 : 18}" font-weight="${isCurrent ? 700 : 400}"
      fill="${tc}">${r.year}</text>

    <!-- Bar background -->
    <rect x="${PAD_L}" y="${barY}" width="${BAR_MAX_W}" height="40" rx="4"
      fill="rgba(255,255,255,0.04)"/>

    <!-- Bar fill -->
    <rect x="${PAD_L}" y="${barY}" width="${bw}" height="40" rx="4"
      fill="${col}" opacity="${isCurrent ? 1 : 0.85}"/>

    <!-- Count label inside/outside bar -->
    <text x="${PAD_L + bw + 12}" y="${barY + 27}"
      font-family="'IBM Plex Mono','Courier New',monospace"
      font-size="${isCurrent ? 20 : 16}" font-weight="${isCurrent ? 700 : 400}"
      fill="${tc}">${r.chaotic} teams${isCurrent ? ' ← this year' : ''}</text>

    <!-- Pct sub-label -->
    <text x="${PAD_L + bw + 12}" y="${barY + 47}"
      font-family="'IBM Plex Mono','Courier New',monospace"
      font-size="11" fill="rgba(255,255,255,0.25)">${r.pct}% of MLB off prior-year pace</text>
    `;
  }).join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg"
     width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <style>text{font-family:'IBM Plex Mono','Courier New',monospace}</style>
    <radialGradient id="glow" cx="50%" cy="0%" r="60%">
      <stop offset="0%" stop-color="#1aff6b" stop-opacity="0.07"/>
      <stop offset="100%" stop-color="#0f1014" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="topbar" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%"   stop-color="#1aff6b" stop-opacity="0"/>
      <stop offset="20%"  stop-color="#1aff6b" stop-opacity="1"/>
      <stop offset="80%"  stop-color="#1aff6b" stop-opacity="1"/>
      <stop offset="100%" stop-color="#1aff6b" stop-opacity="0"/>
    </linearGradient>
    <pattern id="dots" x="0" y="0" width="40" height="40" patternUnits="userSpaceOnUse">
      <circle cx="20" cy="20" r="1" fill="rgba(255,255,255,0.025)"/>
    </pattern>
  </defs>

  <!-- Background -->
  <rect width="${W}" height="${H}" fill="#0f1014"/>
  <rect width="${W}" height="${H}" fill="url(#dots)"/>
  <rect width="${W}" height="${H}" fill="url(#glow)"/>
  <rect x="0" y="0" width="3" height="${H}" fill="rgba(26,255,107,0.2)"/>
  <rect x="${W-3}" y="0" width="3" height="${H}" fill="rgba(26,255,107,0.2)"/>
  <rect width="${W}" height="5" fill="url(#topbar)"/>

  <!-- TTS monogram -->
  <rect x="48" y="28" width="36" height="36" rx="7" fill="#1aff6b"/>
  <text x="66" y="52" text-anchor="middle" font-size="11" font-weight="700"
    fill="#0f1014">TTS</text>
  <text x="96" y="44" font-size="13" font-weight="700" fill="#e8edf8"
    letter-spacing="2">TRACK THE <tspan fill="#1aff6b">SEASON</tspan></text>
  <text x="96" y="60" font-size="10" fill="rgba(255,255,255,0.25)"
    letter-spacing="3">tracktheseason.com</text>

  <!-- Live badge -->
  <rect x="${W-240}" y="28" width="192" height="36" rx="18"
    fill="rgba(26,255,107,0.08)" stroke="rgba(26,255,107,0.2)" stroke-width="1"/>
  <circle cx="${W-228}" cy="46" r="4" fill="#1aff6b"/>
  <text x="${W-218}" y="51" font-size="11" font-weight="700" fill="#1aff6b"
    letter-spacing="2">LIVE · ${esc(today)}</text>

  <!-- Headline -->
  <text x="${W/2}" y="98" text-anchor="middle" font-size="13" font-weight="700"
    fill="rgba(26,255,107,0.6)" letter-spacing="5">
    MLB CHAOS INDEX · THROUGH GAME ${esc(gpLabel)} · ±5+ WINS OFF PRIOR-YEAR PACE
  </text>

  <!-- Divider -->
  <rect x="48" y="108" width="${W-96}" height="1" fill="rgba(255,255,255,0.07)"/>

  <!-- Bars -->
  ${bars}

  <!-- Footer -->
  <rect x="0" y="${H-36}" width="${W}" height="36" fill="#1a1d24"/>
  <line x1="0" y1="${H-36}" x2="${W}" y2="${H-36}" stroke="rgba(255,255,255,0.05)" stroke-width="1"/>
  <text x="${W/2}" y="${H-13}" text-anchor="middle" font-size="10"
    fill="rgba(255,255,255,0.2)" letter-spacing="2">
    TRACKTHESEASON.COM · Pace-based. Not a predictive model. #TrackTheSeason
  </text>
</svg>`;
}

export default async function handler(req) {
  const url      = new URL(req.url);
  const yearStr  = url.pathname.split('/').filter(Boolean).pop();
  const year     = Number(yearStr);
  const curYear  = new Date().getFullYear();

  if (!year || year < 2020 || year > curYear) {
    return new Response('Invalid year', { status: 400 });
  }

  /* Determine GP snapshot — use ?gp param or auto-detect from current season */
  let gpSnapshot = Number(url.searchParams.get('gp')) || 0;
  if (!gpSnapshot) {
    /* Load one team to find current GP */
    const sample = await loadWins(143, curYear); /* Phillies as proxy */
    gpSnapshot = Math.max(10, sample.length);
  }

  /* Build 4 years ending at requested year */
  const years = [year, year-1, year-2, year-3].filter(y => y >= 2020);

  /* Fetch all years in parallel */
  const results = await Promise.all(
    years.map(y => chaosCount(y, gpSnapshot))
  );

  const rows = years.map((y, i) => ({ year: y, ...results[i] }));
  const gpLabel = String(gpSnapshot);

  const svg = buildSVG(year, rows, gpLabel);

  return new Response(svg, {
    headers: {
      'Content-Type':  'image/svg+xml',
      'Cache-Control': 'public, max-age=3600, stale-while-revalidate=7200',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
