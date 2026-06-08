/**
 * TRACK THE SEASON — Team Share Card
 * /api/card/[slug].js
 *
 * Returns an SVG social card for each team.
 * Works with Vercel Edge Runtime — no build step, no dependencies.
 * Twitter, Facebook, Discord, iMessage, Slack all render SVG og:images.
 *
 * Usage: https://tracktheseason.com/api/card/phillies
 */

export const config = { runtime: 'edge' };

const TEAM_SLUGS = {
  'angels':108,'diamondbacks':109,'orioles':110,'red-sox':111,
  'cubs':112,'reds':113,'guardians':114,'rockies':115,'tigers':116,
  'astros':117,'royals':118,'dodgers':119,'nationals':120,'mets':121,
  'athletics':133,'pirates':134,'padres':135,'mariners':136,'giants':137,
  'cardinals':138,'rays':139,'rangers':140,'blue-jays':141,'twins':142,
  'phillies':143,'braves':144,'white-sox':145,'marlins':146,'yankees':147,
  'brewers':158,
};

const TEAM_NAMES = {
  108:'Los Angeles Angels',109:'Arizona Diamondbacks',110:'Baltimore Orioles',
  111:'Boston Red Sox',112:'Chicago Cubs',113:'Cincinnati Reds',
  114:'Cleveland Guardians',115:'Colorado Rockies',116:'Detroit Tigers',
  117:'Houston Astros',118:'Kansas City Royals',119:'Los Angeles Dodgers',
  120:'Washington Nationals',121:'New York Mets',133:'Oakland Athletics',
  134:'Pittsburgh Pirates',135:'San Diego Padres',136:'Seattle Mariners',
  137:'San Francisco Giants',138:'St. Louis Cardinals',139:'Tampa Bay Rays',
  140:'Texas Rangers',141:'Toronto Blue Jays',142:'Minnesota Twins',
  143:'Philadelphia Phillies',144:'Atlanta Braves',145:'Chicago White Sox',
  146:'Miami Marlins',147:'New York Yankees',158:'Milwaukee Brewers',
};

const SEASON_GAMES = 162;

async function loadSchedule(teamId, year) {
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
      games.push({ win: isHome ? h.score > a.score : a.score > h.score });
    }
  }
  return games;
}

function esc(s) {
  return String(s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function buildCard(teamName, slug, stats, season) {
  const { w, l, gp, proj, l10w, l10l, delta } = stats;
  const compareYear = season - 1;
  const record  = gp > 0 ? `${w}–${l}` : '—';
  const paceStr = proj ? `${proj}W` : '—';
  const l10Str  = gp >= 10 ? `${l10w}–${l10l}` : '—';
  const deltaNum = delta !== null ? delta : null;
  const deltaStr = deltaNum !== null ? `${deltaNum >= 0 ? '+' : ''}${deltaNum}W` : '—';
  const deltaColor = deltaNum > 0 ? '#4ecb77' : deltaNum < 0 ? '#f47570' : '#8a8a82';
  const l10Color = gp >= 10 ? (l10w >= 7 ? '#4ecb77' : l10w <= 3 ? '#f47570' : '#e8edf8') : '#8a8a82';
  const teamId = TEAM_SLUGS[slug];
  const logoUrl = `https://www.mlbstatic.com/team-logos/${teamId}.svg`;

  /* Card is 1200×630 */
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"
     width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <style>
      text { font-family: 'IBM Plex Mono', 'Courier New', monospace; }
    </style>
    <radialGradient id="glow" cx="50%" cy="0%" r="60%">
      <stop offset="0%" stop-color="#1aff6b" stop-opacity="0.07"/>
      <stop offset="100%" stop-color="#0f1014" stop-opacity="0"/>
    </radialGradient>
    <clipPath id="logo-clip">
      <rect x="0" y="0" width="72" height="72" rx="10" ry="10"/>
    </clipPath>
  </defs>

  <!-- Background -->
  <rect width="1200" height="630" fill="#0f1014"/>
  <rect width="1200" height="630" fill="url(#glow)"/>

  <!-- Top green border -->
  <rect width="1200" height="4" fill="#1aff6b"/>

  <!-- TTS monogram -->
  <rect x="52" y="48" width="44" height="44" rx="8" fill="#1aff6b"/>
  <text x="74" y="75" text-anchor="middle" font-size="14" font-weight="700" fill="#0f1014">TTS</text>

  <!-- Wordmark -->
  <text x="108" y="66" font-size="15" font-weight="700" fill="#e8edf8" letter-spacing="1">TRACK THE <tspan fill="#1aff6b">SEASON</tspan></text>
  <text x="108" y="84" font-size="11" fill="#8a8a82" letter-spacing="2">tracktheseason.com/${esc(slug)}</text>

  <!-- Team logo (white bg square) -->
  <rect x="1068" y="40" width="84" height="84" rx="12" fill="#ffffff" filter="drop-shadow(0 4px 12px rgba(0,0,0,0.4))"/>
  <image href="${esc(logoUrl)}" x="1073" y="45" width="74" height="74" preserveAspectRatio="xMidYMid meet"/>

  <!-- Team name -->
  <text x="52" y="170" font-size="58" font-weight="700" fill="#e8edf8" letter-spacing="-1">${esc(teamName)}</text>

  <!-- Season label -->
  <text x="54" y="205" font-size="14" fill="#8a8a82" letter-spacing="3">${esc(String(season))} SEASON · ${esc(String(gp))} GAMES PLAYED</text>

  <!-- Stat cards background -->
  <!-- Record tile -->
  <rect x="52" y="240" width="258" height="130" rx="12" fill="#1a1d24" stroke="rgba(255,255,255,0.07)" stroke-width="1"/>
  <text x="72" y="270" font-size="11" font-weight="700" fill="#8a8a82" letter-spacing="2">RECORD</text>
  <text x="72" y="330" font-size="44" font-weight="700" fill="#1aff6b" letter-spacing="-1">${esc(record)}</text>
  <text x="72" y="358" font-size="12" fill="#8a8a82">${esc(String(gp))} games played</text>

  <!-- Win Pace tile -->
  <rect x="326" y="240" width="258" height="130" rx="12" fill="#1a1d24" stroke="rgba(255,255,255,0.07)" stroke-width="1"/>
  <text x="346" y="270" font-size="11" font-weight="700" fill="#8a8a82" letter-spacing="2">WIN PACE</text>
  <text x="346" y="330" font-size="44" font-weight="700" fill="#e8edf8" letter-spacing="-1">${esc(paceStr)}</text>
  <text x="346" y="358" font-size="12" fill="#8a8a82">projected wins</text>

  <!-- Last 10 tile -->
  <rect x="600" y="240" width="258" height="130" rx="12" fill="#1a1d24" stroke="rgba(255,255,255,0.07)" stroke-width="1"/>
  <text x="620" y="270" font-size="11" font-weight="700" fill="#8a8a82" letter-spacing="2">LAST 10</text>
  <text x="620" y="330" font-size="44" font-weight="700" fill="${esc(l10Color)}" letter-spacing="-1">${esc(l10Str)}</text>
  <text x="620" y="358" font-size="12" fill="#8a8a82">last 10 games</text>

  <!-- vs prior year tile -->
  <rect x="874" y="240" width="278" height="130" rx="12" fill="#1a1d24" stroke="rgba(255,255,255,0.07)" stroke-width="1"/>
  <text x="894" y="270" font-size="11" font-weight="700" fill="#8a8a82" letter-spacing="2">VS ${esc(String(compareYear))}</text>
  <text x="894" y="330" font-size="44" font-weight="700" fill="${esc(deltaColor)}" letter-spacing="-1">${esc(deltaStr)}</text>
  <text x="894" y="358" font-size="12" fill="#8a8a82">pace difference</text>

  <!-- Description line -->
  <text x="52" y="420" font-size="17" fill="#e8edf8" opacity="0.6">
    ${esc(record)} through ${esc(String(gp))} games · ${esc(paceStr)} pace · ${esc(l10Str)} L10 · ${esc(deltaStr)} vs ${esc(String(compareYear))}
  </text>

  <!-- Bottom bar -->
  <rect x="0" y="580" width="1200" height="50" fill="#1a1d24"/>
  <line x1="0" y1="580" x2="1200" y2="580" stroke="rgba(255,255,255,0.06)" stroke-width="1"/>
  <text x="52" y="612" font-size="12" fill="#8a8a82" letter-spacing="2">TRACKTHESEASON.COM · MLB PACE TRACKER</text>
  <text x="1148" y="612" font-size="12" fill="#8a8a82" text-anchor="end" letter-spacing="1">#TrackTheSeason</text>
</svg>`;
}

export default async function handler(req) {
  const url    = new URL(req.url);
  const slug   = url.pathname.split('/').filter(Boolean).pop()
                   .replace(/\.png$/, '').replace(/\.svg$/, '').toLowerCase();
  const season = Number(url.searchParams.get('season')) || new Date().getFullYear();
  const teamId = TEAM_SLUGS[slug];

  if (!teamId) {
    return new Response('Team not found', { status: 404 });
  }

  const teamName   = TEAM_NAMES[teamId] || 'MLB Team';
  const compareYear = season - 1;

  let stats = { w:0, l:0, gp:0, proj:null, l10w:0, l10l:0, delta:null };
  try {
    const [curGames, prevGames] = await Promise.all([
      loadSchedule(teamId, season),
      loadSchedule(teamId, compareYear),
    ]);
    const gp   = curGames.length;
    const w    = curGames.filter(g => g.win).length;
    const l    = gp - w;
    const proj = gp ? Math.round((w / gp) * SEASON_GAMES) : null;
    const l10  = curGames.slice(-10);
    const l10w = l10.filter(g => g.win).length;
    const l10l = l10.length - l10w;
    let delta  = null;
    if (gp > 0 && prevGames.length >= gp) {
      delta = w - prevGames.slice(0, gp).filter(g => g.win).length;
    }
    stats = { w, l, gp, proj, l10w, l10l, delta };
  } catch (e) {
    console.error('Card fetch error:', e.message);
  }

  const svg = buildCard(teamName, slug, stats, season);

  return new Response(svg, {
    headers: {
      'Content-Type': 'image/svg+xml',
      'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
    },
  });
}
