/**
 * TRACK THE SEASON — Social Graphics API
 * /api/chaos-report?variant=chaos|hot-cold|pace-leaders
 *
 * Three genuinely different shareable graphics, each with its own
 * layout, data story, and visual design.
 *
 *  chaos       — MLB Chaos Report (risers vs fallers vs prior year)
 *  hot-cold    — Hot vs Cold Report (last 10 + last 20, trend label)
 *  pace-leaders — Pace Leaderboard (projected wins, contenders vs pretenders)
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

const SEASON_GAMES    = 162;
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

/* ── Trend label ────────────────────────────────────
   Combines last-10 and last-20 to name the trajectory */
function trendLabel(l10w, l20w) {
  const p10 = l10w / 10;
  const p20 = l20w / 20;
  if (p10 >= .800 && p20 >= .650) return { label: 'SUSTAINED SURGE',  color: '#1aff6b', emoji: '🔥🔥' };
  if (p10 >= .700 && p20 >= .550) return { label: 'HEATING UP',        color: '#1aff6b', emoji: '🔥'  };
  if (p10 >= .700 && p20 <  .500) return { label: 'HOT STREAK ONLY',   color: '#f9d96e', emoji: '⚡'  };
  if (p10 >= .600 && p20 >= .550) return { label: 'MOMENTUM BUILDING', color: '#1aff6b', emoji: '📈'  };
  if (p10 <= .200 && p20 <= .350) return { label: 'SLUMPING',          color: '#ff4d4d', emoji: '❄️❄️' };
  if (p10 <= .300 && p20 <= .450) return { label: 'COOLING OFF',       color: '#ff4d4d', emoji: '❄️'  };
  if (p10 <= .300 && p20 >  .500) return { label: 'ROUGH PATCH',       color: '#f9d96e', emoji: '📉'  };
  if (p10 <= .400 && p20 <= .500) return { label: 'FADING',            color: '#ff4d4d', emoji: '↘'   };
  if (Math.abs(p10 - p20) < .05)  return { label: 'STEADY',            color: '#8a8a82', emoji: '→'   };
  if (p10 > p20 + .1)             return { label: 'TURNING IT AROUND', color: '#f9d96e', emoji: '↗'   };
  if (p10 < p20 - .1)             return { label: 'SLIPPING',          color: '#f9d96e', emoji: '↘'   };
  return                                  { label: 'STABLE',            color: '#8a8a82', emoji: '→'   };
}

/* ── Shared SVG building blocks ─────────────────────── */
const W = 1200, H = 1500, PAD = 52;
const MONO = `'IBM Plex Mono','Courier New',monospace`;
const SANS = `'IBM Plex Sans','Arial',sans-serif`;

function sharedDefs() {
  return `
  <defs>
    <style>text{font-family:${MONO}}</style>
    <radialGradient id="topglow" cx="50%" cy="0%" r="55%">
      <stop offset="0%" stop-color="#1aff6b" stop-opacity="0.09"/>
      <stop offset="100%" stop-color="#0f1014" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="heroglow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#1aff6b" stop-opacity="0.07"/>
      <stop offset="100%" stop-color="#0f1014" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="topbar" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%"   stop-color="#1aff6b" stop-opacity="0"/>
      <stop offset="15%"  stop-color="#1aff6b" stop-opacity="1"/>
      <stop offset="85%"  stop-color="#1aff6b" stop-opacity="1"/>
      <stop offset="100%" stop-color="#1aff6b" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="hline" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%"   stop-color="#1aff6b" stop-opacity="0"/>
      <stop offset="30%"  stop-color="#1aff6b" stop-opacity="0.5"/>
      <stop offset="70%"  stop-color="#1aff6b" stop-opacity="0.5"/>
      <stop offset="100%" stop-color="#1aff6b" stop-opacity="0"/>
    </linearGradient>
    <pattern id="grid" x="0" y="0" width="48" height="48" patternUnits="userSpaceOnUse">
      <circle cx="24" cy="24" r="1" fill="rgba(255,255,255,0.025)"/>
    </pattern>
    <filter id="numglow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="8" result="blur"/>
      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>`;
}

function sharedBackground(h=H) {
  return `
  <rect width="${W}" height="${h}" fill="#0f1014"/>
  <rect width="${W}" height="${h}" fill="url(#grid)"/>
  <rect width="${W}" height="${h}" fill="url(#topglow)"/>
  <rect x="0"      y="0" width="3" height="${h}" fill="rgba(26,255,107,0.2)"/>
  <rect x="${W-3}" y="0" width="3" height="${h}" fill="rgba(26,255,107,0.2)"/>
  <rect width="${W}" height="5" fill="url(#topbar)"/>`;
}

function sharedHeader(today) {
  return `
  <rect x="${PAD}" y="38" width="46" height="46" rx="9" fill="#1aff6b"/>
  <text x="${PAD+23}" y="67" text-anchor="middle" font-size="13" font-weight="700"
    fill="#0f1014">TTS</text>
  <text x="${PAD+58}" y="57" font-size="15" font-weight="700" fill="#e8edf8"
    letter-spacing="2">TRACK THE <tspan fill="#1aff6b">SEASON</tspan></text>
  <text x="${PAD+58}" y="77" font-size="10" fill="rgba(255,255,255,0.25)"
    letter-spacing="3">tracktheseason.com</text>
  <rect x="${W-PAD-210}" y="38" width="210" height="46" rx="23"
    fill="rgba(26,255,107,0.08)" stroke="rgba(26,255,107,0.2)" stroke-width="1"/>
  <circle cx="${W-PAD-196}" cy="61" r="5" fill="#1aff6b"/>
  <text x="${W-PAD-184}" y="66" font-size="11" font-weight="700" fill="#1aff6b"
    letter-spacing="2">LIVE · ${esc(today)}</text>
  <rect x="${PAD}" y="102" width="${W-PAD*2}" height="1"
    fill="rgba(255,255,255,0.07)"/>`;
}

function sharedFooter(hashtags, footerY=1416) {
  return `
  <rect x="${PAD}" y="${footerY}" width="${W-PAD*2}" height="36" rx="6"
    fill="rgba(26,255,107,0.08)" stroke="rgba(26,255,107,0.15)" stroke-width="1"/>
  <text x="${W/2}" y="${footerY+24}" text-anchor="middle" font-size="13" font-weight="700"
    fill="rgba(26,255,107,0.7)" letter-spacing="3">
    TRACK EVERY TEAM → TRACKTHESEASON.COM
  </text>
  <rect x="0" y="${footerY+52}" width="${W}" height="32" fill="#1a1d24"/>
  <line x1="0" y1="${footerY+52}" x2="${W}" y2="${footerY+52}"
    stroke="rgba(255,255,255,0.05)" stroke-width="1"/>
  <text x="${W/2}" y="${footerY+71}" text-anchor="middle" font-size="10"
    fill="rgba(255,255,255,0.18)" letter-spacing="2">
    ${esc(hashtags)} · Pace-based. Not a predictive model.
  </text>`;
}

function convoBox(question, y=1270) {
  return `
  <rect x="${PAD}" y="${y}" width="${W-PAD*2}" height="120" rx="12"
    fill="rgba(255,255,255,0.03)" stroke="rgba(255,255,255,0.07)" stroke-width="1"/>
  <text x="${PAD+20}" y="${y+62}" font-size="52" fill="rgba(26,255,107,0.2)"
    font-family="Georgia,serif">"</text>
  <text x="${W/2}" y="${y+52}" text-anchor="middle" font-size="20" font-weight="600"
    fill="#e8edf8" font-family="${SANS}">
    ${esc(question.length>65 ? question.slice(0,65)+'…' : question)}
  </text>
  <text x="${W/2}" y="${y+88}" text-anchor="middle" font-size="12"
    fill="rgba(255,255,255,0.3)" letter-spacing="3">
    💬 DROP YOUR TAKE BELOW
  </text>`;
}

function logoCircle(logoData, cx, cy, r=22) {
  return `
  <circle cx="${cx}" cy="${cy}" r="${r}" fill="#ffffff"
    style="filter:drop-shadow(0 2px 8px rgba(0,0,0,0.6))"/>
  ${logoData
    ? `<image href="${logoData}" x="${cx-r*.8}" y="${cy-r*.8}"
        width="${r*1.6}" height="${r*1.6}" preserveAspectRatio="xMidYMid meet"/>`
    : `<text x="${cx}" y="${cy+5}" text-anchor="middle"
        font-size="${r*.8}" fill="#888">⚾</text>`}`;
}

/* ════════════════════════════════════════════════════
   VARIANT 1 — CHAOS REPORT
   Risers vs Fallers. Season-long delta vs prior year.
════════════════════════════════════════════════════ */
function chaosRow(team, x, y, w, isRiser, rank, maxAbs) {
  const color = isRiser ? '#1aff6b' : '#ff4d4d';
  const sign  = isRiser ? '+' : '';
  const arrow = isRiser ? '↑' : '↓';
  const rowH  = 58;
  const pct   = Math.abs(team.delta) / (maxAbs || 20);
  const barW  = w - 168;
  const bg    = rank===0
    ? `rgba(${isRiser?'26,255,107':'255,77,77'},0.07)`
    : 'rgba(255,255,255,0.02)';
  return `
  <g>
    <rect x="${x}" y="${y}" width="${w}" height="${rowH}" fill="${esc(bg)}"/>
    <line x1="${x}" y1="${y+rowH}" x2="${x+w}" y2="${y+rowH}"
      stroke="rgba(255,255,255,0.04)" stroke-width="1"/>
    ${logoCircle(team.logo, x+26, y+rowH/2, 20)}
    <text x="${x+54}" y="${y+rowH/2+5}" text-anchor="middle" font-size="11"
      font-weight="700" fill="rgba(255,255,255,0.2)">${rank+1}</text>
    <text x="${x+74}" y="${y+24}" font-size="15" font-weight="700"
      fill="#e8edf8" letter-spacing="0.02em">${esc(team.club)}</text>
    <rect x="${x+74}" y="${y+38}" width="${barW}" height="4" rx="2"
      fill="rgba(255,255,255,0.06)"/>
    <rect x="${x+74}" y="${y+38}" width="${Math.max(4,barW*Math.min(1,pct))}"
      height="4" rx="2" fill="${esc(color)}" opacity="0.85"/>
    <text x="${x+w-36}" y="${y+rowH/2+6}" text-anchor="end" font-size="21"
      font-weight="700" fill="${esc(color)}" letter-spacing="-0.03em">
      ${sign}${team.delta}W
    </text>
    <text x="${x+w-10}" y="${y+rowH/2+5}" text-anchor="end" font-size="13"
      fill="${esc(color)}" opacity="0.8">${arrow}</text>
  </g>`;
}

function chaosPanel(teams, x, y, w, isRiser, year) {
  const color     = isRiser ? '#1aff6b' : '#ff4d4d';
  const border    = isRiser ? 'rgba(26,255,107,0.2)' : 'rgba(255,77,77,0.2)';
  const headerBg  = isRiser ? 'rgba(26,255,107,0.1)' : 'rgba(255,77,77,0.08)';
  const icon      = isRiser ? '📈' : '📉';
  const label     = isRiser ? 'BIGGEST RISERS' : 'BIGGEST FALLERS';
  const sub       = isRiser ? `WINS AHEAD OF ${year}` : `WINS BEHIND ${year}`;
  const maxAbs    = Math.max(...teams.map(t=>Math.abs(t.delta)));
  const headerH   = 52, rowH = 58;
  const totalH    = headerH + teams.length * rowH;
  return `
  <rect x="${x}" y="${y}" width="${w}" height="${totalH}" rx="10"
    fill="rgba(0,0,0,0.35)" stroke="${border}" stroke-width="1"/>
  <rect x="${x}" y="${y}" width="${w}" height="${headerH}" rx="8"
    fill="${headerBg}"/>
  <rect x="${x}" y="${y+headerH-1}" width="${w}" height="1"
    fill="${border}"/>
  <text x="${x+14}" y="${y+22}" font-size="16">${icon}</text>
  <text x="${x+36}" y="${y+22}" font-size="13" font-weight="700"
    fill="${esc(color)}" letter-spacing="0.06em">${label}</text>
  <text x="${x+36}" y="${y+38}" font-size="9" font-weight="700"
    fill="rgba(255,255,255,0.3)" letter-spacing="0.1em">${sub}</text>
  ${teams.map((t,i)=>chaosRow(t, x, y+headerH+i*rowH, w, isRiser, i, maxAbs)).join('')}`;
}

function buildChaosSVG(data) {
  const { risers, fallers, chaosCount, pct, year, avgGp } = data;
  const today    = new Date().toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'});
  const COL_W    = (W - PAD*2 - 16) / 2;
  const COL_Y    = 720;
  const question = chaosQuestion(risers, fallers, chaosCount);
  const footerY  = 1416;
  const dynamicH = footerY + 80;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"
     width="${W}" height="${dynamicH}" viewBox="0 0 ${W} ${dynamicH}">
${sharedDefs()}
${sharedBackground(dynamicH)}
${sharedHeader(today)}

<!-- TITLE -->
<text x="${W/2}" y="142" text-anchor="middle" font-size="12" font-weight="700"
  fill="rgba(26,255,107,0.6)" letter-spacing="5">
  ⚾ VS ${esc(String(year-1))} · THROUGH GAME ${esc(String(avgGp))}
</text>
<text x="${W/2}" y="222" text-anchor="middle" font-size="78" font-weight="700"
  fill="#e8edf8" letter-spacing="-3">MLB</text>
<text x="${W/2}" y="310" text-anchor="middle" font-size="98" font-weight="700"
  fill="#1aff6b" letter-spacing="-4" filter="url(#numglow)">CHAOS</text>
<text x="${W/2}" y="388" text-anchor="middle" font-size="78" font-weight="700"
  fill="#e8edf8" letter-spacing="-3">REPORT</text>
<text x="${W/2}" y="428" text-anchor="middle" font-size="16"
  fill="rgba(255,255,255,0.35)" letter-spacing="4">
  THE ${esc(String(year))} SEASON IS BARELY RECOGNIZABLE
</text>

<!-- CHAOS INDEX CARD -->
<rect x="${PAD}" y="460" width="${W-PAD*2}" height="200" rx="14"
  fill="rgba(26,255,107,0.05)" stroke="rgba(26,255,107,0.15)" stroke-width="1"/>
<rect x="${PAD}" y="460" width="${W-PAD*2}" height="200" rx="14"
  fill="url(#heroglow)"/>
<rect x="${PAD}" y="460" width="4" height="200" rx="2" fill="#1aff6b"/>
<text x="${PAD+120}" y="580" text-anchor="middle" font-size="100" font-weight="700"
  fill="#1aff6b" letter-spacing="-5" filter="url(#numglow)">${esc(String(chaosCount))}</text>
<text x="${PAD+120}" y="614" text-anchor="middle" font-size="12"
  fill="rgba(255,255,255,0.3)" letter-spacing="3">OF 30 TEAMS</text>
<line x1="${PAD+200}" y1="480" x2="${PAD+200}" y2="640"
  stroke="rgba(26,255,107,0.15)" stroke-width="1"/>
<text x="${PAD+230}" y="512" font-size="24" font-weight="700"
  fill="#e8edf8">are tracking</text>
<text x="${PAD+230}" y="556" font-size="34" font-weight="700"
  fill="#1aff6b">±5+ WINS DIFFERENT</text>
<text x="${PAD+230}" y="596" font-size="24" font-weight="700"
  fill="#e8edf8">from last season's pace.</text>
<text x="${PAD+230}" y="634" font-size="15" fill="rgba(255,255,255,0.4)"
  font-family="${SANS}">
  <tspan fill="#1aff6b" font-weight="700">${esc(String(pct))}% of MLB</tspan>
  is off its prior-year pace.
</text>
<circle cx="${W-PAD-70}" cy="560" r="54" fill="none"
  stroke="rgba(26,255,107,0.1)" stroke-width="10"/>
<circle cx="${W-PAD-70}" cy="560" r="54" fill="none"
  stroke="#1aff6b" stroke-width="10"
  stroke-dasharray="${Math.round(339*pct/100)} 339"
  stroke-linecap="round" transform="rotate(-90 ${W-PAD-70} 560)"/>
<text x="${W-PAD-70}" y="551" text-anchor="middle" font-size="22"
  font-weight="700" fill="#1aff6b">${esc(String(pct))}%</text>
<text x="${W-PAD-70}" y="574" text-anchor="middle" font-size="10"
  fill="rgba(255,255,255,0.3)" letter-spacing="1">OF MLB</text>

${chaosPanel(risers,  PAD,          COL_Y, COL_W, true,  year-1)}
${chaosPanel(fallers, PAD+COL_W+16, COL_Y, COL_W, false, year-1)}
${convoBox(question)}
${sharedFooter('#TrackTheSeason · #MLB · #BaseballTwitter')}
</svg>`;
}

function chaosQuestion(risers, fallers, chaosCount) {
  const r = risers[0], f = fallers[0];
  const opts = [
    r ? `Are the ${r.club} actually a contender this year?` : null,
    f ? `Can the ${f.club} turn this season around?` : null,
    chaosCount >= 18 ? `${chaosCount} teams off last year's pace — who do you trust?` : null,
    `Which team has surprised you most this season?`,
    `Which contender worries you most right now?`,
  ].filter(Boolean);
  return opts[new Date().getDate() % opts.length];
}

/* ════════════════════════════════════════════════════
   VARIANT 2 — HOT VS COLD
   Last 10 + Last 20. Trend label. The real story.
════════════════════════════════════════════════════ */
function hotColdRow(team, x, y, w, rank) {
  const trend  = trendLabel(team.l10w, team.l20w);
  const rowH   = 72;
  const isHot  = team.l10w >= 6;
  const bg     = rank===0
    ? `rgba(${isHot?'26,255,107':'255,77,77'},0.07)`
    : 'rgba(255,255,255,0.02)';

  const l10color = team.l10w>=7?'#1aff6b':team.l10w<=3?'#ff4d4d':'#e8edf8';
  const l20color = team.l20w>=13?'#1aff6b':team.l20w<=7?'#ff4d4d':'#e8edf8';

  return `
  <g>
    <rect x="${x}" y="${y}" width="${w}" height="${rowH}" fill="${esc(bg)}"/>
    <line x1="${x}" y1="${y+rowH}" x2="${x+w}" y2="${y+rowH}"
      stroke="rgba(255,255,255,0.04)" stroke-width="1"/>
    <!-- Rank + logo -->
    <text x="${x+14}" y="${y+rowH/2+5}" text-anchor="middle" font-size="11"
      font-weight="700" fill="rgba(255,255,255,0.2)">${rank+1}</text>
    ${logoCircle(team.logo, x+42, y+rowH/2, 22)}
    <!-- Club name -->
    <text x="${x+76}" y="${y+26}" font-size="17" font-weight="700"
      fill="#e8edf8" letter-spacing="0.02em">${esc(team.club)}</text>
    <!-- Trend label -->
    <rect x="${x+76}" y="${y+38}" width="${trend.label.length*7.5+14}" height="20"
      rx="4" fill="rgba(${trend.color==='#1aff6b'?'26,255,107':trend.color==='#ff4d4d'?'255,77,77':'138,138,130'},0.12)"/>
    <text x="${x+83}" y="${y+52}" font-size="10" font-weight="700"
      fill="${esc(trend.color)}" letter-spacing="0.08em">${trend.emoji} ${esc(trend.label)}</text>
    <!-- Last 10 box -->
    <rect x="${x+w-280}" y="${y+12}" width="116" height="48" rx="8"
      fill="rgba(0,0,0,0.3)" stroke="rgba(255,255,255,0.06)" stroke-width="1"/>
    <text x="${x+w-222}" y="${y+28}" text-anchor="middle" font-size="9"
      fill="rgba(255,255,255,0.3)" letter-spacing="2">LAST 10</text>
    <text x="${x+w-222}" y="${y+52}" text-anchor="middle" font-size="22"
      font-weight="700" fill="${esc(l10color)}">${team.l10w}–${team.l10l}</text>
    <!-- Last 20 box -->
    <rect x="${x+w-152}" y="${y+12}" width="116" height="48" rx="8"
      fill="rgba(0,0,0,0.3)" stroke="rgba(255,255,255,0.06)" stroke-width="1"/>
    <text x="${x+w-94}" y="${y+28}" text-anchor="middle" font-size="9"
      fill="rgba(255,255,255,0.3)" letter-spacing="2">LAST 20</text>
    <text x="${x+w-94}" y="${y+52}" text-anchor="middle" font-size="22"
      font-weight="700" fill="${esc(l20color)}">${team.l20w}–${team.l20l}</text>
  </g>`;
}

function buildHotColdSVG(data) {
  const { hotTeams, coldTeams, avgGp, year } = data;
  const today    = new Date().toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'});
  const hot1     = hotTeams[0];
  const cold1    = coldTeams[0];
  const rowH     = 72;
  const hotPanelH  = 52 + hotTeams.length  * rowH;
  const coldPanelH = 52 + coldTeams.length * rowH;
  const hotPanelY  = 490;
  const coldPanelY = hotPanelY + hotPanelH + 20;
  const convoY     = coldPanelY + coldPanelH + 24;
  const convoH     = 120;
  const footerY    = convoY + convoH + 24;
  const dynamicH   = footerY + 80; /* total SVG height based on content */

  const question = hot1 && cold1
    ? `${hot1.club} ${hot1.l10w}–${hot1.l10l} L10 vs ${cold1.club} ${cold1.l10w}–${cold1.l10l} — what's the difference?`
    : `Which team's recent stretch surprised you most?`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"
     width="${W}" height="${dynamicH}" viewBox="0 0 ${W} ${dynamicH}">
<defs>
  <style>text{font-family:${MONO}}</style>
  <radialGradient id="topglow" cx="50%" cy="0%" r="55%">
    <stop offset="0%" stop-color="#1aff6b" stop-opacity="0.09"/>
    <stop offset="100%" stop-color="#0f1014" stop-opacity="0"/>
  </radialGradient>
  <radialGradient id="heroglow" cx="50%" cy="50%" r="50%">
    <stop offset="0%" stop-color="#1aff6b" stop-opacity="0.07"/>
    <stop offset="100%" stop-color="#0f1014" stop-opacity="0"/>
  </radialGradient>
  <radialGradient id="coldglow" cx="50%" cy="80%" r="50%">
    <stop offset="0%" stop-color="#ff4d4d" stop-opacity="0.05"/>
    <stop offset="100%" stop-color="#0f1014" stop-opacity="0"/>
  </radialGradient>
  <linearGradient id="topbar" x1="0%" y1="0%" x2="100%" y2="0%">
    <stop offset="0%"   stop-color="#1aff6b" stop-opacity="0"/>
    <stop offset="15%"  stop-color="#1aff6b" stop-opacity="1"/>
    <stop offset="85%"  stop-color="#1aff6b" stop-opacity="1"/>
    <stop offset="100%" stop-color="#1aff6b" stop-opacity="0"/>
  </linearGradient>
  <pattern id="grid" x="0" y="0" width="48" height="48" patternUnits="userSpaceOnUse">
    <circle cx="24" cy="24" r="1" fill="rgba(255,255,255,0.025)"/>
  </pattern>
  <filter id="numglow" x="-20%" y="-20%" width="140%" height="140%">
    <feGaussianBlur stdDeviation="8" result="blur"/>
    <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
  </filter>
</defs>
${sharedBackground(dynamicH)}
<rect width="${W}" height="${dynamicH}" fill="url(#coldglow)"/>
${sharedHeader(today)}

<!-- TITLE -->
<text x="${W/2}" y="142" text-anchor="middle" font-size="12" font-weight="700"
  fill="rgba(26,255,107,0.6)" letter-spacing="5">
  🔥 WHO'S SURGING · WHO'S SLIPPING · THROUGH GAME ${esc(String(avgGp))}
</text>
<text x="${W/2}" y="228" text-anchor="middle" font-size="76" font-weight="700"
  fill="#1aff6b" letter-spacing="-3" filter="url(#numglow)">HOT</text>
<text x="${W/2}" y="306" text-anchor="middle" font-size="38" font-weight="700"
  fill="rgba(255,255,255,0.25)" letter-spacing="8">VS</text>
<text x="${W/2}" y="384" text-anchor="middle" font-size="76" font-weight="700"
  fill="#ff4d4d" letter-spacing="-3" filter="url(#numglow)">COLD</text>

<!-- Explainer strip -->
<rect x="${PAD}" y="408" width="${W-PAD*2}" height="52" rx="10"
  fill="rgba(255,255,255,0.03)" stroke="rgba(255,255,255,0.07)" stroke-width="1"/>
<text x="${W/2}" y="428" text-anchor="middle" font-size="13" font-weight="700"
  fill="rgba(255,255,255,0.5)" letter-spacing="1">
  LAST 10 = RIGHT NOW.  LAST 20 = IS IT REAL?
</text>
<text x="${W/2}" y="448" text-anchor="middle" font-size="12"
  fill="rgba(255,255,255,0.25)" font-family="${SANS}">
  The trend label tells you if the streak has legs.
</text>

<!-- HOT PANEL -->
<rect x="${PAD}" y="${hotPanelY}" width="${W-PAD*2}" height="${hotPanelH}" rx="12"
  fill="rgba(0,0,0,0.4)" stroke="rgba(26,255,107,0.2)" stroke-width="1"/>
<rect x="${PAD}" y="${hotPanelY}" width="${W-PAD*2}" height="52" rx="8"
  fill="rgba(26,255,107,0.1)"/>
<line x1="${PAD}" y1="${hotPanelY+52}" x2="${W-PAD}" y2="${hotPanelY+52}"
  stroke="rgba(26,255,107,0.15)" stroke-width="1"/>
<text x="${PAD+16}" y="${hotPanelY+22}" font-size="16">🔥</text>
<text x="${PAD+38}" y="${hotPanelY+22}" font-size="15" font-weight="700"
  fill="#1aff6b" letter-spacing="0.06em">HOTTEST TEAMS RIGHT NOW</text>
<text x="${PAD+38}" y="${hotPanelY+40}" font-size="9" font-weight="700"
  fill="rgba(255,255,255,0.3)" letter-spacing="0.12em">
  LAST 10 + LAST 20 · ${esc(String(year))} SEASON
</text>
${hotTeams.map((t,i)=>hotColdRow(t, PAD, hotPanelY+52+i*rowH, W-PAD*2, i)).join('')}

<!-- COLD PANEL -->
<rect x="${PAD}" y="${coldPanelY}" width="${W-PAD*2}" height="${coldPanelH}" rx="12"
  fill="rgba(0,0,0,0.4)" stroke="rgba(255,77,77,0.2)" stroke-width="1"/>
<rect x="${PAD}" y="${coldPanelY}" width="${W-PAD*2}" height="52" rx="8"
  fill="rgba(255,77,77,0.08)"/>
<line x1="${PAD}" y1="${coldPanelY+52}" x2="${W-PAD}" y2="${coldPanelY+52}"
  stroke="rgba(255,77,77,0.15)" stroke-width="1"/>
<text x="${PAD+16}" y="${coldPanelY+22}" font-size="16">❄️</text>
<text x="${PAD+38}" y="${coldPanelY+22}" font-size="15" font-weight="700"
  fill="#ff4d4d" letter-spacing="0.06em">COLDEST TEAMS RIGHT NOW</text>
<text x="${PAD+38}" y="${coldPanelY+40}" font-size="9" font-weight="700"
  fill="rgba(255,255,255,0.3)" letter-spacing="0.12em">
  LAST 10 + LAST 20 · ${esc(String(year))} SEASON
</text>
${coldTeams.map((t,i)=>hotColdRow(t, PAD, coldPanelY+52+i*rowH, W-PAD*2, i)).join('')}

${convoBox(question, convoY)}
${sharedFooter('#TrackTheSeason · #MLB · #HotOrNot', footerY)}
</svg>`;
}

/* ════════════════════════════════════════════════════
   VARIANT 3 — PACE LEADERS
   Projected wins leaderboard. Contenders vs Pretenders.
════════════════════════════════════════════════════ */
function paceRow(team, x, y, w, rank, maxProj, minProj) {
  const isContender = team.proj >= 88;
  const color = team.proj >= 95 ? '#1aff6b'
              : team.proj >= 88 ? '#4ecb77'
              : team.proj >= 78 ? '#f9d96e'
              : '#ff4d4d';
  const rowH  = 62;
  const range = (maxProj - minProj) || 1;
  const pct   = (team.proj - minProj) / range;
  const barW  = w - 220;
  const bg    = rank < 3 ? 'rgba(26,255,107,0.04)' : 'rgba(255,255,255,0.02)';

  return `
  <g>
    <rect x="${x}" y="${y}" width="${w}" height="${rowH}" fill="${esc(bg)}"/>
    <line x1="${x}" y1="${y+rowH}" x2="${x+w}" y2="${y+rowH}"
      stroke="rgba(255,255,255,0.04)" stroke-width="1"/>
    <!-- Rank -->
    <text x="${x+20}" y="${y+rowH/2+6}" text-anchor="middle" font-size="${rank<3?18:13}"
      font-weight="700" fill="${rank<3?'rgba(26,255,107,0.6)':'rgba(255,255,255,0.2)'}">${rank+1}</text>
    ${logoCircle(team.logo, x+50, y+rowH/2, 22)}
    <!-- Name -->
    <text x="${x+82}" y="${y+26}" font-size="16" font-weight="700"
      fill="#e8edf8" letter-spacing="0.02em">${esc(team.club)}</text>
    <!-- Record -->
    <text x="${x+82}" y="${y+46}" font-size="12"
      fill="rgba(255,255,255,0.35)">${team.w}–${team.l} · ${team.gp} GP</text>
    <!-- Bar -->
    <rect x="${x+w-barW-128}" y="${y+rowH/2-4}" width="${barW}" height="8" rx="4"
      fill="rgba(255,255,255,0.05)"/>
    <rect x="${x+w-barW-128}" y="${y+rowH/2-4}" width="${Math.max(4,barW*pct)}"
      height="8" rx="4" fill="${esc(color)}" opacity="0.7"/>
    <!-- Proj wins -->
    <text x="${x+w-16}" y="${y+rowH/2+7}" text-anchor="end" font-size="26"
      font-weight="700" fill="${esc(color)}" letter-spacing="-0.03em">
      ${esc(String(team.proj))}W
    </text>
  </g>`;
}

function buildPaceLeadersSVG(data) {
  const { rankedTeams, avgGp, year } = data;
  const today    = new Date().toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'});
  const top      = rankedTeams[0];
  const contenders  = rankedTeams.filter(t=>t.proj>=88).slice(0,8);
  const pretenders  = rankedTeams.filter(t=>t.proj<78).slice(-5).reverse();
  const maxProj  = rankedTeams[0]?.proj || 100;
  const minProj  = rankedTeams[rankedTeams.length-1]?.proj || 60;
  const rowH     = 62;
  const cPanelH  = 56 + contenders.length * rowH;
  const pPanelH  = 56 + pretenders.length * rowH;
  const cPanelY  = 500;
  const pPanelY  = cPanelY + cPanelH + 20;
  const convoY   = pPanelY + pPanelH + 24;
  const footerY  = convoY + 144;
  const dynamicH = footerY + 80;

  const question = top
    ? `Can the ${top.club} actually finish with ${top.proj}+ wins?`
    : `Which team is surprising you most with their pace?`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"
     width="${W}" height="${dynamicH}" viewBox="0 0 ${W} ${dynamicH}">
${sharedDefs()}
${sharedBackground(dynamicH)}
${sharedHeader(today)}

<!-- TITLE -->
<text x="${W/2}" y="142" text-anchor="middle" font-size="12" font-weight="700"
  fill="rgba(26,255,107,0.6)" letter-spacing="5">
  🚀 PROJECTED WINS · THROUGH GAME ${esc(String(avgGp))} · ${esc(String(year))} SEASON
</text>
<text x="${W/2}" y="228" text-anchor="middle" font-size="56" font-weight="700"
  fill="#e8edf8" letter-spacing="-2">MLB PACE</text>
<text x="${W/2}" y="316" text-anchor="middle" font-size="88" font-weight="700"
  fill="#1aff6b" letter-spacing="-4" filter="url(#numglow)">LEADERBOARD</text>

<!-- Hero top team -->
<rect x="${PAD}" y="350" width="${W-PAD*2}" height="112" rx="14"
  fill="rgba(26,255,107,0.06)" stroke="rgba(26,255,107,0.2)" stroke-width="1"/>
<rect x="${PAD}" y="350" width="4" height="112" rx="2" fill="#1aff6b"/>
${logoCircle(top?.logo, PAD+64, 406, 32)}
<text x="${PAD+108}" y="388" font-size="13" font-weight="700"
  fill="rgba(255,255,255,0.4)" letter-spacing="3">#1 PACE IN MLB</text>
<text x="${PAD+108}" y="428" font-size="32" font-weight="700"
  fill="#e8edf8" letter-spacing="-0.5">${esc(top?.club||'—')}</text>
<text x="${W-PAD-20}" y="424" text-anchor="end" font-size="60" font-weight="700"
  fill="#1aff6b" letter-spacing="-3" filter="url(#numglow)">${esc(String(top?.proj||'—'))}W</text>
<text x="${W-PAD-20}" y="446" text-anchor="end" font-size="13"
  fill="rgba(255,255,255,0.3)" letter-spacing="2">PACE PROJECTION</text>

<!-- Contenders panel -->
<rect x="${PAD}" y="${cPanelY}" width="${W-PAD*2}" height="${cPanelH}" rx="12"
  fill="rgba(0,0,0,0.4)" stroke="rgba(26,255,107,0.15)" stroke-width="1"/>
<rect x="${PAD}" y="${cPanelY}" width="${W-PAD*2}" height="56" rx="8"
  fill="rgba(26,255,107,0.08)"/>
<line x1="${PAD}" y1="${cPanelY+56}" x2="${W-PAD}" y2="${cPanelY+56}"
  stroke="rgba(26,255,107,0.12)" stroke-width="1"/>
<text x="${PAD+16}" y="${cPanelY+24}" font-size="16">🏆</text>
<text x="${PAD+38}" y="${cPanelY+24}" font-size="15" font-weight="700"
  fill="#1aff6b" letter-spacing="0.06em">CONTENDERS</text>
<text x="${PAD+38}" y="${cPanelY+42}" font-size="9" font-weight="700"
  fill="rgba(255,255,255,0.3)" letter-spacing="0.12em">88+ WIN PACE · PROJECTED FINAL WINS</text>
${contenders.map((t,i)=>paceRow(t, PAD, cPanelY+56+i*rowH, W-PAD*2, i, maxProj, 88)).join('')}

<!-- Pretenders panel -->
<rect x="${PAD}" y="${pPanelY}" width="${W-PAD*2}" height="${pPanelH}" rx="12"
  fill="rgba(0,0,0,0.4)" stroke="rgba(255,77,77,0.15)" stroke-width="1"/>
<rect x="${PAD}" y="${pPanelY}" width="${W-PAD*2}" height="56" rx="8"
  fill="rgba(255,77,77,0.06)"/>
<line x1="${PAD}" y1="${pPanelY+56}" x2="${W-PAD}" y2="${pPanelY+56}"
  stroke="rgba(255,77,77,0.12)" stroke-width="1"/>
<text x="${PAD+16}" y="${pPanelY+24}" font-size="16">⚠️</text>
<text x="${PAD+38}" y="${pPanelY+24}" font-size="15" font-weight="700"
  fill="#ff4d4d" letter-spacing="0.06em">PRETENDERS</text>
<text x="${PAD+38}" y="${pPanelY+42}" font-size="9" font-weight="700"
  fill="rgba(255,255,255,0.3)" letter-spacing="0.12em">BELOW 78-WIN PACE · WORST IN MLB</text>
${pretenders.map((t,i)=>paceRow(t, PAD, pPanelY+56+i*rowH, W-PAD*2, i, 78, minProj)).join('')}

${convoBox(question, convoY)}
${sharedFooter('#TrackTheSeason · #MLB · #PaceCheck', footerY)}
</svg>`;
}

/* ── Main handler ──────────────────────────────────── */
export default async function handler(req) {
  const url     = new URL(req.url);
  const variant = url.searchParams.get('variant') || 'chaos';
  const year    = Number(url.searchParams.get('season')) || new Date().getFullYear();
  const prev    = year - 1;

  /* Load all 30 teams */
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
        const gp   = cur.length;
        const w    = cur.filter(g=>g.win).length;
        const l    = gp - w;
        const proj = gp ? Math.round((w/gp)*SEASON_GAMES) : null;
        const l10s = cur.slice(-10);
        const l10w = l10s.filter(g=>g.win).length;
        const l20s = cur.slice(-20);
        const l20w = l20s.filter(g=>g.win).length;
        let delta  = null;
        if (gp>0 && pre.length>=gp)
          delta = w - pre.slice(0,gp).filter(g=>g.win).length;
        return { id, slug, club, gp, w, l, proj, l10w, l10l:10-l10w, l20w, l20l:20-l20w, delta };
      })
    );
    for (const r of results) if (r.status==='fulfilled') teamStats.push(r.value);
  }

  const avgGp = Math.round(teamStats.reduce((s,t)=>s+t.gp,0)/(teamStats.length||1));

  /* Fetch logos for teams that will appear */
  let visibleIds = [];
  if (variant === 'chaos') {
    const withDelta = teamStats.filter(t=>t.delta!==null&&t.gp>=15);
    visibleIds = [
      ...withDelta.sort((a,b)=>b.delta-a.delta).slice(0,5),
      ...withDelta.sort((a,b)=>a.delta-b.delta).slice(0,5),
    ].map(t=>t.id);
  } else if (variant === 'hot-cold') {
    const valid = teamStats.filter(t=>t.gp>=20);
    visibleIds = [
      ...valid.sort((a,b)=>b.l10w-a.l10w).slice(0,5),
      ...valid.sort((a,b)=>a.l10w-b.l10w).slice(0,5),
    ].map(t=>t.id);
  } else {
    visibleIds = teamStats.filter(t=>t.proj).sort((a,b)=>(b.proj||0)-(a.proj||0)).map(t=>t.id);
  }

  const logoMap = {};
  await Promise.allSettled(
    [...new Set(visibleIds)].map(async id => {
      logoMap[id] = await fetchLogoBase64(id);
    })
  );
  const attach = t => ({ ...t, logo: logoMap[t.id] || null });

  let svg;
  if (variant === 'hot-cold') {
    const valid     = teamStats.filter(t=>t.gp>=20);
    /* Use spread to avoid mutating `valid` when sorting */
    const hotTeams  = [...valid].sort((a,b)=>b.l10w-a.l10w).slice(0,5).map(attach);
    const coldTeams = [...valid].sort((a,b)=>a.l10w-b.l10w).slice(0,5).map(attach);
    svg = buildHotColdSVG({ hotTeams, coldTeams, avgGp, year });

  } else if (variant === 'pace-leaders') {
    const rankedTeams = teamStats
      .filter(t=>t.proj&&t.gp>=15)
      .sort((a,b)=>(b.proj||0)-(a.proj||0))
      .map(attach);
    svg = buildPaceLeadersSVG({ rankedTeams, avgGp, year });

  } else {
    const withDelta  = teamStats.filter(t=>t.delta!==null&&t.gp>=15);
    const chaosCount = withDelta.filter(t=>Math.abs(t.delta)>=CHAOS_THRESHOLD).length;
    const pct        = Math.round(chaosCount/30*100);
    const risers     = [...withDelta].sort((a,b)=>b.delta-a.delta).slice(0,5).map(attach);
    const fallers    = [...withDelta].sort((a,b)=>a.delta-b.delta).slice(0,5).map(attach);
    svg = buildChaosSVG({ risers, fallers, chaosCount, pct, year, avgGp });
  }

  return new Response(svg, {
    headers: {
      'Content-Type':  'image/svg+xml',
      /* s-maxage controls Vercel's CDN cache — keyed by full URL including ?variant= */
      'Cache-Control': 'public, s-maxage=1800, stale-while-revalidate=3600',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
