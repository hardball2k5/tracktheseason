/**
 * TRACK THE SEASON — Starter Signal
 * /api/pitcher-splits?teamId=143&season=2026
 *
 * Returns starter splits for a team: record, win%, pace, runs for/against
 * per starting pitcher for the current season AND since Opening Day last season.
 *
 * Cached 1 hour at Vercel CDN edge.
 * First load: 15-30s (fetches boxscore per game). Subsequent: instant.
 */

export const config = { runtime: 'edge' };

const MLB = 'https://statsapi.mlb.com/api/v1';
const SEASON_GAMES = 162;

/* ── Fetch helpers ─────────────────────────────────── */
async function fetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
  return res.json();
}

/* Get all final regular season games for a team in a given year */
async function getTeamGames(teamId, year) {
  const data = await fetchJSON(
    `${MLB}/schedule?sportId=1&teamId=${teamId}&season=${year}&gameTypes=R`
  );
  const games = [];
  for (const d of data.dates || []) {
    for (const g of d.games || []) {
      if (g.status?.abstractGameState !== 'Final') continue;
      games.push({
        gamePk:    g.gamePk,
        date:      d.date,
        homeTeamId: g.teams.home.team.id,
        awayTeamId: g.teams.away.team.id,
        homeScore:  g.teams.home.score,
        awayScore:  g.teams.away.score,
      });
    }
  }
  return games;
}

/* Get starting pitcher + run data from a boxscore */
async function getGameStarter(gamePk, teamId) {
  try {
    const data = await fetchJSON(`${MLB}/game/${gamePk}/boxscore`);
    const isHome = String(data.teams?.home?.team?.id) === String(teamId);
    const side   = isHome ? 'home' : 'away';
    const opp    = isHome ? 'away' : 'home';

    const pitchers = data.teams?.[side]?.pitchers || [];
    const allPitchers = data.teams?.[side]?.players || {};

    /* Starting pitcher = first pitcher listed */
    const starterPk = pitchers[0];
    if (!starterPk) return null;

    const starterData = allPitchers[`ID${starterPk}`];
    const starterName = starterData?.person?.fullName || 'Unknown';
    const starterId   = starterData?.person?.id || starterPk;

    const runsScored  = data.teams?.[side]?.teamStats?.batting?.runs ?? null;
    const runsAllowed = data.teams?.[opp]?.teamStats?.batting?.runs ?? null;

    return { starterId, starterName, runsScored, runsAllowed };
  } catch { return null; }
}

/* ── Compute splits from games + starter data ──────── */
function computeSplits(games, starterMap, teamId) {
  const pitchers = {}; /* starterId → { name, starts, wins, losses, runsScored, runsAllowed } */

  for (const g of games) {
    const s = starterMap.get(g.gamePk);
    if (!s) continue;

    const isHome = String(g.homeTeamId) === String(teamId);
    const teamScore = isHome ? g.homeScore : g.awayScore;
    const oppScore  = isHome ? g.awayScore : g.homeScore;
    const won = teamScore > oppScore;

    if (!pitchers[s.starterId]) {
      pitchers[s.starterId] = {
        id: s.starterId,
        name: s.starterName,
        starts: 0, wins: 0, losses: 0,
        runsScored: 0, runsAllowed: 0,
      };
    }
    const p = pitchers[s.starterId];
    p.starts++;
    won ? p.wins++ : p.losses++;
    if (s.runsScored  != null) p.runsScored  += s.runsScored;
    if (s.runsAllowed != null) p.runsAllowed += s.runsAllowed;
  }

  return Object.values(pitchers)
    .filter(p => p.starts >= 3)
    .map(p => ({
      ...p,
      winPct:       p.starts ? Math.round(p.wins / p.starts * 1000) / 1000 : 0,
      pace:         p.starts ? Math.round((p.wins / p.starts) * SEASON_GAMES) : 0,
      avgScored:    p.starts ? Math.round(p.runsScored  / p.starts * 10) / 10 : 0,
      avgAllowed:   p.starts ? Math.round(p.runsAllowed / p.starts * 10) / 10 : 0,
      runDiff:      p.runsScored - p.runsAllowed,
    }))
    .sort((a, b) => b.winPct - a.winPct || b.starts - a.starts);
}

function computeRest(allSplits, topIds) {
  const rest = { starts:0, wins:0, losses:0, runsScored:0, runsAllowed:0 };

  for (const p of allSplits) {
    if (topIds.has(p.id)) continue;
    rest.starts      += p.starts;
    rest.wins        += p.wins;
    rest.losses      += p.losses;
    rest.runsScored  += p.runsScored;
    rest.runsAllowed += p.runsAllowed;
  }

  rest.winPct     = rest.starts ? Math.round(rest.wins / rest.starts * 1000) / 1000 : 0;
  rest.pace       = rest.starts ? Math.round((rest.wins / rest.starts) * SEASON_GAMES) : 0;
  rest.avgScored  = rest.starts ? Math.round(rest.runsScored / rest.starts * 10) / 10 : 0;
  rest.avgAllowed = rest.starts ? Math.round(rest.runsAllowed / rest.starts * 10) / 10 : 0;
  rest.runDiff    = rest.runsScored - rest.runsAllowed;

  return rest;
}

/* ── Generate editorial narrative ──────────────────── */
function generateNarrative(teamName, splits, restSplits) {
  if (!splits.length) return null;
  const top = splits[0];
  const gap = top.pace - (restSplits.pace || 0);

  if (splits.length >= 2) {
    const duo = splits.slice(0, 2);
    const duoStarts = duo.reduce((s,p)=>s+p.starts,0);
    const duoWins   = duo.reduce((s,p)=>s+p.wins,0);
    const duoPace   = Math.round((duoWins/duoStarts)*SEASON_GAMES);
    const duoGap    = duoPace - (restSplits.pace||0);
    if (duoGap >= 30) {
      return `The ${teamName} become a ${duoPace}-win machine when ${duo[0].name.split(' ').pop()} or ${duo[1].name.split(' ').pop()} starts. Everyone else? They're playing ${restSplits.pace}-win baseball.`;
    }
  }

  if (gap >= 40) return `${top.name.split(' ').pop()} doesn't just start — he changes the ${teamName}'s entire season. A ${top.pace}-win pace when he's on the mound.`;
  if (gap >= 25) return `The ${teamName} are a different team when ${top.name.split(' ').pop()} starts. ${top.pace}-win pace in his starts, ${restSplits.pace}-win pace everyone else.`;
  if (gap >= 15) return `${top.name.split(' ').pop()} has the biggest Starter Signal on this staff — ${top.pace}-win pace in his starts.`;
  if (top.pace >= 100) return `When ${top.name.split(' ').pop()} starts, the ${teamName} are playing elite baseball. ${top.pace}-win pace, ${top.wins}–${top.losses} record.`;
  return `${top.name.split(' ').pop()} leads the ${teamName} staff with a ${top.pace}-win pace over ${top.starts} starts.`;
}

/* ── Main handler ──────────────────────────────────── */
export default async function handler(req) {
  const url    = new URL(req.url);
  const teamId = Number(url.searchParams.get('teamId'));
  const season = Number(url.searchParams.get('season')) || new Date().getFullYear();
  const prevSeason = season - 1;

  if (!teamId) {
    return response({ error: 'teamId required' }, 400);
  }

  try {
    /* Fetch current season games */
    const curGames = await getTeamGames(teamId, season);

    /* Fetch prior season games for "since Opening Day YYYY" view */
    const prevGames = await getTeamGames(teamId, prevSeason);
    const combinedGames = [...prevGames, ...curGames];

    /* Get team name from schedule data */
    let teamName = 'Team';
    if (curGames.length) {
      const sampleGame = curGames[0];
      const isHome = String(sampleGame.homeTeamId) === String(teamId);
      /* Fetch once to get name */
      try {
        const td = await fetchJSON(`${MLB}/teams/${teamId}`);
        teamName = td.teams?.[0]?.clubName || td.teams?.[0]?.name || 'Team';
      } catch { /* ignore */ }
    }

    /* Fetch boxscores in parallel batches of 8 */
    const BATCH = 8;
    const curMap  = new Map();
    const prevMap = new Map();

    async function fetchBatch(games, map) {
      for (let i = 0; i < games.length; i += BATCH) {
        const batch = games.slice(i, i + BATCH);
        const results = await Promise.allSettled(
          batch.map(g => getGameStarter(g.gamePk, teamId).then(s => ({ gamePk: g.gamePk, s })))
        );
        for (const r of results) {
          if (r.status === 'fulfilled' && r.value.s) {
            map.set(r.value.gamePk, r.value.s);
          }
        }
      }
    }

    /* Fetch current and prior season boxscores in parallel */
    await Promise.all([
      fetchBatch(curGames,  curMap),
      fetchBatch(prevGames, prevMap),
    ]);

    /* Build combined map for "since opening day last season" */
    const combinedMap = new Map([...prevMap, ...curMap]);

    /* Compute splits */
    const curSplits  = computeSplits(curGames,      curMap,      teamId);
    const prevSplits = computeSplits(combinedGames, combinedMap, teamId);

    /* Top 2 ace IDs for "everyone else" calc */
    const top2Ids = new Set(curSplits.slice(0, 2).map(p => p.id));
    const restSplits = computeRest(curSplits, top2Ids);

    /* Duo combined stats */
    let duoStats = null;
    if (curSplits.length >= 2) {
      const duo = curSplits.slice(0, 2);
      const dStarts = duo.reduce((s,p)=>s+p.starts,0);
      const dWins   = duo.reduce((s,p)=>s+p.wins,0);
      const dLosses = duo.reduce((s,p)=>s+p.losses,0);
      const dRS     = duo.reduce((s,p)=>s+p.avgScored*p.starts,0);
      const dRA     = duo.reduce((s,p)=>s+p.avgAllowed*p.starts,0);
      duoStats = {
        names:      `${duo[0].name} + ${duo[1].name}`,
        starts:     dStarts,
        wins:       dWins,
        losses:     dLosses,
        winPct:     dStarts ? Math.round(dWins/dStarts*1000)/1000 : 0,
        pace:       dStarts ? Math.round((dWins/dStarts)*SEASON_GAMES) : 0,
        runDiff:    Math.round(dRS - dRA),
      };
    }

    const narrative = generateNarrative(teamName, curSplits, restSplits);

    return response({
      teamId, teamName, season,
      splits:    curSplits.slice(0, 5),    /* top 5 current season */
      prevSplits: prevSplits.slice(0, 5),  /* top 5 since last Opening Day */
      duo:       duoStats,
      rest:      restSplits,
      narrative,
      gamesAnalyzed: curGames.length,
    });

  } catch (err) {
    return response({ error: err.message }, 500);
  }
}

function response(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type':  'application/json',
      'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=7200',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
