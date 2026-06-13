/**
 * TRACK THE SEASON — Pulse Data API
 * /api/pulse-data?date=YYYY-MM-DD
 *
 * Returns the stored snapshot for a given date as JSON.
 * Also returns the previous day's snapshot if available,
 * so the caller can compute deltas.
 *
 * Response shape:
 * {
 *   date: "2026-06-12",
 *   prevDate: "2026-06-11" | null,
 *   snapshot: [ { teamId, teamName, wins, losses, gp, projWins, delta, l10W, l10L, chaosFlag, winPct }, ... ],
 *   prevSnapshot: [ ... ] | null,
 *   hasPrev: boolean,
 *   availableDates: ["2026-06-12", "2026-06-11", ...],  // all dates in sheet, newest first
 * }
 *
 * If date is not found: returns { found: false, availableDates: [...] }
 */

export const config = { runtime: 'edge' };

const SHEET_COLS = {
  date: 0, teamId: 1, teamName: 2, wins: 3, losses: 4, gp: 5,
  projWins: 6, delta: 7, l10W: 8, l10L: 9, chaosFlag: 10, winPct: 11,
};

function parseRow(row) {
  const get = (col, fallback = null) => {
    const v = row[SHEET_COLS[col]];
    return v !== undefined && v !== '' ? v : fallback;
  };
  const num = (col, fb = null) => {
    const v = get(col, fb);
    return v !== null ? Number(v) : null;
  };
  return {
    teamId:    num('teamId'),
    teamName:  get('teamName', ''),
    wins:      num('wins', 0),
    losses:    num('losses', 0),
    gp:        num('gp', 0),
    projWins:  num('projWins'),
    delta:     num('delta'),
    l10W:      num('l10W', 0),
    l10L:      num('l10L', 0),
    chaosFlag: num('chaosFlag', 0),
    winPct:    num('winPct'),
  };
}

/* Fetch all rows from the Snapshots tab via public CSV export
   (same pattern as the main Google Sheet used by the site)     */
async function fetchAllRows(sheetId) {
  /* Use the publish-to-web CSV URL — no auth needed if sheet is published */
  const csvUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&sheet=Snapshots`;
  const res = await fetch(csvUrl, { headers: { 'Accept': 'text/csv' } });
  if (!res.ok) throw new Error(`Sheet fetch failed: ${res.status}`);
  const text = await res.text();
  return parseCSV(text);
}

function parseCSV(text) {
  const lines = text.trim().split('\n');
  return lines.map(line => {
    /* Handle quoted fields with commas */
    const cols = [];
    let cur = '', inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') { inQ = !inQ; continue; }
      if (ch === ',' && !inQ) { cols.push(cur.trim()); cur = ''; continue; }
      cur += ch;
    }
    cols.push(cur.trim());
    return cols;
  });
}

function prevDateStr(dateStr) {
  const d = new Date(dateStr + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

export default async function handler(req) {
  const url    = new URL(req.url);
  const date   = url.searchParams.get('date'); // YYYY-MM-DD, or null for latest
  const sheetId = process.env.GOOGLE_SHEET_ID;

  if (!sheetId) {
    return json({ error: 'GOOGLE_SHEET_ID env var not set' }, 500);
  }

  /* Fetch all rows */
  let allRows;
  try {
    allRows = await fetchAllRows(sheetId);
  } catch (e) {
    return json({ error: e.message }, 500);
  }

  /* Skip header row */
  const dataRows = allRows.slice(1).filter(r => r[0] && r[0] !== 'date');

  /* Get all unique dates, newest first */
  const dateSet = new Set();
  for (const row of dataRows) {
    if (row[SHEET_COLS.date]) dateSet.add(row[SHEET_COLS.date]);
  }
  const availableDates = [...dateSet].sort().reverse();

  if (!availableDates.length) {
    return json({ found: false, availableDates: [], message: 'No snapshots stored yet.' });
  }

  /* Resolve date: use requested date or latest available */
  const targetDate = date || availableDates[0];

  /* Find rows for target date */
  const targetRows = dataRows.filter(r => r[SHEET_COLS.date] === targetDate);
  if (!targetRows.length) {
    return json({ found: false, date: targetDate, availableDates, message: `No snapshot found for ${targetDate}.` });
  }

  const snapshot = targetRows.map(parseRow);

  /* Find previous day's snapshot */
  const prev   = prevDateStr(targetDate);
  const prevRows = dataRows.filter(r => r[SHEET_COLS.date] === prev);
  const hasPrev  = prevRows.length > 0;
  const prevSnapshot = hasPrev ? prevRows.map(parseRow) : null;

  return json({
    found: true,
    date: targetDate,
    prevDate: hasPrev ? prev : null,
    snapshot,
    prevSnapshot,
    hasPrev,
    availableDates,
  });
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
