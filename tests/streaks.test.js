// Tests for src/shared/streaks.js: the daily history behind the streak and the weekly chart.
// Plain Node 22+, no installs:  node --test
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const read = (f) => fs.readFileSync(path.join(__dirname, "..", f), "utf8");
const context = vm.createContext({ Date });
vm.runInContext(read("src/shared/constants.js"), context);
vm.runInContext(read("src/shared/streaks.js"), context);
const get = (name) => vm.runInContext(name, context);
const plain = (fn) => (...a) => structuredClone(fn(...a));
const dayKey = get("dayKey"), addDays = get("addDays");
const recordSession = plain(get("recordSession")), lastWeek = plain(get("lastWeek")), currentStreak = get("currentStreak");
const HISTORY_DAYS = get("HISTORY_DAYS");

// A local time on a given day, so the tests don't depend on the computer's time zone
const at = (key, hour = 15) => { const [y, m, d] = key.split("-").map(Number); return new Date(y, m - 1, d, hour).getTime(); };
const finished = (key) => ({ [key]: { sessions: 1, minutes: 25 } });

test("day keys are local calendar days", () => {
  assert.equal(dayKey(at("2026-11-25", 0)), "2026-11-25");
  assert.equal(dayKey(at("2026-11-25", 23)), "2026-11-25");
  assert.equal(dayKey(new Date(2026, 0, 5, 9).getTime()), "2026-01-05");
});

test("adding days crosses months and years", () => {
  assert.equal(addDays("2026-11-30", 1), "2026-12-01");
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
  assert.equal(addDays("2026-03-01", -1), "2026-02-28");
  assert.equal(addDays("2028-03-01", -1), "2028-02-29");
  assert.equal(addDays("2026-11-25", -59), "2026-09-27");
});

test("adding days is right across daylight saving changes, including ones at midnight", () => {
  const before = process.env.TZ;
  try {
    for (const [zone, day] of [["America/New_York", "2026-03-08"], ["America/New_York", "2026-11-01"],
      ["America/Santiago", "2026-09-06"], ["America/Santiago", "2026-04-05"], ["Europe/London", "2026-03-29"]]) {
      process.env.TZ = zone;
      assert.equal(addDays(day, 1), addDays(addDays(day, 2), -1), zone);
      assert.notEqual(addDays(day, 1), day, `${zone} ${day} moves to the next day`);
      assert.equal(addDays(addDays(day, 1), -1), day, `${zone} ${day} and back`);
    }
  } finally {
    if (before === undefined) delete process.env.TZ; else process.env.TZ = before;
  }
});

test("a finished session adds a session and its minutes to the day it ended", () => {
  const days = recordSession({}, at("2026-11-25"), 25, true);
  assert.deepEqual(days, { "2026-11-25": { sessions: 1, minutes: 25 } });
  const more = recordSession(days, at("2026-11-25", 20), 50, true);
  assert.deepEqual(more, { "2026-11-25": { sessions: 2, minutes: 75 } });
});

test("a session ended early adds its minutes but no finished session", () => {
  assert.deepEqual(recordSession({}, at("2026-11-25"), 12, false), { "2026-11-25": { sessions: 0, minutes: 12 } });
});

test(`only the last ${HISTORY_DAYS} days are kept`, () => {
  let days = {};
  for (let i = 0; i < HISTORY_DAYS + 10; i++) days = recordSession(days, at(addDays("2026-09-01", i)), 25, true);
  const keys = Object.keys(days);
  assert.equal(keys.length, HISTORY_DAYS);
  assert.equal(keys.at(-1), addDays("2026-09-01", HISTORY_DAYS + 9));
  assert.equal(keys[0], addDays(keys.at(-1), -(HISTORY_DAYS - 1)));
  assert.deepEqual(keys, [...keys].sort(), "oldest first");
});

test("the streak counts days in a row with a finished session, up to today", () => {
  const days = { ...finished("2026-11-23"), ...finished("2026-11-24"), ...finished("2026-11-25") };
  assert.equal(currentStreak(days, at("2026-11-25")), 3);
});

test("a streak survives until the end of the day after its last session", () => {
  const days = { ...finished("2026-11-23"), ...finished("2026-11-24") };
  assert.equal(currentStreak(days, at("2026-11-25", 8)), 2, "no session yet today");
  assert.equal(currentStreak(days, at("2026-11-26", 8)), 0, "a whole day missed");
});

test("a gap ends the streak, and days with only unfinished sessions don't count", () => {
  const days = { ...finished("2026-11-21"), "2026-11-22": { sessions: 0, minutes: 30 }, ...finished("2026-11-23"), ...finished("2026-11-24") };
  assert.equal(currentStreak(days, at("2026-11-24")), 2);
  assert.equal(currentStreak({}, at("2026-11-24")), 0);
  assert.equal(currentStreak(undefined, at("2026-11-24")), 0);
});

test("a streak can cross a month and a year", () => {
  const days = { ...finished("2026-12-30"), ...finished("2026-12-31"), ...finished("2027-01-01") };
  assert.equal(currentStreak(days, at("2027-01-01")), 3);
});

test("the week is the last 7 days, oldest first, ending today", () => {
  const days = { "2026-11-19": { sessions: 1, minutes: 25 }, "2026-11-20": { sessions: 0, minutes: 10 }, "2026-11-25": { sessions: 2, minutes: 115 } };
  assert.deepEqual(lastWeek(days, at("2026-11-25")), [
    { key: "2026-11-19", day: "Thu", minutes: 25, today: false },
    { key: "2026-11-20", day: "Fri", minutes: 10, today: false },
    { key: "2026-11-21", day: "Sat", minutes: 0, today: false },
    { key: "2026-11-22", day: "Sun", minutes: 0, today: false },
    { key: "2026-11-23", day: "Mon", minutes: 0, today: false },
    { key: "2026-11-24", day: "Tue", minutes: 0, today: false },
    { key: "2026-11-25", day: "Wed", minutes: 115, today: true }
  ]);
});
