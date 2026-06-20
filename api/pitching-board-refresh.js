/**
 * TRACK THE SEASON — Pitching Board Refresh
 * /api/pitching-board-refresh
 *
 * Nightly cron: fetches Starter Signal for all 30 MLB teams,
 * computes rotation metrics, writes to Google Sheets "PitchingBoard" tab.
 *
 * Trigger: same cron-job.org setup as /api/snapshot
 * Schedule: daily at 4am UTC (midnight ET)
 *
 * Required env vars: same as snapshot.js
 *   GOOGLE_SHEET_ID, GOOGLE_SERVICE_EMAIL, GOOGLE_SERVICE_PRIVATE_KEY, CRON_SECRET
 *
 * Sheet columns (PitchingBoard tab):
 *   date | teamId | teamName | teamSlug
 *   | top1Name | top1Starts | top1W | top1L | top1Pace | top1RS | top1RA | top1Diff
 *   | top2Name | top2Starts | top2W | top2L | top2Pace | top2RS | top2RA | top2Diff
 *   | duoW | duoL | duoPace | duoRS | duoRA | duoDiff
 *   | restW | restL | restPace | restRS | restRA | restDiff
 *   | rotationGap | signalLabel | narrative | gamesAnalyzed | qualified
 */

export const config = { runtime: 'edge' };

const MLB          = 'https://statsapi.mlb.com/api/v1';
const SEASON_GAMES = 162;
const CURRENT_YEAR = new Date().getFullYear();
const MIN_STARTS   = 5;   /* per pitcher */
const MIN_DUO      = 10;  /* combined top-2 starts */
const MIN_GAMES    = 20;  /* team games for qualification */

const TEAM_IDS = [
  108,109,110,111,112,113,114,115,116,117,118,119,120,121,
  133,134,135,136,137,138,139,140,141,142,143,144,145,146,147,158
];

const TEAM_NAMES = {
  108:'Angels',     109:'Diamondbacks',110:'Orioles',    111:'Red Sox',
  112:'Cubs',       113:'Reds',        114:'Guardians',  115:'Rockies',
  116:'Tigers',     117:'Astros',      118:'Royals',     119:'Dodgers',
  120:'Nationals',  121:'Mets',        133:'Athletics',  134:'Pirates',
  135:'Padres',     136:'Mariners',    137:'Giants',     138:'Cardinals',
  139:'Rays',       140:'Rangers',     141:'Blue Jays',  142:'Twins',
  143:'Phillies',   144:'Braves',      145:'White Sox',  146:'Marlins',
  147:'Yankees',    158:'Brewers',
};

const TEAM_SLUGS = {
  108:'angels',     109:'diamondbacks',110:'orioles',    111:'red-sox',
  112:'cubs',       113:'reds',        114:'guardians',  115:'rockies',
  116:'tigers',     117:'astros',      118:'royals',     119:'dodgers',
  120:'nationals',  121:'mets',        133:'athletics',  134:'pirates',
  135:'padres',     136:'mariners',    137:'giants',     138:'cardinals',
  139:'rays',       140:'rangers',     141:'blue-jays',  142:'twins',
  143:'phillies',   144:'braves',      145:'white-sox',  146:'marlins',
  147:'yankees',    158:'brewers',
};

/* ── MLB API helpers ───────────────────────────────── */
async function fetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
  return res.json();
}

async function getTeamGames(teamId) {
  const data = await fetchJSON(
    `${MLB}/schedule?sportId=1&teamId=${teamId}&season=${CURRENT_YEAR}&gameTypes=R`
  );
  const games = [];
  for (const d of data.dates || []) {
    for (const g of d.games || []) {
      if (g.status?.abstractGameState !== 'Final') continue;
      games.push({
        gamePk:     g.gamePk,
        homeTeamId: g.teams.home.team.id,
        awayTeamId: g.teams.away.team.id,
        homeScore:  g.teams.home.score,
        awayScore:  g.teams.away.score,
      });
    }
  }
  return games;
}

async function getGameStarter(gamePk, teamId) {
  try {
    const data     = await fetchJSON(`${MLB}/game/${gamePk}/boxscore`);
    const isHome   = String(data.teams?.home?.team?.id) === String(teamId);
    const side     = isHome ? 'home' : 'away';
    const opp      = isHome ? 'away' : 'home';
    const pitchers = data.teams?.[side]?.pitchers || [];
    const players  = data.teams?.[side]?.players  || {};
    const pk       = pitchers[0];
    if (!pk) return null;
    const pd       = players[`ID${pk}`];
    return {
      starterId:    pd?.person?.id || pk,
      starterName:  pd?.person?.fullName || 'Unknown',
      runsScored:   data.teams?.[side]?.teamStats?.batting?.runs ?? null,
      runsAllowed:  data.teams?.[opp]?.teamStats?.batting?.runs ?? null,
    };
  } catch { return null; }
}

/* ── Rotation analysis ─────────────────────────────── */
function computeRotation(games, starterMap, teamId) {
  const pitchers = {};
  for (const g of games) {
    const s = starterMap.get(g.gamePk);
    if (!s) continue;
    const isHome = String(g.homeTeamId) === String(teamId);
    const won    = isHome ? g.homeScore > g.awayScore : g.awayScore > g.homeScore;
    if (!pitchers[s.starterId]) {
      pitchers[s.starterId] = { id:s.starterId, name:s.starterName, starts:0, wins:0, losses:0, runsScored:0, runsAllowed:0 };
    }
    const p = pitchers[s.starterId];
    p.starts++;
    won ? p.wins++ : p.losses++;
    if (s.runsScored  != null) p.runsScored  += s.runsScored;
    if (s.runsAllowed != null) p.runsAllowed += s.runsAllowed;
  }

  /* Compute per-pitcher metrics, filter by MIN_STARTS */
  const all = Object.values(pitchers)
    .filter(p => p.starts >= MIN_STARTS)
    .map(p => ({
      ...p,
      winPct:     p.starts ? p.wins / p.starts : 0,
      pace:       p.starts ? Math.round((p.wins / p.starts) * SEASON_GAMES) : 0,
      avgScored:  p.starts ? Math.round(p.runsScored  / p.starts * 10) / 10 : 0,
      avgAllowed: p.starts ? Math.round(p.runsAllowed / p.starts * 10) / 10 : 0,
      runDiff:    p.runsScored - p.runsAllowed,
    }))
    .sort((a, b) => b.pace - a.pace || b.starts - a.starts);

  if (all.length < 1) return null;

  const top1   = all[0];
  const top2   = all[1] || null;
  const topIds = new Set([top1.id, top2?.id].filter(Boolean));

  /* Duo combined */
  const duoPitchers = top2 ? [top1, top2] : [top1];
  const duoStarts   = duoPitchers.reduce((s,p)=>s+p.starts, 0);
  const duoWins     = duoPitchers.reduce((s,p)=>s+p.wins,   0);
  const duoLosses   = duoPitchers.reduce((s,p)=>s+p.losses, 0);
  const duoRS       = duoPitchers.reduce((s,p)=>s+p.runsScored,  0);
  const duoRA       = duoPitchers.reduce((s,p)=>s+p.runsAllowed, 0);
  const duoPace     = duoStarts ? Math.round((duoWins / duoStarts) * SEASON_GAMES) : 0;

  /* Everyone else (raw totals from ALL pitchers including < MIN_STARTS) */
  const restRaw = { starts:0, wins:0, losses:0, runsScored:0, runsAllowed:0 };
  for (const p of Object.values(pitchers)) {
    if (topIds.has(p.id)) continue;
    restRaw.starts    += p.starts;
    restRaw.wins      += p.wins;
    restRaw.losses    += p.losses;
    restRaw.runsScored  += p.runsScored;
    restRaw.runsAllowed += p.runsAllowed;
  }
  const restPace = restRaw.starts ? Math.round((restRaw.wins / restRaw.starts) * SEASON_GAMES) : 0;
  const rotGap   = duoPace - restPace;

  /* Qualified check */
  const qualified = duoStarts >= MIN_DUO && games.length >= MIN_GAMES;

  /* Signal label */
  let label = 'Staff in Flux';
  if (!qualified)              label = 'Small Sample';
  else if (rotGap >= 30)       label = 'Rotation Cliff';
  else if (duoPace >= 95 && rotGap >= 20) label = 'Two-Man Engine';
  else if (restRaw.starts > 0 && (restRaw.runsAllowed / restRaw.starts) < 4.0 && rotGap <= 10) label = 'Deep Staff';
  else if (restPace >= 90)     label = 'Deep Staff';
  else if (Math.abs(rotGap) <= 10 && restPace >= 81) label = 'Balanced Rotation';
  else if (restPace < 70 && rotGap >= 20) label = 'Back-End Problem';
  else if (all.length >= 1 && rotGap >= 15) label = 'Ace-Driven';

  return {
    top1: { name:top1.name, starts:top1.starts, wins:top1.wins, losses:top1.losses, pace:top1.pace, rs:top1.avgScored, ra:top1.avgAllowed, diff:top1.runDiff },
    top2: top2 ? { name:top2.name, starts:top2.starts, wins:top2.wins, losses:top2.losses, pace:top2.pace, rs:top2.avgScored, ra:top2.avgAllowed, diff:top2.runDiff } : null,
    duo:  { starts:duoStarts, wins:duoWins, losses:duoLosses, pace:duoPace, rs:Math.round(duoRS/Math.max(1,duoStarts)*10)/10, ra:Math.round(duoRA/Math.max(1,duoStarts)*10)/10, diff:duoRS-duoRA },
    rest: { starts:restRaw.starts, wins:restRaw.wins, losses:restRaw.losses, pace:restPace, rs:Math.round(restRaw.runsScored/Math.max(1,restRaw.starts)*10)/10, ra:Math.round(restRaw.runsAllowed/Math.max(1,restRaw.starts)*10)/10, diff:restRaw.runsScored-restRaw.runsAllowed },
    rotationGap: rotGap,
    label,
    qualified,
    gamesAnalyzed: games.length,
  };
}

/* ── Google Sheets auth (same as snapshot.js) ───────── */
async function getAccessToken(email, pem) {
  const now  = Math.floor(Date.now() / 1000);
  const enc  = o => btoa(JSON.stringify(o)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  const head = enc({alg:'RS256',typ:'JWT'});
  const pay  = enc({iss:email,scope:'https://www.googleapis.com/auth/spreadsheets',aud:'https://oauth2.googleapis.com/token',exp:now+3600,iat:now});
  const sig_input = `${head}.${pay}`;
  const pemBody = pem.replace(/-----BEGIN PRIVATE KEY-----/,'').replace(/-----END PRIVATE KEY-----/,'').replace(/\s+/g,'');
  const keyDer  = Uint8Array.from(atob(pemBody),c=>c.charCodeAt(0));
  const key     = await crypto.subtle.importKey('pkcs8',keyDer,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['sign']);
  const sigBuf  = await crypto.subtle.sign('RSASSA-PKCS1-v1_5',key,new TextEncoder().encode(sig_input));
  const sig     = btoa(String.fromCharCode(...new Uint8Array(sigBuf))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  const jwt     = `${sig_input}.${sig}`;
  const res     = await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:`grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`});
  const d       = await res.json();
  if (!d.access_token) throw new Error('Token failed: '+JSON.stringify(d));
  return d.access_token;
}

async function ensureTab(sheetId, token, tabName) {
  const meta = await (await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}`,{headers:{Authorization:`Bearer ${token}`}})).json();
  if (meta.sheets?.some(s=>s.properties?.title===tabName)) return;
  await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}:batchUpdate`,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({requests:[{addSheet:{properties:{title:tabName}}}]})});
  await appendRows(sheetId,token,tabName,[['date','teamId','teamName','teamSlug','top1Name','top1Starts','top1W','top1L','top1Pace','top1RS','top1RA','top1Diff','top2Name','top2Starts','top2W','top2L','top2Pace','top2RS','top2RA','top2Diff','duoW','duoL','duoPace','duoRS','duoRA','duoDiff','restW','restL','restPace','restRS','restRA','restDiff','rotationGap','signalLabel','qualified','gamesAnalyzed']]);
}

async function clearDateRows(sheetId, token, tabName, dateStr) {
  const r   = await (await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(tabName)}!A:A`,{headers:{Authorization:`Bearer ${token}`}})).json();
  const rows = r.values||[];
  const toDelete = [];
  for (let i=rows.length-1;i>=1;i--) if(rows[i][0]===dateStr) toDelete.push(i+1);
  if (!toDelete.length) return;
  const meta   = await (await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}`,{headers:{Authorization:`Bearer ${token}`}})).json();
  const tabId  = meta.sheets?.find(s=>s.properties?.title===tabName)?.properties?.sheetId;
  if (tabId==null) return;
  await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}:batchUpdate`,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({requests:toDelete.map(r=>({deleteDimension:{range:{sheetId:tabId,dimension:'ROWS',startIndex:r-1,endIndex:r}}}))})});
}

async function appendRows(sheetId, token, tabName, rows) {
  return (await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(tabName)}!A:AJ:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({values:rows})})).json();
}

/* ── Main handler ──────────────────────────────────── */
export default async function handler(req) {
  const url    = new URL(req.url);
  const secret = url.searchParams.get('secret');
  if (secret !== process.env.CRON_SECRET && req.headers.get('x-vercel-cron') !== '1') {
    return new Response('Unauthorized', {status:401});
  }

  const sheetId  = process.env.GOOGLE_SHEET_ID;
  const email    = process.env.GOOGLE_SERVICE_EMAIL;
  const privKey  = (process.env.GOOGLE_SERVICE_PRIVATE_KEY||'').replace(/\\n/g,'\n');
  if (!sheetId||!email||!privKey) return new Response(JSON.stringify({error:'Missing env vars'}),{status:500,headers:{'Content-Type':'application/json'}});

  const now      = new Date();
  const etDate   = new Date(now.getTime() - 5*3600*1000);
  const dateStr  = etDate.toISOString().slice(0,10);
  const TAB      = 'PitchingBoard';

  console.log(`[pitching-board] Starting refresh for ${dateStr}`);

  const token = await getAccessToken(email, privKey);
  await ensureTab(sheetId, token, TAB);

  const rows  = [];
  const BATCH = 3; /* smaller batch — each team needs 70+ boxscore calls */

  for (let i=0;i<TEAM_IDS.length;i+=BATCH) {
    const batch = TEAM_IDS.slice(i,i+BATCH);
    const results = await Promise.allSettled(batch.map(async teamId => {
      /* 1. Get schedule */
      const games = await getTeamGames(teamId);
      if (games.length < MIN_GAMES) return {teamId, rotation:null, reason:'too few games'};

      /* 2. Fetch boxscores in batches of 8 */
      const starterMap = new Map();
      const BSIZE = 8;
      for (let j=0;j<games.length;j+=BSIZE) {
        const bg = games.slice(j,j+BSIZE);
        const br = await Promise.allSettled(bg.map(g=>getGameStarter(g.gamePk,teamId).then(s=>({gamePk:g.gamePk,s}))));
        for (const r of br) if(r.status==='fulfilled'&&r.value.s) starterMap.set(r.value.gamePk,r.value.s);
      }

      /* 3. Compute rotation */
      const rotation = computeRotation(games, starterMap, teamId);
      return {teamId, rotation};
    }));

    for (const r of results) {
      if (r.status!=='fulfilled') continue;
      const {teamId,rotation} = r.value;
      const t1   = rotation?.top1;
      const t2   = rotation?.top2;
      const duo  = rotation?.duo;
      const rest = rotation?.rest;
      rows.push([
        dateStr, teamId,
        TEAM_NAMES[teamId]||'Unknown',
        TEAM_SLUGS[teamId]||'',
        t1?.name||'', t1?.starts||0, t1?.wins||0, t1?.losses||0, t1?.pace||0, t1?.rs||0, t1?.ra||0, t1?.diff||0,
        t2?.name||'', t2?.starts||0, t2?.wins||0, t2?.losses||0, t2?.pace||0, t2?.rs||0, t2?.ra||0, t2?.diff||0,
        duo?.wins||0, duo?.losses||0, duo?.pace||0, duo?.rs||0, duo?.ra||0, duo?.diff||0,
        rest?.wins||0, rest?.losses||0, rest?.pace||0, rest?.rs||0, rest?.ra||0, rest?.diff||0,
        rotation?.rotationGap||0, rotation?.label||'Staff in Flux',
        rotation?.qualified?1:0, rotation?.gamesAnalyzed||0,
      ]);
    }
    console.log(`[pitching-board] Processed batch ${i/BATCH+1}`);
  }

  await clearDateRows(sheetId, token, TAB, dateStr);
  const result = await appendRows(sheetId, token, TAB, rows);

  return new Response(JSON.stringify({ok:true, date:dateStr, teamsWritten:rows.length, result}), {
    headers:{'Content-Type':'application/json'},
  });
}
