/**
 * TRACK THE SEASON — Payroll Efficiency Report
 * /api/payroll-efficiency-report
 *
 * Dynamic SVG graphic: Cost Per Projected Win
 * Formula: currentPayroll / (wins/gamesPlayed * 162)
 *
 * Payroll data: 2026 Opening Day payrolls (millions USD)
 * Source: Spotrac / Baseball Reference (update annually)
 * Win pace: live from MLB Stats API
 */

export const config = { runtime: 'edge' };

const SEASON_GAMES = 162;

/* ── 2026 Opening Day payrolls (USD millions) ────────
   Update this table each offseason.
   Source: Spotrac.com/mlb/payroll                     */
const PAYROLLS_2026 = {
  108: 226, // Angels
  109: 164, // Diamondbacks
  110: 207, // Orioles
  111: 218, // Red Sox
  112: 233, // Cubs
  113: 119, // Reds
  114: 152, // Guardians
  115: 107, // Rockies
  116: 129, // Tigers
  117: 233, // Astros
  118: 122, // Royals
  119: 311, // Dodgers
  120: 102, // Nationals
  121: 319, // Mets
  133: 75,  // Athletics
  134: 88,  // Pirates
  135: 245, // Padres
  136: 159, // Mariners
  137: 162, // Giants
  138: 186, // Cardinals
  139: 105, // Rays
  140: 227, // Rangers
  141: 213, // Blue Jays
  142: 173, // Twins
  143: 241, // Phillies
  144: 284, // Braves
  145: 79,  // White Sox
  146: 87,  // Marlins
  147: 313, // Yankees
  158: 138, // Brewers
};

const TEAM_NAMES = {
  108:'Angels',109:'Diamondbacks',110:'Orioles',111:'Red Sox',112:'Cubs',
  113:'Reds',114:'Guardians',115:'Rockies',116:'Tigers',117:'Astros',
  118:'Royals',119:'Dodgers',120:'Nationals',121:'Mets',133:'Athletics',
  134:'Pirates',135:'Padres',136:'Mariners',137:'Giants',138:'Cardinals',
  139:'Rays',140:'Rangers',141:'Blue Jays',142:'Twins',143:'Phillies',
  144:'Braves',145:'White Sox',146:'Marlins',147:'Yankees',158:'Brewers',
};

const TEAM_CITIES = {
  108:'Los Angeles',109:'Arizona',110:'Baltimore',111:'Boston',112:'Chicago',
  113:'Cincinnati',114:'Cleveland',115:'Colorado',116:'Detroit',117:'Houston',
  118:'Kansas City',119:'Los Angeles',120:'Washington',121:'New York',133:'Oakland',
  134:'Pittsburgh',135:'San Diego',136:'Seattle',137:'San Francisco',138:'St. Louis',
  139:'Tampa Bay',140:'Texas',141:'Toronto',142:'Minnesota',143:'Philadelphia',
  144:'Atlanta',145:'Chicago',146:'Miami',147:'New York',158:'Milwaukee',
};

function esc(s){
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

async function fetchLogoBase64(teamId){
  try{
    const res = await fetch(`https://www.mlbstatic.com/team-logos/${teamId}.svg`);
    if(!res.ok) return null;
    const bytes = await res.arrayBuffer();
    const b64   = btoa(String.fromCharCode(...new Uint8Array(bytes)));
    return `data:image/svg+xml;base64,${b64}`;
  } catch{ return null; }
}

async function loadRecord(teamId, year){
  try{
    const res  = await fetch(
      `https://statsapi.mlb.com/api/v1/schedule?sportId=1&teamId=${teamId}&season=${year}&gameTypes=R`
    );
    const data = await res.json();
    let wins=0, losses=0;
    for(const d of data.dates||[]){
      for(const g of d.games||[]){
        if(g.status?.abstractGameState!=='Final') continue;
        const h=g.teams?.home, a=g.teams?.away;
        if(h?.score==null||a?.score==null||h.score===a.score) continue;
        const isHome = String(h.team.id)===String(teamId);
        if(isHome){ if(h.score>a.score) wins++; else losses++; }
        else       { if(a.score>h.score) wins++; else losses++; }
      }
    }
    return {wins, losses, gp: wins+losses};
  } catch{ return {wins:0, losses:0, gp:0}; }
}

/* ── SVG helpers ─────────────────────────────────── */
const W=1200, PAD=52;
const MONO = `'IBM Plex Mono','Courier New',monospace`;
const SANS = `'IBM Plex Sans','Arial',sans-serif`;

function fmtPayroll(m){ return `$${m}M`; }
function fmtPace(p)   { return p.toFixed(1)+'W'; }
function fmtCPW(m)    {
  if(m>=1) return `$${m.toFixed(2)}M`;
  return `$${(m*1000).toFixed(0)}K`;
}

function logoCircle(logoData, cx, cy, r=20){
  return `
  <circle cx="${cx}" cy="${cy}" r="${r}" fill="#ffffff"
    style="filter:drop-shadow(0 1px 4px rgba(0,0,0,0.4))"/>
  ${logoData
    ? `<image href="${logoData}" x="${cx-r*.78}" y="${cy-r*.78}"
        width="${r*1.56}" height="${r*1.56}" preserveAspectRatio="xMidYMid meet"/>`
    : `<text x="${cx}" y="${cy+4}" text-anchor="middle" font-size="${r*.7}" fill="#888">⚾</text>`
  }`;
}

/* ── Team row ──────────────────────────────────────
   x,y,w: bounding box. isValue: green side (true) or red (false) */
function teamRow(team, x, y, w, rank, isBestValue){
  const color    = isBestValue ? '#1aff6b' : '#ff4d4d';
  const rowH     = 64;
  const logoX    = x + 26;
  const nameX    = x + 56;
  const cpwX     = x + w - 16;
  const bg       = rank===1
    ? `rgba(${isBestValue?'26,255,107':'255,77,77'},0.07)`
    : 'rgba(255,255,255,0.02)';

  return `
  <g>
    <rect x="${x}" y="${y}" width="${w}" height="${rowH}" fill="${esc(bg)}"/>
    <line x1="${x}" y1="${y+rowH}" x2="${x+w}" y2="${y+rowH}"
      stroke="rgba(255,255,255,0.04)" stroke-width="1"/>

    <!-- Rank -->
    <text x="${x+14}" y="${y+rowH/2+5}" text-anchor="middle"
      font-family="${MONO}" font-size="${rank===1?15:12}" font-weight="700"
      fill="${rank===1?color:'rgba(255,255,255,0.2)'}">${rank}</text>

    <!-- Logo -->
    ${logoCircle(team.logo, logoX, y+rowH/2)}

    <!-- Name -->
    <text x="${nameX}" y="${y+22}"
      font-family="${MONO}" font-size="15" font-weight="700" fill="#e8edf8">
      ${esc(team.name)}
    </text>

    <!-- Payroll + pace sub-line -->
    <text x="${nameX}" y="${y+42}"
      font-family="${MONO}" font-size="10" fill="rgba(255,255,255,0.35)">
      ${esc(fmtPayroll(team.payroll))} payroll · ${esc(fmtPace(team.pace))} pace
    </text>

    <!-- Cost per projected win -->
    <text x="${cpwX}" y="${y+rowH/2+7}" text-anchor="end"
      font-family="${MONO}" font-size="18" font-weight="700"
      fill="${esc(color)}">${esc(fmtCPW(team.cpw))}</text>
  </g>`;
}

function buildSVG(bestValue, mostExpensive, today){
  const rowH   = 64;
  const colW   = (W - PAD*2 - 20) / 2;
  const panelHeaderH = 52;
  const rows   = 5;
  const panelH = panelHeaderH + rows * rowH;
  const panelY = 520;
  const summaryY = panelY + panelH + 24;
  const summaryH = 96;
  const footerY  = summaryY + summaryH + 20;
  const H        = footerY + 80;

  const best  = bestValue[0];
  const worst = mostExpensive[0];

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"
     width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<defs>
  <style>text{font-family:${MONO}}</style>
  <radialGradient id="topglow" cx="50%" cy="0%" r="55%">
    <stop offset="0%" stop-color="#1aff6b" stop-opacity="0.08"/>
    <stop offset="100%" stop-color="#0f1014" stop-opacity="0"/>
  </radialGradient>
  <linearGradient id="topbar" x1="0%" y1="0%" x2="100%" y2="0%">
    <stop offset="0%"   stop-color="#1aff6b" stop-opacity="0"/>
    <stop offset="15%"  stop-color="#1aff6b" stop-opacity="1"/>
    <stop offset="85%"  stop-color="#1aff6b" stop-opacity="1"/>
    <stop offset="100%" stop-color="#1aff6b" stop-opacity="0"/>
  </linearGradient>
  <pattern id="dots" x="0" y="0" width="48" height="48" patternUnits="userSpaceOnUse">
    <circle cx="24" cy="24" r="1" fill="rgba(255,255,255,0.025)"/>
  </pattern>
  <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
    <feGaussianBlur stdDeviation="6" result="blur"/>
    <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
  </filter>
</defs>

<!-- BACKGROUND -->
<rect width="${W}" height="${H}" fill="#0f1014"/>
<rect width="${W}" height="${H}" fill="url(#dots)"/>
<rect width="${W}" height="${H}" fill="url(#topglow)"/>
<rect x="0"      y="0" width="3" height="${H}" fill="rgba(26,255,107,0.2)"/>
<rect x="${W-3}" y="0" width="3" height="${H}" fill="rgba(26,255,107,0.2)"/>
<rect width="${W}" height="5" fill="url(#topbar)"/>

<!-- HEADER -->
<rect x="${PAD}" y="36" width="46" height="46" rx="9" fill="#1aff6b"/>
<text x="${PAD+23}" y="65" text-anchor="middle" font-size="13" font-weight="700"
  fill="#0f1014">TTS</text>
<text x="${PAD+60}" y="55" font-size="15" font-weight="700" fill="#e8edf8"
  letter-spacing="2">TRACK THE <tspan fill="#1aff6b">SEASON</tspan></text>
<text x="${PAD+60}" y="74" font-size="10" fill="rgba(255,255,255,0.25)"
  letter-spacing="3">tracktheseason.com</text>

<!-- Live badge -->
<rect x="${W-PAD-216}" y="36" width="216" height="46" rx="23"
  fill="rgba(26,255,107,0.08)" stroke="rgba(26,255,107,0.2)" stroke-width="1"/>
<circle cx="${W-PAD-202}" cy="59" r="5" fill="#1aff6b"/>
<text x="${W-PAD-190}" y="64" font-size="11" font-weight="700" fill="#1aff6b"
  letter-spacing="2">UPDATED AFTER EVERY GAME</text>

<!-- Divider -->
<rect x="${PAD}" y="100" width="${W-PAD*2}" height="1" fill="rgba(255,255,255,0.07)"/>

<!-- TITLE BLOCK -->
<text x="${W/2}" y="146" text-anchor="middle" font-size="11" font-weight="700"
  fill="rgba(26,255,107,0.6)" letter-spacing="5">
  💰 MLB PAYROLL EFFICIENCY REPORT
</text>
<text x="${W/2}" y="232" text-anchor="middle" font-size="88" font-weight="700"
  fill="#1aff6b" letter-spacing="-4" filter="url(#glow)">PAYROLL</text>
<text x="${W/2}" y="308" text-anchor="middle" font-size="64" font-weight="700"
  fill="#e8edf8" letter-spacing="-2">EFFICIENCY</text>

<!-- Formula line -->
<rect x="${PAD}" y="330" width="${W-PAD*2}" height="52" rx="10"
  fill="rgba(255,255,255,0.03)" stroke="rgba(255,255,255,0.06)" stroke-width="1"/>
<text x="${W/2}" y="349" text-anchor="middle" font-size="12" font-weight="700"
  fill="rgba(255,255,255,0.45)" letter-spacing="2">
  COST PER PROJECTED WIN
</text>
<text x="${W/2}" y="370" text-anchor="middle" font-size="12"
  fill="rgba(255,255,255,0.25)" font-family="${SANS}">
  Current Payroll ÷ (Wins / Games Played × 162) · ${esc(today)}
</text>

<!-- BEST VALUE panel -->
<rect x="${PAD}" y="${panelY}" width="${colW}" height="${panelH}" rx="12"
  fill="rgba(0,0,0,0.4)" stroke="rgba(26,255,107,0.2)" stroke-width="1"/>
<rect x="${PAD}" y="${panelY}" width="${colW}" height="${panelHeaderH}" rx="8"
  fill="rgba(26,255,107,0.1)"/>
<line x1="${PAD}" y1="${panelY+panelHeaderH}" x2="${PAD+colW}" y2="${panelY+panelHeaderH}"
  stroke="rgba(26,255,107,0.15)" stroke-width="1"/>
<text x="${PAD+16}" y="${panelY+22}" font-size="16">💚</text>
<text x="${PAD+38}" y="${panelY+22}" font-size="14" font-weight="700"
  fill="#1aff6b" letter-spacing="0.06em">BEST VALUE</text>
<text x="${PAD+38}" y="${panelY+40}" font-size="9" font-weight="700"
  fill="rgba(255,255,255,0.3)" letter-spacing="0.12em">
  LOWEST COST PER PROJECTED WIN
</text>
${bestValue.map((t,i)=>teamRow(t, PAD, panelY+panelHeaderH+i*rowH, colW, i+1, true)).join('')}

<!-- MOST EXPENSIVE panel -->
<rect x="${PAD+colW+20}" y="${panelY}" width="${colW}" height="${panelH}" rx="12"
  fill="rgba(0,0,0,0.4)" stroke="rgba(255,77,77,0.2)" stroke-width="1"/>
<rect x="${PAD+colW+20}" y="${panelY}" width="${colW}" height="${panelHeaderH}" rx="8"
  fill="rgba(255,77,77,0.08)"/>
<line x1="${PAD+colW+20}" y1="${panelY+panelHeaderH}" x2="${PAD+colW*2+20}" y2="${panelY+panelHeaderH}"
  stroke="rgba(255,77,77,0.15)" stroke-width="1"/>
<text x="${PAD+colW+36}" y="${panelY+22}" font-size="16">🔴</text>
<text x="${PAD+colW+58}" y="${panelY+22}" font-size="14" font-weight="700"
  fill="#ff4d4d" letter-spacing="0.06em">MOST EXPENSIVE</text>
<text x="${PAD+colW+58}" y="${panelY+40}" font-size="9" font-weight="700"
  fill="rgba(255,255,255,0.3)" letter-spacing="0.12em">
  HIGHEST COST PER PROJECTED WIN
</text>
${mostExpensive.map((t,i)=>teamRow(t, PAD+colW+20, panelY+panelHeaderH+i*rowH, colW, i+1, false)).join('')}

<!-- SUMMARY CALLOUTS -->
<rect x="${PAD}" y="${summaryY}" width="${colW}" height="${summaryH}" rx="12"
  fill="rgba(26,255,107,0.06)" stroke="rgba(26,255,107,0.15)" stroke-width="1"/>
<rect x="${PAD+4}" y="${summaryY}" width="4" height="${summaryH}" rx="2" fill="#1aff6b"/>
${best ? `
<text x="${PAD+20}" y="${summaryY+22}" font-size="10" font-weight="700"
  fill="rgba(255,255,255,0.35)" letter-spacing="2">BEST EFFICIENCY</text>
<text x="${PAD+20}" y="${summaryY+50}" font-size="26" font-weight="700"
  fill="#1aff6b" letter-spacing="-0.5">${esc(best.name)}</text>
<text x="${PAD+20}" y="${summaryY+72}" font-size="14"
  fill="rgba(255,255,255,0.5)">${esc(fmtCPW(best.cpw))} per projected win</text>
` : ''}

<rect x="${PAD+colW+20}" y="${summaryY}" width="${colW}" height="${summaryH}" rx="12"
  fill="rgba(255,77,77,0.06)" stroke="rgba(255,77,77,0.15)" stroke-width="1"/>
<rect x="${PAD+colW+20}" y="${summaryY}" width="4" height="${summaryH}" rx="2" fill="#ff4d4d"/>
${worst ? `
<text x="${PAD+colW+36}" y="${summaryY+22}" font-size="10" font-weight="700"
  fill="rgba(255,255,255,0.35)" letter-spacing="2">WORST EFFICIENCY</text>
<text x="${PAD+colW+36}" y="${summaryY+50}" font-size="26" font-weight="700"
  fill="#ff4d4d" letter-spacing="-0.5">${esc(worst.name)}</text>
<text x="${PAD+colW+36}" y="${summaryY+72}" font-size="14"
  fill="rgba(255,255,255,0.5)">${esc(fmtCPW(worst.cpw))} per projected win</text>
` : ''}

<!-- FOOTER -->
<rect x="${PAD}" y="${footerY}" width="${W-PAD*2}" height="36" rx="6"
  fill="rgba(26,255,107,0.08)" stroke="rgba(26,255,107,0.15)" stroke-width="1"/>
<text x="${W/2}" y="${footerY+24}" text-anchor="middle" font-size="13" font-weight="700"
  fill="rgba(26,255,107,0.7)" letter-spacing="3">
  TRACK EVERY TEAM → TRACKTHESEASON.COM
</text>
<rect x="0" y="${footerY+52}" width="${W}" height="28" fill="#1a1d24"/>
<line x1="0" y1="${footerY+52}" x2="${W}" y2="${footerY+52}"
  stroke="rgba(255,255,255,0.05)" stroke-width="1"/>
<text x="${W/2}" y="${footerY+69}" text-anchor="middle" font-size="10"
  fill="rgba(255,255,255,0.18)" letter-spacing="2">
  #TrackTheSeason · Payroll data: Spotrac · Win pace: MLB Stats API · Not affiliated with MLB
</text>
</svg>`;
}

/* ── Main handler ──────────────────────────────── */
export default async function handler(req){
  const year    = new Date().getFullYear();
  const today   = new Date().toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'});
  const BATCH   = 6;
  const teamIds = Object.keys(PAYROLLS_2026).map(Number);
  const records = {};

  /* Load all team records in batches */
  for(let i=0; i<teamIds.length; i+=BATCH){
    const batch = teamIds.slice(i, i+BATCH);
    const results = await Promise.allSettled(
      batch.map(async id => ({ id, rec: await loadRecord(id, year) }))
    );
    for(const r of results){
      if(r.status==='fulfilled') records[r.value.id] = r.value.rec;
    }
  }

  /* Compute cost per projected win for each team */
  const teams = teamIds
    .map(id => {
      const rec     = records[id];
      const payroll = PAYROLLS_2026[id];
      if(!rec||!payroll||rec.gp<5) return null; // need at least 5 games
      const pace    = (rec.wins / rec.gp) * SEASON_GAMES;
      if(pace < 1) return null; // avoid divide-by-zero / absurd values
      const cpw     = payroll / pace; // $M per projected win
      return {
        id,
        name:    TEAM_NAMES[id]  || 'Unknown',
        city:    TEAM_CITIES[id] || '',
        payroll, // $M
        wins:    rec.wins,
        losses:  rec.losses,
        gp:      rec.gp,
        pace:    Math.round(pace * 10) / 10,
        cpw:     Math.round(cpw * 1000) / 1000, // 3 decimal places
        logo:    null, // populated below
      };
    })
    .filter(Boolean)
    .sort((a,b) => a.cpw - b.cpw); // ascending = best value first

  /* Fetch logos for visible teams (top5 + bottom5) */
  const visibleIds = [
    ...teams.slice(0,5).map(t=>t.id),
    ...teams.slice(-5).map(t=>t.id),
  ];
  const logoMap = {};
  await Promise.allSettled(
    [...new Set(visibleIds)].map(async id => {
      logoMap[id] = await fetchLogoBase64(id);
    })
  );
  teams.forEach(t => { t.logo = logoMap[t.id] || null; });

  const bestValue     = teams.slice(0, 5);
  const mostExpensive = [...teams].sort((a,b) => b.cpw - a.cpw).slice(0, 5);

  const svg = buildSVG(bestValue, mostExpensive, today);

  return new Response(svg, {
    headers: {
      'Content-Type':  'image/svg+xml',
      'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=7200',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
