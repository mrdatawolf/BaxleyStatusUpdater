'use strict';
const fs = require('fs');
const path = require('path');

let Database;
try {
  Database = require('better-sqlite3');
} catch {
  Database = null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function msToHours(ms) {
  return ms / 3_600_000;
}

// Green Tally doesn't run on Saturday or Sunday, and Monday's data isn't
// loaded into the DB until Tuesday's run — so none of that span should
// count toward staleness. Sun=0, Mon=1, Sat=6 per Date#getDay().
function isGraceDay(date) {
  const day = date.getDay();
  return day === 0 || day === 1 || day === 6;
}

/**
 * Hours elapsed between `from` and `to`, excluding any time that falls on
 * a grace day (Sat/Sun/Mon). Equivalent to a straight hour difference for
 * spans that never touch a grace day, so normal weekday-to-weekday
 * staleness checks are unaffected.
 */
function businessHoursElapsed(from, to) {
  if (!from) return Infinity;
  let cursor = new Date(from);
  let hours = 0;
  while (cursor < to) {
    const nextMidnight = new Date(cursor);
    nextMidnight.setHours(24, 0, 0, 0);
    const segmentEnd = nextMidnight < to ? nextMidnight : to;
    if (!isGraceDay(cursor)) hours += msToHours(segmentEnd - cursor);
    cursor = segmentEnd;
  }
  return hours;
}

/**
 * Walk a directory tree (non-recursive by default) and return the most recent
 * mtime among files matching the optional extension list.
 */
function mostRecentMtime(dirPath, extensions = null, recursive = false) {
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    let latest = null;

    for (const entry of entries) {
      const full = path.join(dirPath, entry.name);

      if (entry.isDirectory() && recursive) {
        const sub = mostRecentMtime(full, extensions, true);
        if (sub && (!latest || sub > latest)) latest = sub;
        continue;
      }

      if (!entry.isFile()) continue;
      if (extensions && !extensions.includes(path.extname(entry.name).toLowerCase())) continue;

      const { mtimeMs } = fs.statSync(full);
      if (!latest || mtimeMs > latest) latest = mtimeMs;
    }

    return latest;
  } catch {
    return null;
  }
}

/**
 * Scan the New\ folder, which contains subfolders named "MM.DD.YY Shift".
 * Returns the mtime of the most recent CSV inside any subfolder.
 */
function mostRecentCsvInNew(csvNewPath) {
  return mostRecentMtime(csvNewPath, ['.csv'], true);
}

/**
 * Parse the most recent log file for today's activity and error messages.
 * Log files are named YYYY-MM-DD.log (based on the ETL logging convention).
 */
function readTodayLog(logPath) {
  try {
    const today = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const logName = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}.log`;
    const logFile = path.join(logPath, logName);

    if (!fs.existsSync(logFile)) return { hasActivity: false, hasErrors: false, lastError: null };

    const lines = fs.readFileSync(logFile, 'utf8').split('\n').filter(Boolean);
    const errorLines = lines.filter((l) => l.includes('[ERROR]'));
    const hasSuccess = lines.some((l) => l.includes('[SUCCESS]'));

    return {
      hasActivity: lines.length > 0,
      hasErrors: errorLines.length > 0,
      hasSuccess,
      lastError: errorLines.length > 0 ? errorLines[errorLines.length - 1].trim() : null,
    };
  } catch {
    return { hasActivity: false, hasErrors: false, hasSuccess: false, lastError: null };
  }
}

// ─── Main check ───────────────────────────────────────────────────────────────

/**
 * Run a full pipeline health check and return a status object:
 *
 *   { status, stage, detail, lastSuccess, checkedAt }
 *
 * status : 'green' | 'yellow' | 'red'
 * stage  : null | 'process' | 'load'   (which step failed when yellow/red)
 * detail : human-readable explanation
 * lastSuccess : ISO string of the most recent ToDate in the DB, or null
 * checkedAt   : ISO string of now
 */
function runCheck(config) {
  const now = new Date();
  const checkedAt = now.toISOString();

  // ── 1. Query the database ─────────────────────────────────────────────────
  let latestDate = null;
  let dbError = null;

  if (!config.dbPath) {
    dbError = 'DB_PATH is not configured';
  } else if (!Database) {
    dbError = 'better-sqlite3 module not available';
  } else {
    try {
      const db = new Database(config.dbPath, { readonly: true, fileMustExist: true });
      // BusinessDate is YYYY-MM-DD — sorts correctly as text, safe for MAX().
      const row = db.prepare("SELECT MAX(BusinessDate) AS latest FROM GreenTally").get();
      db.close();
      // Append T00:00:00 so the YYYY-MM-DD string is parsed as local midnight,
      // not UTC midnight (which drifts by the server's UTC offset).
      if (row && row.latest) latestDate = new Date(`${row.latest}T00:00:00`);
    } catch (err) {
      dbError = err.message;
    }
  }

  const lastSuccess = latestDate ? latestDate.toISOString() : null;
  // BusinessDate represents data through end of that day, so measure staleness
  // from midnight of the *next* day (i.e. end-of-business-day), not from midnight
  // of the date itself.  Without this, a May 26 BusinessDate loaded at 1 AM on
  // May 27 would read as ~25h stale by evening even though it's the current day's data.
  const latestEndOfDay = latestDate ? new Date(latestDate.getTime() + 86_400_000) : null;
  // Weekend/Monday gaps don't count toward staleness — see businessHoursElapsed.
  const hoursStale = latestEndOfDay ? businessHoursElapsed(latestEndOfDay, now) : Infinity;

  // ── 2. Green — DB is current ──────────────────────────────────────────────
  if (!dbError && hoursStale <= config.greenThresholdHours) {
    return {
      status: 'green',
      stage: null,
      detail: `Database is current. Most recent data: ${latestDate.toLocaleDateString()}.`,
      lastSuccess,
      checkedAt,
    };
  }

  // DB is stale (or unreachable) — work backwards through the pipeline

  // ── 3. Check for Excel output (means process step ran but load failed) ────
  const excelMtime = Math.max(
    mostRecentMtime(config.excelBasePath, ['.xlsx', '.xls']) || 0,
    mostRecentMtime(config.excelTotalPath, ['.xlsx', '.xls']) || 0,
    mostRecentMtime(config.excelFinalPath, ['.xlsx', '.xls']) || 0,
  );
  const excelHoursAgo = excelMtime ? msToHours(now - excelMtime) : Infinity;

  if (excelHoursAgo <= config.greenThresholdHours) {
    const msg = dbError
      ? `Cannot open database (${dbError}) but Excel output exists — DB may be locked or path is wrong.`
      : `Excel output found (${Math.round(excelHoursAgo)}h ago) but database was not updated. The ETL load step may have failed.`;
    return {
      status: 'yellow',
      stage: 'load',
      detail: msg,
      lastSuccess,
      checkedAt,
    };
  }

  // ── 4. Check for CSV files (means scraping worked but process step failed) ─
  const csvMtime = Math.max(
    mostRecentCsvInNew(config.csvNewPath) || 0,
    mostRecentMtime(config.csvFinishedPath, ['.csv'], true) || 0,
  );
  const csvHoursAgo = csvMtime ? msToHours(now - csvMtime) : Infinity;

  if (csvHoursAgo <= config.greenThresholdHours) {
    return {
      status: 'yellow',
      stage: 'process',
      detail: `CSV data found (${Math.round(csvHoursAgo)}h ago) but no Excel output was produced. The CSV processing step may have failed.`,
      lastSuccess,
      checkedAt,
    };
  }

  // ── 5. Check today's log for any activity ─────────────────────────────────
  const log = readTodayLog(config.logPath);

  if (log.hasActivity && log.hasErrors) {
    return {
      status: 'yellow',
      stage: 'process',
      detail: `Pipeline ran today but logged errors. Last error: ${log.lastError || 'see log file'}`,
      lastSuccess,
      checkedAt,
    };
  }

  // ── 6. Nothing found — RED ────────────────────────────────────────────────
  const staleMsg = latestDate
    ? `Last database update was ${Math.round(hoursStale)}h ago.`
    : 'No data found in database.';

  return {
    status: 'red',
    stage: 'scrape',
    detail: `${staleMsg} No CSV files, Excel output, or log activity detected. Data may not have been delivered to the server.`,
    lastSuccess,
    checkedAt,
  };
}

module.exports = { runCheck };
