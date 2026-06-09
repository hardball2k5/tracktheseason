/**
 * TRACK THE SEASON — MLB Chaos Report
 * /api/chaos-report
 *
 * Live SVG social card — 1200×1500 portrait.
 * Matches the TTS dark/neon brand. Designed to stop scrolling.
 *
 * Usage:
 *   https://tracktheseason.com/api/chaos-report
 *   https://tracktheseason.com/api/chaos-report?cb=1  (cache bust)
 */

export const config = { runtime: 'edge' };

const ALL_TEAMS = [
  [108,'angels','Angels'],[109,'diamondbacks','Diamondbacks'],
  [110,'orioles','Orioles'],[111,'red-sox','Red Sox'],
  [112,'cubs','Cubs'],[113,'reds','Reds'],
  [114,'guardians','Guardians'],[115,'rockies','Rockies'],
  [116,'tigers','Tigers'],[117,'astros','Astros'],
  [118,'royals','Royals'],[119,'dodgers','Dodgers'],
  [120,'nationals','Nationals'],[121,'mets','Mets'],
  [133,'athletics','Athletics'],[134,'pirates','Pirates'],
  [135,'padres','Padres'],[136,'mariners','Mariners'],
  [137,'giants','Giants'],[138,'cardinals','Cardinals'],
  [139,'rays','Rays'],[140,'rangers','Rangers'],
  [141,'blue-jays','Blue Jays'],[142,'twins','Twins'],
  [143,'phillies','Phillies'],[144,'braves','Braves'],
  [145,'white-sox','White Sox'],[146,'marlins','Marlins'],
  [147,'yankees','Yankees'],[158,'brewers','Brewers'],
];

const SEASON_GAMES   = 162;
const CHAOS_THRESHOLD = 5;

/* ── Fetch helpers ─────────────────────────────────── */
async function loadSchedule(teamId, year) {
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
        games.push({ win: isHome ? h.score > a.score : a.score > h.score });
      }
    }
    return games;
  } catch { return []; }
}

async function fetchLogoBase64(teamId) {
  try {
    const res = await fetch(`https://www.mlbstatic.com/team-logos/${teamId}.svg`);
    if (!res.ok) return null;
    const bytes  = await res.arrayBuffer();
    const base64 = btoa(String.fromCharCode(...new Uint8Array(bytes)));
    return `data:image/svg+xml;base64,${base64}`;
  } catch { return null; }
}

function esc(s) {
  return String(s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

/* ── SVG primitives ────────────────────────────────── */
// Rounded rect
function rr(x,y,w,h,r,fill,stroke='none',sw=1,opacity=1){
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}"
    fill="${esc(fill)}" stroke="${esc(stroke)}" stroke-width="${sw}" opacity="${opacity}"/>`;
}
// Text
function txt(x,y,content,{size=14,weight=400,fill='#e8edf8',anchor='start',spacing=0,opacity=1,mono=true}={}){
  const ff = mono ? "'IBM Plex Mono','Courier New',monospace" : "'IBM Plex Sans','Arial',sans-serif";
  return `<text x="${x}" y="${y}" text-anchor="${esc(anchor)}"
    font-family="${ff}" font-size="${size}" font-weight="${weight}"
    fill="${esc(fill)}" letter-spacing="${spacing}" opacity="${opacity}">${esc(String(content))}</text>`;
}
// Logo circle
function logoCircle(id, logoData, cx, cy, r=22){
  return `
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="#ffffff"
      style="filter:drop-shadow(0 2px 6px rgba(0,0,0,0.5))"/>
    ${logoData
      ? `<image href="${logoData}" x="${cx-r*0.8}" y="${cy-r*0.8}"
          width="${r*1.6}" height="${r*1.6}" preserveAspectRatio="xMidYMid meet"/>`
      : `<text x="${cx}" y="${cy+5}" text-anchor="middle" font-size="${r*0.8}" fill="#888">⚾</text>`
    }`;
}
// Bar (progress)
function bar(x,y,w,h,pct,color,bg='rgba(255,255,255,0.06)'){
  return `
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${h/2}" fill="${bg}"/>
    <rect x="${x}" y="${y}" width="${Math.max(4,w*Math.min(1,pct))}" height="${h}" rx="${h/2}"
      fill="${color}" opacity="0.85"/>`;
}

/* ── Team row ──────────────────────────────────────── */
function teamRow(team, x, y, w, isRiser, rank, maxAbs){
  const color  = isRiser ? '#1aff6b' : '#ff4d4d';
  const sign   = isRiser ? '+' : '';
  const arrow  = isRiser ? '↑' : '↓';
  const rowBg  = rank === 0
    ? `rgba(${isRiser?'26,255,107':'255,77,77'},0.07)`
    : 'rgba(255,255,255,0.02)';
  const pct    = Math.abs(team.delta) / (maxAbs || 20);
  const rowH   = 58;
  const nameX  = x + 74;
  const barY   = y + 38;
  const barW   = w - 160;

  return `
  <g>
    ${rr(x, y, w, rowH, 0, rowBg)}
    <line x1="${x}" y1="${y+rowH}" x2="${x+w}" y2="${y+rowH}"
      stroke="rgba(255,255,255,0.04)" stroke-width="1"/>
    <!-- Logo -->
    ${logoCircle(team.id, team.logo, x+26, y+rowH/2, 20)}
    <!-- Rank -->
    ${txt(x+54, y+rowH/2+5, rank+1, {size:11,fill:'rgba(255,255,255,0.2)',weight:700,anchor:'middle'})}
    <!-- Club name -->
    ${txt(nameX, y+24, team.club, {size:15,weight:700,fill:'#e8edf8',spacing:'0.02em'})}
    <!-- Mini progress bar -->
    ${bar(nameX, barY, barW, 4, pct, color)}
    <!-- Delta -->
    ${txt(x+w-36, y+rowH/2+6, `${sign}${team.delta}W`, {size:21,weight:700,fill:color,anchor:'end',spacing:'-0.03em'})}
    <!-- Arrow -->
    ${txt(x+w-10, y+rowH/2+5, arrow, {size:13,fill:color,weight:700,anchor:'end',opacity:0.8})}
  </g>`;
}

/* ── Column panel ──────────────────────────────────── */
function panel(teams, x, y, w, isRiser, year){
  const color      = isRiser ? '#1aff6b' : '#ff4d4d';
  const borderCol  = isRiser ? 'rgba(26,255,107,0.2)' : 'rgba(255,77,77,0.2)';
  const headerBg   = isRiser ? 'rgba(26,255,107,0.1)' : 'rgba(255,77,77,0.08)';
  const icon       = isRiser ? '📈' : '📉';
  const label      = isRiser ? 'BIGGEST RISERS' : 'BIGGEST FALLERS';
  const sublabel   = isRiser ? `WINS AHEAD OF ${year}` : `WINS BEHIND ${year}`;
  const maxAbs     = Math.max(...teams.map(t=>Math.abs(t.delta)));
  const headerH    = 52;
  const rowH       = 58;
  const totalH     = headerH + teams.length * rowH;

  return `
  <g>
    ${rr(x, y, w, totalH, 10, 'rgba(0,0,0,0.35)', borderCol, 1)}
    <!-- Header -->
    ${rr(x, y, w, headerH, '10 10 0 0', headerBg)}
    <line x1="${x}" y1="${y+headerH}" x2="${x+w}" y2="${y+headerH}"
      stroke="${borderCol}" stroke-width="1"/>
    <text x="${x+14}" y="${y+22}" font-size="16" font-family="serif">${icon}</text>
    ${txt(x+36, y+22, label, {size:13,weight:700,fill:color,spacing:'0.06em'})}
    ${txt(x+36, y+38, sublabel, {size:9,fill:'rgba(255,255,255,0.3)',weight:700,spacing:'0.1em'})}
    <!-- Rows -->
    ${teams.map((t,i)=>teamRow(t, x, y+headerH+i*rowH, w, isRiser, i, maxAbs)).join('')}
  </g>`;
}

/* ── Conversation starters ─────────────────────────── */
function getQuestion(risers, fallers, chaosCount){
  const r = risers[0], f = fallers[0];
  const opts = [
    r ? `Are the ${r.club} actually a contender this year?` : null,
    r?.delta >= 15 ? `What's behind the ${r.club}'s historic pace jump?` : null,
    f ? `Can the ${f.club} turn this season around?` : null,
    f?.delta <= -14 ? `Is this the ${f.club}'s worst start in years?` : null,
    chaosCount >= 18 ? `${chaosCount} of 30 teams off last year's pace — who do you trust?` : null,
    `Which team has surprised you the most this season?`,
    `Which contender worries you most right now?`,
    `Who's the biggest surprise in baseball — in either direction?`,
  ].filter(Boolean);
  // Pick deterministically by day so it's consistent within a day
  const idx = new Date().getDate() % opts.length;
  return opts[idx];
}

/* ── Main SVG ──────────────────────────────────────── */
function buildSVG(data) {
  const {
    risers, fallers, chaosCount, pct, year, avgGp,
  } = data;

  const W = 1200, H = 1500;
  const today = new Date().toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'});
  const question = getQuestion(risers, fallers, chaosCount);

  // Layout constants
  const PAD   = 52;
  const COL_W = (W - PAD*2 - 16) / 2;
  const COL_Y = 720;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"
     width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<defs>
  <style>text{font-family:'IBM Plex Mono','Courier New',monospace}</style>

  <!-- Ambient glows -->
  <radialGradient id="topglow" cx="50%" cy="0%" r="55%">
    <stop offset="0%" stop-color="#1aff6b" stop-opacity="0.08"/>
    <stop offset="100%" stop-color="#0f1014" stop-opacity="0"/>
  </radialGradient>
  <radialGradient id="lglow" cx="0%" cy="60%" r="50%">
    <stop offset="0%" stop-color="#1aff6b" stop-opacity="0.05"/>
    <stop offset="100%" stop-color="#0f1014" stop-opacity="0"/>
  </radialGradient>
  <radialGradient id="rglow" cx="100%" cy="60%" r="50%">
    <stop offset="0%" stop-color="#ff4d4d" stop-opacity="0.05"/>
    <stop offset="100%" stop-color="#0f1014" stop-opacity="0"/>
  </radialGradient>
  <radialGradient id="heroglow" cx="50%" cy="50%" r="50%">
    <stop offset="0%" stop-color="#1aff6b" stop-opacity="0.07"/>
    <stop offset="100%" stop-color="#0f1014" stop-opacity="0"/>
  </radialGradient>

  <!-- Gradient lines -->
  <linearGradient id="hline" x1="0%" y1="0%" x2="100%" y2="0%">
    <stop offset="0%"   stop-color="#1aff6b" stop-opacity="0"/>
    <stop offset="30%"  stop-color="#1aff6b" stop-opacity="0.6"/>
    <stop offset="70%"  stop-color="#1aff6b" stop-opacity="0.6"/>
    <stop offset="100%" stop-color="#1aff6b" stop-opacity="0"/>
  </linearGradient>
  <linearGradient id="topbar" x1="0%" y1="0%" x2="100%" y2="0%">
    <stop offset="0%"   stop-color="#1aff6b" stop-opacity="0"/>
    <stop offset="15%"  stop-color="#1aff6b" stop-opacity="1"/>
    <stop offset="85%"  stop-color="#1aff6b" stop-opacity="1"/>
    <stop offset="100%" stop-color="#1aff6b" stop-opacity="0"/>
  </linearGradient>

  <!-- Dot grid -->
  <pattern id="grid" x="0" y="0" width="48" height="48" patternUnits="userSpaceOnUse">
    <circle cx="24" cy="24" r="1" fill="rgba(255,255,255,0.025)"/>
  </pattern>

  <!-- Chaos number glow -->
  <filter id="numglow" x="-20%" y="-20%" width="140%" height="140%">
    <feGaussianBlur stdDeviation="8" result="blur"/>
    <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
  </filter>
</defs>

<!-- ── BACKGROUND ── -->
<rect width="${W}" height="${H}" fill="#0f1014"/>
<rect width="${W}" height="${H}" fill="url(#grid)"/>
<rect width="${W}" height="${H}" fill="url(#topglow)"/>
<rect width="${W}" height="${H}" fill="url(#lglow)"/>
<rect width="${W}" height="${H}" fill="url(#rglow)"/>

<!-- Side accent lines -->
<rect x="0"      y="0" width="3" height="${H}" fill="rgba(26,255,107,0.2)"/>
<rect x="${W-3}" y="0" width="3" height="${H}" fill="rgba(26,255,107,0.2)"/>

<!-- Top accent bar -->
<rect width="${W}" height="5" fill="url(#topbar)"/>

<!-- ── HEADER ── -->
<!-- TTS monogram -->
<rect x="${PAD}" y="38" width="46" height="46" rx="9" fill="#1aff6b"/>
<text x="${PAD+23}" y="67" text-anchor="middle" font-size="13" font-weight="700"
  fill="#0f1014" font-family="'IBM Plex Mono',monospace">TTS</text>
<!-- Wordmark -->
<text x="${PAD+58}" y="57" font-size="15" font-weight="700" fill="#e8edf8"
  letter-spacing="2" font-family="'IBM Plex Mono',monospace">TRACK THE
  <tspan fill="#1aff6b">SEASON</tspan></text>
<text x="${PAD+58}" y="77" font-size="10" fill="rgba(255,255,255,0.25)"
  letter-spacing="3" font-family="'IBM Plex Mono',monospace">tracktheseason.com</text>

<!-- Live badge -->
<rect x="${W-PAD-200}" y="38" width="200" height="46" rx="23"
  fill="rgba(26,255,107,0.08)" stroke="rgba(26,255,107,0.2)" stroke-width="1"/>
<circle cx="${W-PAD-186}" cy="61" r="5" fill="#1aff6b"
  style="filter:drop-shadow(0 0 5px #1aff6b)"/>
<text x="${W-PAD-176}" y="66" font-size="11" font-weight="700" fill="#1aff6b"
  letter-spacing="2" font-family="'IBM Plex Mono',monospace">LIVE · ${esc(today)}</text>

<!-- Header divider -->
<rect x="${PAD}" y="102" width="${W-PAD*2}" height="1" fill="rgba(255,255,255,0.07)"/>

<!-- ── HERO TITLE ── -->
<!-- Eyebrow -->
<text x="${W/2}" y="142" text-anchor="middle" font-size="12" font-weight="700"
  fill="rgba(26,255,107,0.6)" letter-spacing="5"
  font-family="'IBM Plex Mono',monospace">⚾ VS ${esc(String(year-1))} · THROUGH GAME ${esc(String(avgGp))}</text>

<!-- Main headline -->
<text x="${W/2}" y="222" text-anchor="middle" font-size="78" font-weight="700"
  fill="#e8edf8" letter-spacing="-3" font-family="'IBM Plex Mono',monospace">MLB</text>
<text x="${W/2}" y="310" text-anchor="middle" font-size="98" font-weight="700"
  fill="#1aff6b" letter-spacing="-4" font-family="'IBM Plex Mono',monospace"
  style="filter:drop-shadow(0 0 40px rgba(26,255,107,0.4))">CHAOS</text>
<text x="${W/2}" y="388" text-anchor="middle" font-size="78" font-weight="700"
  fill="#e8edf8" letter-spacing="-3" font-family="'IBM Plex Mono',monospace">REPORT</text>

<!-- Subhead -->
<text x="${W/2}" y="428" text-anchor="middle" font-size="16"
  fill="rgba(255,255,255,0.35)" letter-spacing="4"
  font-family="'IBM Plex Mono',monospace">THE ${esc(String(year-1))} SEASON IS BARELY RECOGNIZABLE</text>

<!-- ── CHAOS INDEX CARD ── -->
<rect x="${PAD}" y="460" width="${W-PAD*2}" height="200" rx="14"
  fill="rgba(26,255,107,0.05)" stroke="rgba(26,255,107,0.15)" stroke-width="1"/>
<rect x="${PAD}" y="460" width="${W-PAD*2}" height="200" rx="14"
  fill="url(#heroglow)"/>
<!-- Left accent -->
<rect x="${PAD}" y="460" width="4" height="200" rx="2" fill="#1aff6b"
  style="filter:drop-shadow(0 0 8px rgba(26,255,107,0.6))"/>

<!-- The big number -->
<text x="${PAD+120}" y="580" text-anchor="middle" font-size="100" font-weight="700"
  fill="#1aff6b" letter-spacing="-5" font-family="'IBM Plex Mono',monospace"
  filter="url(#numglow)">${esc(String(chaosCount))}</text>
<text x="${PAD+120}" y="614" text-anchor="middle" font-size="12"
  fill="rgba(255,255,255,0.3)" letter-spacing="3"
  font-family="'IBM Plex Mono',monospace">OF 30 TEAMS</text>

<!-- Vertical divider -->
<line x1="${PAD+200}" y1="480" x2="${PAD+200}" y2="640"
  stroke="rgba(26,255,107,0.15)" stroke-width="1"/>

<!-- Stat text -->
<text x="${PAD+230}" y="512" font-size="24" font-weight="700"
  fill="#e8edf8" letter-spacing="-0.5" font-family="'IBM Plex Mono',monospace">are tracking</text>
<text x="${PAD+230}" y="556" font-size="34" font-weight="700"
  fill="#1aff6b" letter-spacing="-1" font-family="'IBM Plex Mono',monospace"
  style="filter:drop-shadow(0 0 20px rgba(26,255,107,0.4))">±5+ WINS DIFFERENT</text>
<text x="${PAD+230}" y="596" font-size="24" font-weight="700"
  fill="#e8edf8" letter-spacing="-0.5" font-family="'IBM Plex Mono',monospace">from last season's pace.</text>

<!-- Supporting line -->
<text x="${PAD+230}" y="636" font-size="15"
  fill="rgba(255,255,255,0.4)" font-family="'IBM Plex Sans','Arial',sans-serif">
  <tspan fill="#1aff6b" font-weight="700">${esc(String(pct))}% of MLB</tspan>
  is off its prior-year pace.
</text>

<!-- Progress ring -->
<circle cx="${W-PAD-70}" cy="560" r="54" fill="none"
  stroke="rgba(26,255,107,0.1)" stroke-width="10"/>
<circle cx="${W-PAD-70}" cy="560" r="54" fill="none"
  stroke="#1aff6b" stroke-width="10"
  stroke-dasharray="${Math.round(339*pct/100)} 339"
  stroke-linecap="round"
  transform="rotate(-90 ${W-PAD-70} 560)"
  style="filter:drop-shadow(0 0 8px rgba(26,255,107,0.5))"/>
<text x="${W-PAD-70}" y="551" text-anchor="middle" font-size="22" font-weight="700"
  fill="#1aff6b" font-family="'IBM Plex Mono',monospace">${esc(String(pct))}%</text>
<text x="${W-PAD-70}" y="574" text-anchor="middle" font-size="10"
  fill="rgba(255,255,255,0.3)" letter-spacing="1"
  font-family="'IBM Plex Mono',monospace">OF MLB</text>

<!-- ── COLUMNS ── -->
${panel(risers,  PAD,         COL_Y, COL_W, true,  year-1)}
${panel(fallers, PAD+COL_W+16, COL_Y, COL_W, false, year-1)}

<!-- ── CONVERSATION STARTER ── -->
<rect x="${PAD}" y="1270" width="${W-PAD*2}" height="120" rx="12"
  fill="rgba(255,255,255,0.03)" stroke="rgba(255,255,255,0.07)" stroke-width="1"/>
<text x="${PAD+20}" y="1332" font-size="52" fill="rgba(26,255,107,0.2)"
  font-family="Georgia,serif">"</text>
<text x="${W/2}" y="1322" text-anchor="middle" font-size="20" font-weight="600"
  fill="#e8edf8" font-family="'IBM Plex Sans','Arial',sans-serif">
  ${esc(question.length > 65 ? question.slice(0,65)+'…' : question)}
</text>
<text x="${W/2}" y="1358" text-anchor="middle" font-size="12"
  fill="rgba(255,255,255,0.3)" letter-spacing="3"
  font-family="'IBM Plex Mono',monospace">💬 DROP YOUR TAKE BELOW</text>

<!-- ── CTA BAR ── -->
<rect x="${PAD}" y="1416" width="${W-PAD*2}" height="36" rx="6"
  fill="rgba(26,255,107,0.08)" stroke="rgba(26,255,107,0.15)" stroke-width="1"/>
<text x="${W/2}" y="1440" text-anchor="middle" font-size="13" font-weight="700"
  fill="rgba(26,255,107,0.7)" letter-spacing="3"
  font-family="'IBM Plex Mono',monospace">TRACK EVERY TEAM → TRACKTHESEASON.COM</text>

<!-- ── FOOTER ── -->
<rect x="0" y="1468" width="${W}" height="32" fill="#1a1d24"/>
<line x1="0" y1="1468" x2="${W}" y2="1468" stroke="rgba(255,255,255,0.05)" stroke-width="1"/>
<text x="${W/2}" y="1489" text-anchor="middle" font-size="10"
  fill="rgba(255,255,255,0.18)" letter-spacing="2"
  font-family="'IBM Plex Mono',monospace">
  #TrackTheSeason · #MLB · Pace-based comparisons only. Not predictive models.
</text>
</svg>`;
}

/* ── Main handler ──────────────────────────────────── */
export default async function handler(req) {
  const url  = new URL(req.url);
  const year = Number(url.searchParams.get('season')) || new Date().getFullYear();
  const prev = year - 1;

  /* Load all 30 teams in batches */
  const BATCH = 6;
  const teamStats = [];
  for (let i = 0; i < ALL_TEAMS.length; i += BATCH) {
    const batch = ALL_TEAMS.slice(i, i + BATCH);
    const results = await Promise.allSettled(
      batch.map(async ([id, slug, club]) => {
        const [cur, pre] = await Promise.all([
          loadSchedule(id, year),
          loadSchedule(id, prev),
        ]);
        const gp  = cur.length;
        const w   = cur.filter(g=>g.win).length;
        const l   = gp - w;
        const proj= gp ? Math.round((w/gp)*SEASON_GAMES) : null;
        let delta = null;
        if(gp>0 && pre.length>=gp)
          delta = w - pre.slice(0,gp).filter(g=>g.win).length;
        return { id, slug, club, gp, w, l, proj, delta };
      })
    );
    for(const r of results) if(r.status==='fulfilled') teamStats.push(r.value);
  }

  /* Chaos stats */
  const withDelta  = teamStats.filter(t => t.delta !== null && t.gp >= 15);
  const chaosCount = withDelta.filter(t => Math.abs(t.delta) >= CHAOS_THRESHOLD).length;
  const pct        = Math.round(chaosCount / 30 * 100);
  const avgGp      = Math.round(teamStats.reduce((s,t)=>s+t.gp,0)/(teamStats.length||1));
  const risers     = [...withDelta].sort((a,b)=>b.delta-a.delta).slice(0,5);
  const fallers    = [...withDelta].sort((a,b)=>a.delta-b.delta).slice(0,5);

  /* Fetch logos for visible teams */
  const logoIds = [...new Set([...risers,...fallers].map(t=>t.id))];
  const logoMap = {};
  await Promise.allSettled(
    logoIds.map(async id => { logoMap[id] = await fetchLogoBase64(id); })
  );
  const attachLogo = t => ({ ...t, logo: logoMap[t.id] || null });

  const svg = buildSVG({
    risers:  risers.map(attachLogo),
    fallers: fallers.map(attachLogo),
    chaosCount, pct, year, avgGp,
  });

  return new Response(svg, {
    headers: {
      'Content-Type':  'image/svg+xml',
      'Cache-Control': 'public, max-age=1800, stale-while-revalidate=3600',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
