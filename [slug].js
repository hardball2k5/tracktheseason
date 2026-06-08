/**
 * TRACK THE SEASON — Team Share Card Generator
 * /api/card/[slug].js
 *
 * Returns a 1200×630 PNG social share card for each team.
 * Usage: https://tracktheseason.com/api/card/phillies
 *        https://tracktheseason.com/api/card/braves?season=2026
 *
 * Uses @vercel/og (free, built into Vercel) — no extra dependencies needed.
 * Fetches live MLB data so the card always shows current stats.
 *
 * Vercel automatically handles caching via CDN edge cache.
 * Cache-Control header set to 1 hour so cards stay fresh.
 */

import { ImageResponse } from '@vercel/og';

export const config = { runtime: 'edge' };

/* ── Team slug → MLB team ID ─────────────────────── */
const TEAM_SLUGS = {
  'angels':108,'diamondbacks':109,'orioles':110,'red-sox':111,
  'cubs':112,'reds':113,'guardians':114,'rockies':115,'tigers':116,
  'astros':117,'royals':118,'dodgers':119,'nationals':120,'mets':121,
  'athletics':133,'pirates':134,'padres':135,'mariners':136,'giants':137,
  'cardinals':138,'rays':139,'rangers':140,'blue-jays':141,'twins':142,
  'phillies':143,'braves':144,'white-sox':145,'marlins':146,'yankees':147,
  'brewers':158,
};

/* ── Team ID → full name ─────────────────────────── */
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

const MLB_API    = 'https://statsapi.mlb.com/api/v1';
const SEASON_GAMES = 162;
const CURRENT_YEAR = new Date().getFullYear();

/* ── Data helpers ────────────────────────────────── */
async function loadSchedule(teamId, year) {
  const url = `${MLB_API}/schedule?sportId=1&teamId=${teamId}&season=${year}&gameTypes=R`;
  const res  = await fetch(url);
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

function calcStats(curGames, prevGames) {
  const gp = curGames.length;
  const w  = curGames.filter(g => g.win).length;
  const l  = gp - w;
  const proj = gp ? Math.round((w / gp) * SEASON_GAMES) : null;

  /* Last 10 */
  const l10  = curGames.slice(-10);
  const l10w = l10.filter(g => g.win).length;
  const l10l = l10.length - l10w;

  /* Delta vs prior year at same GP */
  let delta = null;
  if (gp > 0 && prevGames.length >= gp) {
    const prevW = prevGames.slice(0, gp).filter(g => g.win).length;
    delta = w - prevW;
  }

  return { w, l, gp, proj, l10w, l10l, delta };
}

/* ── Card design tokens ──────────────────────────── */
const INK      = '#0f1014';
const INK2     = '#1a1d24';
const INK3     = '#252830';
const SIGNAL   = '#1aff6b';
const GAIN     = '#4ecb77';
const LOSS     = '#f47570';
const CHALK    = '#8a8a82';
const WHITE    = '#e8edf8';
const MONO     = '"IBM Plex Mono", monospace';

/* ── Main handler ────────────────────────────────── */
export default async function handler(req) {
  const url    = new URL(req.url);
  const slug   = url.pathname.split('/').pop().replace(/\.png$/, '').toLowerCase();
  const season = Number(url.searchParams.get('season')) || CURRENT_YEAR;

  const teamId = TEAM_SLUGS[slug];
  if (!teamId) {
    return new Response('Team not found', { status: 404 });
  }

  const teamName   = TEAM_NAMES[teamId] || 'MLB Team';
  const clubName   = teamName.split(' ').pop(); /* "Phillies", "Braves", etc. */
  const logoUrl    = `https://www.mlbstatic.com/team-logos/${teamId}.svg`;
  const compareYear= season - 1;

  /* Fetch live data — both seasons in parallel */
  let stats = { w:0, l:0, gp:0, proj:null, l10w:0, l10l:0, delta:null };
  try {
    const [curGames, prevGames] = await Promise.all([
      loadSchedule(teamId, season),
      loadSchedule(teamId, compareYear),
    ]);
    stats = calcStats(curGames, prevGames);
  } catch (e) {
    console.error('Card data fetch failed:', e.message);
  }

  const { w, l, gp, proj, l10w, l10l, delta } = stats;
  const record   = gp > 0 ? `${w}–${l}` : '—';
  const paceStr  = proj ? `${proj}W pace` : '—';
  const l10Str   = gp >= 10 ? `${l10w}–${l10l} L10` : '—';
  const deltaStr = delta !== null
    ? `${delta >= 0 ? '+' : ''}${delta}W vs ${compareYear}`
    : '—';
  const deltaColor = delta > 0 ? GAIN : delta < 0 ? LOSS : CHALK;

  /* ── SVG-based card rendered by @vercel/og ──────── */
  return new ImageResponse(
    <div
      style={{
        width: '1200px',
        height: '630px',
        background: INK,
        display: 'flex',
        flexDirection: 'column',
        fontFamily: MONO,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Background glow */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: '320px',
        background: `radial-gradient(ellipse 80% 60% at 50% -10%, rgba(26,255,107,0.08) 0%, transparent 70%)`,
        display: 'flex',
      }}/>

      {/* Top border accent */}
      <div style={{ height: '3px', background: SIGNAL, display: 'flex' }}/>

      {/* Main content */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '48px 56px' }}>

        {/* Header row — TTS brand + team logo */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '40px' }}>

          {/* TTS monogram + wordmark */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              width: '40px', height: '40px',
              background: SIGNAL, borderRadius: '8px',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontWeight: 700, fontSize: '14px', color: INK,
            }}>TTS</div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <div style={{ fontSize: '13px', fontWeight: 700, color: WHITE, letterSpacing: '0.05em' }}>
                TRACK THE <span style={{ color: SIGNAL }}>SEASON</span>
              </div>
              <div style={{ fontSize: '11px', color: CHALK, letterSpacing: '0.1em', marginTop: '2px' }}>
                tracktheseason.com
              </div>
            </div>
          </div>

          {/* Team logo */}
          <div style={{
            width: '80px', height: '80px',
            background: '#ffffff', borderRadius: '12px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
          }}>
            <img src={logoUrl} width={62} height={62} style={{ objectFit: 'contain' }}/>
          </div>
        </div>

        {/* Team name */}
        <div style={{
          fontSize: '52px', fontWeight: 700, color: WHITE,
          letterSpacing: '-0.03em', lineHeight: 1, marginBottom: '8px',
          display: 'flex',
        }}>
          {teamName}
        </div>

        {/* Season label */}
        <div style={{
          fontSize: '13px', fontWeight: 600, color: CHALK,
          letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: '36px',
          display: 'flex',
        }}>
          {season} Season · {gp} games played
        </div>

        {/* Stats row */}
        <div style={{
          display: 'flex', gap: '16px', alignItems: 'stretch',
        }}>
          {/* Record */}
          <div style={{
            flex: 1, background: INK2,
            border: `1px solid rgba(255,255,255,0.07)`,
            borderRadius: '12px', padding: '20px 22px',
            display: 'flex', flexDirection: 'column', gap: '6px',
          }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: CHALK, letterSpacing: '0.1em', textTransform: 'uppercase', display: 'flex' }}>Record</div>
            <div style={{ fontSize: '38px', fontWeight: 700, color: SIGNAL, letterSpacing: '-0.02em', lineHeight: 1, display: 'flex' }}>{record}</div>
            <div style={{ fontSize: '12px', color: CHALK, display: 'flex' }}>{gp} GP</div>
          </div>

          {/* Pace */}
          <div style={{
            flex: 1, background: INK2,
            border: `1px solid rgba(255,255,255,0.07)`,
            borderRadius: '12px', padding: '20px 22px',
            display: 'flex', flexDirection: 'column', gap: '6px',
          }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: CHALK, letterSpacing: '0.1em', textTransform: 'uppercase', display: 'flex' }}>Win Pace</div>
            <div style={{ fontSize: '38px', fontWeight: 700, color: WHITE, letterSpacing: '-0.02em', lineHeight: 1, display: 'flex' }}>{paceStr}</div>
            <div style={{ fontSize: '12px', color: CHALK, display: 'flex' }}>projected</div>
          </div>

          {/* Last 10 */}
          <div style={{
            flex: 1, background: INK2,
            border: `1px solid rgba(255,255,255,0.07)`,
            borderRadius: '12px', padding: '20px 22px',
            display: 'flex', flexDirection: 'column', gap: '6px',
          }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: CHALK, letterSpacing: '0.1em', textTransform: 'uppercase', display: 'flex' }}>Last 10</div>
            <div style={{ fontSize: '38px', fontWeight: 700, color: l10w >= 7 ? GAIN : l10w <= 3 ? LOSS : WHITE, letterSpacing: '-0.02em', lineHeight: 1, display: 'flex' }}>
              {l10Str.replace(' L10', '')}
            </div>
            <div style={{ fontSize: '12px', color: CHALK, display: 'flex' }}>last 10 games</div>
          </div>

          {/* vs prior year */}
          <div style={{
            flex: 1, background: INK2,
            border: `1px solid rgba(255,255,255,0.07)`,
            borderRadius: '12px', padding: '20px 22px',
            display: 'flex', flexDirection: 'column', gap: '6px',
          }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: CHALK, letterSpacing: '0.1em', textTransform: 'uppercase', display: 'flex' }}>vs {compareYear}</div>
            <div style={{ fontSize: '38px', fontWeight: 700, color: deltaColor, letterSpacing: '-0.02em', lineHeight: 1, display: 'flex' }}>
              {delta !== null ? (delta >= 0 ? `+${delta}W` : `${delta}W`) : '—'}
            </div>
            <div style={{ fontSize: '12px', color: CHALK, display: 'flex' }}>pace difference</div>
          </div>
        </div>

      </div>

      {/* Bottom bar */}
      <div style={{
        height: '44px', background: INK2,
        borderTop: `1px solid rgba(255,255,255,0.06)`,
        display: 'flex', alignItems: 'center',
        padding: '0 56px', justifyContent: 'space-between',
      }}>
        <div style={{ fontSize: '11px', color: CHALK, letterSpacing: '0.08em', display: 'flex' }}>
          tracktheseason.com/{slug}
        </div>
        <div style={{ fontSize: '11px', color: CHALK, letterSpacing: '0.06em', display: 'flex' }}>
          Every team · Every game · All season
        </div>
      </div>
    </div>,
    {
      width: 1200,
      height: 630,
      headers: {
        'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
      },
    }
  );
}
