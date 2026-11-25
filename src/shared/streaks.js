// Daily focus history for the streak and the weekly chart. stats.days holds one entry per
// local calendar day, { "2026-11-25": { sessions, minutes } }: finished sessions and focused
// minutes. Loaded by the background script (importScripts) and the popup, and by the tests.
// Needs shared/constants.js loaded first, for HISTORY_DAYS.

const pad2 = (n) => String(n).padStart(2, "0");

// "2026-11-25": the local calendar day a time falls on
function dayKey(time) {
  const d = new Date(time);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

// The day `n` days after (or before, if negative) a day key. Works at noon, so a
// daylight saving change around midnight can't move it to the wrong day.
function addDays(key, n) {
  const [y, m, d] = key.split("-").map(Number);
  return dayKey(new Date(y, m - 1, d + n, 12).getTime());
}

// Add a session to the history on the day it ended. Only finished sessions count toward
// the streak; minutes count either way, like the focused minutes total. Days older than
// HISTORY_DAYS are dropped, so the history stays small.
function recordSession(days, endedAt, minutes, finished) {
  const key = dayKey(endedAt);
  const day = { sessions: 0, minutes: 0, ...days?.[key] };
  day.minutes += minutes;
  if (finished) day.sessions += 1;
  const oldest = addDays(key, -(HISTORY_DAYS - 1));
  const kept = Object.entries({ ...days, [key]: day }).filter(([k]) => k >= oldest);
  return Object.fromEntries(kept.sort(([a], [b]) => (a < b ? -1 : 1)));
}

// Days in a row with at least one finished session, ending today. A streak stays alive
// until the end of the day after its last day, so a morning without a session yet
// doesn't break it.
function currentStreak(days, now) {
  const has = (key) => (days?.[key]?.sessions || 0) > 0;
  let key = dayKey(now);
  if (!has(key)) key = addDays(key, -1);
  let count = 0;
  while (has(key)) { count += 1; key = addDays(key, -1); }
  return count;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const dateOf = (key) => { const [y, m, d] = key.split("-").map(Number); return new Date(y, m - 1, d, 12); };

// 7 days, oldest first: the last 7 days ending today, or `weeksBack` weeks before that.
// [{ key, day: "Mon", minutes, sessions, today }]
function weekOf(days, now, weeksBack = 0) {
  const today = dayKey(now);
  const end = addDays(today, -7 * weeksBack);
  return Array.from({ length: 7 }, (_, i) => {
    const key = addDays(end, i - 6);
    const { minutes = 0, sessions = 0 } = days?.[key] || {};
    return { key, day: WEEKDAYS[dateOf(key).getDay()], minutes, sessions, today: key === today };
  });
}

// The last 7 days, ending today
const lastWeek = (days, now) => weekOf(days, now, 0);

// Whether the history has any focus before that week, so there's an earlier week to show
function hasEarlierWeek(days, now, weeksBack) {
  const start = addDays(dayKey(now), -7 * weeksBack - 6);
  return Object.entries(days || {}).some(([key, d]) => key < start && (d.minutes > 0 || d.sessions > 0));
}

// "45m", "1h", "1h 20m"
function durationText(minutes) {
  const h = Math.floor(minutes / 60), m = minutes % 60;
  return h ? (m ? `${h}h ${m}m` : `${h}h`) : `${m}m`;
}

// "12-18 Nov", "28 Oct - 3 Nov", "29 Dec 2026 - 4 Jan 2027" (with en dashes)
function weekRangeText(week) {
  const a = dateOf(week[0].key), b = dateOf(week[6].key);
  const dm = (d) => `${d.getDate()} ${MONTHS[d.getMonth()]}`;
  if (a.getFullYear() !== b.getFullYear()) return `${dm(a)} ${a.getFullYear()} – ${dm(b)} ${b.getFullYear()}`;
  if (a.getMonth() !== b.getMonth()) return `${dm(a)} – ${dm(b)}`;
  return `${a.getDate()}–${dm(b)}`;
}
