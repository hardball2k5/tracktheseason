/**
 * TRACK THE SEASON — Daily Snapshot
 * /api/snapshot
 *
 * Vercel Cron: fires daily at 11pm ET (03:00 UTC next day)
 * Schedule in vercel.json: "0 3 * * *"
 *
 * What it does:
 *   1. Fetches current record for all 30 MLB teams from MLB Stats API
 *   2. Fetches same-GP record from last season for delta
 *   3. Appends a row per team to a Google Sheet
 *   4. Row format: date | teamId | teamName | wins | losses | gp | projWins | delta | l10W | l10L | chaosFlag
 *
 * Required environment variables (set in Vercel dashboard):
 *   GOOGLE_SHEET_ID          — The sheet ID from the URL (already used for CSV export)
 *   GOOGLE_SERVICE_EMAIL     — Service account email (e.g. tts-cron@project.iam.gserviceaccount.com)
 *   GOOGLE_SERVICE_PRIVATE_KEY — Service account private key (PEM format, with \n for newlines)
 *   CRON_SECRET              — Random secret to secure manual triggers
 *
 * Setup steps (one time):
 *   1. Go to console.cloud.google.com → Create project → Enable Google Sheets API
 *   2. Create a Service Account → Download JSON key
 *   3. Share your Google Sheet with the service account email (Editor role)
 *   4. Add GOOGLE_SERVICE_EMAIL and GOOGLE_SERVICE_PRIVATE_KEY to Vercel env vars
 *   5. Add GOOGLE_SHEET_ID (from sheet URL: docs.google.com/spreadsheets/d/{ID}/...)
 *
 * Sheet structure (auto-created if "Snapshots" tab doesn't exist):
 *   A: date (YYYY-MM-DD)
 *   B: teamId
 *   C: teamName
 *   D: wins
 *   E: losses
 *   F: gp (games played)
 *   G: projWins (162-game pace)
 *   H: delta (vs same GP last season)
 *   I: l10W (last 10 wins)
 *   J: l10L (last 10 losses)
 *   K: chaosFlag (1 if |delta| >= 5)
 *   L: winPct
 */

export const config = { runtime: 'edge' };

const MLB_API      = 'https://statsapi.mlb.com/api/v1';
const SEASON_GAMES = 162;
const CHAOS_THRESHOLD = 5;
const CURRENT_YEAR = new Date().getFullYear();
const COMPARE_YEAR = CURRENT_YEAR - 1;

const TEAM_IDS = [
  108,109,110,111,112,113,114,115,116,117,118,119,120,121,
  133,134,135,136,137,138,139,140,141,142,143,144,145,146,147,158
];
const TEAM_NAMES = {
  108:'Angels',109:'Diamondbacks',110:'Orioles',111:'Red Sox',112:'Cubs',
  113:'Reds',114:'Guardians',115:'Rockies',116:'Tigers',117:'Astros',
  118:'Royals',119:'Dodgers',120:'Nationals',121:'Mets',133:'Athletics',
  134:'Pirates',135:'Padres',136:'Mariners',137:'Giants',138:'Cardinals',
  139:'Rays',140:'Rangers',141:'Blue Jays',142:'Twins',143:'Phillies',
  144:'Braves',145:'White Sox',146:'Marlins',147:'Yankees',158:'Brewers',
};

/* ── Helpers ─────────────────────────────────────────── */
const winPct = (w,l) => (w+l) ? w/(w+l) : 0;

async function fetchGames(teamId, year) {
  try {
    const res  = await fetch(
      `${MLB_API}/schedule?sportId=1&teamId=${teamId}&season=${year}&gameTypes=R`
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
    return games; // array of booleans
  } catch { return []; }
}

function computeStats(curGames, prevGames) {
  const gp   = curGames.length;
  const wins = curGames.filter(Boolean).length;
  const losses = gp - wins;
  const proj = gp > 0 ? Math.round(winPct(wins, losses) * SEASON_GAMES) : null;
  const l10   = curGames.slice(-10);
  const l10w  = l10.filter(Boolean).length;
  const l10l  = l10.length - l10w;

  let delta = null;
  if (prevGames.length >= gp && gp > 0) {
    const prevWins = prevGames.slice(0, gp).filter(Boolean).length;
    delta = wins - prevWins;
  }

  const chaosFlag = delta !== null && Math.abs(delta) >= CHAOS_THRESHOLD ? 1 : 0;
  const wPct = Math.round(winPct(wins, losses) * 1000) / 1000;

  return { gp, wins, losses, proj, l10w, l10l, delta, chaosFlag, wPct };
}

/* ── Google Sheets auth (JWT / service account) ──────── */
async function getAccessToken(serviceEmail, privateKeyPem) {
  const now   = Math.floor(Date.now() / 1000);
  const claim = {
    iss: serviceEmail,
    scope: 'https://www.googleapis.com/auth/spreadsheets',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  };

  /* Build JWT header.payload */
  const enc = (obj) => btoa(JSON.stringify(obj))
    .replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  const header  = enc({ alg:'RS256', typ:'JWT' });
  const payload = enc(claim);
  const sigInput = `${header}.${payload}`;

  /* Sign with RSA-SHA256 using WebCrypto */
  const pemBody = privateKeyPem
    .replace(/-----BEGIN PRIVATE KEY-----/,'')
    .replace(/-----END PRIVATE KEY-----/,'')
    .replace(/\s+/g,'');
  const keyDer  = Uint8Array.from(atob(pemBody), c => c.charCodeAt(0));
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8', keyDer,
    { name:'RSASSA-PKCS1-v1_5', hash:'SHA-256' },
    false, ['sign']
  );
  const sigBuf   = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5', cryptoKey,
    new TextEncoder().encode(sigInput)
  );
  const sig = btoa(String.fromCharCode(...new Uint8Array(sigBuf)))
    .replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');

  const jwt = `${sigInput}.${sig}`;

  /* Exchange JWT for access token */
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  });
  const tokenData = await tokenRes.json();
  if (!tokenData.access_token) throw new Error('Failed to get access token: ' + JSON.stringify(tokenData));
  return tokenData.access_token;
}

async function ensureSheetTab(sheetId, token) {
  /* Check if "Snapshots" tab exists — create it if not */
  const metaRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const meta = await metaRes.json();
  const exists = meta.sheets?.some(s => s.properties?.title === 'Snapshots');
  if (!exists) {
    await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}:batchUpdate`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requests: [{ addSheet: { properties: { title: 'Snapshots' } } }]
      })
    });
    /* Add header row */
    await appendRows(sheetId, token, [[
      'date','teamId','teamName','wins','losses','gp',
      'projWins','delta','l10W','l10L','chaosFlag','winPct'
    ]]);
  }
}

async function appendRows(sheetId, token, rows) {
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/Snapshots!A:L:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ values: rows }),
    }
  );
  return res.json();
}

async function deleteExistingDate(sheetId, token, dateStr) {
  /* Read all rows, find rows for this date, delete them.
     This prevents duplicate snapshots if the cron fires twice. */
  const readRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/Snapshots!A:A`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const readData = await readRes.json();
  const rows = readData.values || [];
  const toDelete = [];
  for (let i = rows.length - 1; i >= 1; i--) { // skip header
    if (rows[i][0] === dateStr) toDelete.push(i + 1); // 1-indexed
  }
  if (!toDelete.length) return;
  /* Delete in reverse order to preserve row indices */
  const requests = toDelete.map(rowIndex => ({
    deleteDimension: {
      range: {
        sheetId: 0, // will be fixed below
        dimension: 'ROWS',
        startIndex: rowIndex - 1,
        endIndex: rowIndex,
      }
    }
  }));
  /* Get actual sheetId for Snapshots tab */
  const metaRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const meta = await metaRes.json();
  const tabId = meta.sheets?.find(s=>s.properties?.title==='Snapshots')?.properties?.sheetId;
  if (tabId == null) return;
  requests.forEach(r => r.deleteDimension.range.sheetId = tabId);
  await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}:batchUpdate`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ requests }),
  });
}

/* ── Main handler ─────────────────────────────────────── */
export default async function handler(req) {
  /* Secure manual triggers */
  const url    = new URL(req.url);
  const secret = url.searchParams.get('secret');
  if (secret !== process.env.CRON_SECRET && req.headers.get('x-vercel-cron') !== '1') {
    return new Response('Unauthorized', { status: 401 });
  }

  const sheetId  = process.env.GOOGLE_SHEET_ID;
  const email    = process.env.GOOGLE_SERVICE_EMAIL;
  const privKey  = (process.env.GOOGLE_SERVICE_PRIVATE_KEY || '').replace(/\\n/g, '\n');

  if (!sheetId || !email || !privKey) {
    return new Response(JSON.stringify({
      error: 'Missing env vars: GOOGLE_SHEET_ID, GOOGLE_SERVICE_EMAIL, GOOGLE_SERVICE_PRIVATE_KEY'
    }), { status: 500, headers: {'Content-Type':'application/json'} });
  }

  /* Date for this snapshot (ET date — use EST offset) */
  const now = new Date();
  const etOffset = -5; // EST; cron fires at 3am UTC = 10pm ET
  const etNow = new Date(now.getTime() + etOffset * 3600 * 1000);
  const dateStr = etNow.toISOString().slice(0, 10); // YYYY-MM-DD

  console.log(`[snapshot] Starting snapshot for ${dateStr}`);

  /* Fetch all team data in batches of 6 */
  const BATCH = 6;
  const rows  = [];
  for (let i = 0; i < TEAM_IDS.length; i += BATCH) {
    const batch = TEAM_IDS.slice(i, i + BATCH);
    const results = await Promise.allSettled(batch.map(async id => {
      const [cur, prev] = await Promise.all([
        fetchGames(id, CURRENT_YEAR),
        fetchGames(id, COMPARE_YEAR),
      ]);
      return { id, cur, prev };
    }));
    for (const r of results) {
      if (r.status !== 'fulfilled') continue;
      const { id, cur, prev } = r.value;
      if (cur.length < 5) continue; // skip teams with too few games
      const stats = computeStats(cur, prev);
      rows.push([
        dateStr,
        id,
        TEAM_NAMES[id] || 'Unknown',
        stats.wins,
        stats.losses,
        stats.gp,
        stats.proj ?? '',
        stats.delta ?? '',
        stats.l10w,
        stats.l10l,
        stats.chaosFlag,
        stats.wPct,
      ]);
    }
  }

  console.log(`[snapshot] Fetched ${rows.length} teams`);

  /* Write to Google Sheets */
  const token = await getAccessToken(email, privKey);
  await ensureSheetTab(sheetId, token);
  await deleteExistingDate(sheetId, token, dateStr); // idempotent
  const result = await appendRows(sheetId, token, rows);

  console.log(`[snapshot] Written ${rows.length} rows for ${dateStr}`);

  return new Response(JSON.stringify({
    ok: true,
    date: dateStr,
    teamsWritten: rows.length,
    result,
  }), { headers: { 'Content-Type': 'application/json' } });
}
