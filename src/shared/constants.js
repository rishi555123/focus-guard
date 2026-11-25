// The numbers Focus Guard is built around, in one place. Every label and message that
// mentions one is built from here, so changing a number here changes it everywhere.
// Loaded first by the background script (importScripts), the popup and the block page,
// and by the tests. tests/constants.test.js fails if one is typed out anywhere else.

// Session lengths in minutes, in the order the popup shows them. The first is the default.
const SESSION_LENGTHS = [25, 50, 90];

// How long a pass unlocks a site for, in minutes
const PASS_MINUTES = 5;

// Unlocking on the block page: answer each of the three questions with at least this many
// characters (shared/reason.js also rejects random typing), then wait this long
const UNLOCK_MIN_CHARS = 20;
const UNLOCK_WAIT_SECONDS = 60;

// "1 minute", "5 minutes"
const minutesText = (n) => `${n} minute${n === 1 ? "" : "s"}`;
