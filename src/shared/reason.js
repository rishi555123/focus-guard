// The three answers on the block page: what you tried, what you expected and what happened
// instead. Checked on the block page as you type, and again by the background script before
// it grants a pass. Loaded by the block page and the background script, and by the tests.
// Needs shared/constants.js loaded first, for UNLOCK_MIN_CHARS.

// In the order the block page asks them. `note` starts each line of the saved unlock note,
// `prompt` each line of the "Copy as AI prompt" text.
const ANSWERS = [
  { key: "tried", note: "Tried", prompt: "I tried" },
  { key: "expected", note: "Expected", prompt: "I expected" },
  { key: "got", note: "Instead", prompt: "Instead" }
];

// Runs along a keyboard row, like "asdfg" or "poiuy", in either direction
const KEY_ROWS = ["qwertyuiop", "asdfghjkl", "zxcvbnm"];
const KEY_RUNS = KEY_ROWS.flatMap((row) => {
  const runs = [];
  for (const r of [row, [...row].reverse().join("")]) for (let i = 0; i + 5 <= r.length; i++) runs.push(r.slice(i, i + 5));
  return runs;
}).concat(["asdf", "qwer", "zxcv", "fdsa", "rewq", "vcxz", "jkl;", ";lkj"]);

// True for text that's obviously random typing. Deliberately cautious: code, error
// messages, numbers and other languages must pass, so it only catches clear mashing.
function looksLikeMashing(text) {
  const t = text.toLowerCase();
  const letters = t.match(/\p{L}/gu) || [];
  if (letters.length < 5) return true; // numbers or symbols only
  if (/(\p{L})\1{4,}/u.test(t)) return true; // "aaaaa" (but "n=100000" and "!!!!!" are fine)
  if (KEY_RUNS.some((run) => t.includes(run))) return true;

  // The rest only makes sense for text written in Latin letters
  const latin = letters.filter((c) => c >= "a" && c <= "z");
  if (latin.length / letters.length < 0.7) return false;
  if (latin.length >= 12 && new Set(latin).size < 6) return true; // "abababab", "asdasdasd"
  if (latin.length >= 15 && latin.filter((c) => "aeiouy".includes(c)).length / latin.length < 0.15) return true;
  const words = t.match(/[a-z]{2,}/g) || [];
  if (words.some((w) => w.length >= 6 && !/[aeiouy]/.test(w))) return true; // "sdfghk"
  if (words.length >= 3 && new Set(words).size === 1) return true; // "test test test"
  return words.length < 3; // a real answer has a few words
}

// What's wrong with one answer: "" if nothing, otherwise a short message
function answerProblem(text) {
  const left = UNLOCK_MIN_CHARS - (text || "").trim().length;
  if (left > 0) return `${left} more character${left === 1 ? "" : "s"}`;
  if (looksLikeMashing(text)) return "This looks like random typing. Describe what really happened.";
  return "";
}

// { tried, expected, got } -> the problem with each answer, by key ("" when it's fine)
function answerProblems(answers) {
  return Object.fromEntries(ANSWERS.map(({ key }) => [key, answerProblem(answers?.[key])]));
}

const answersOk = (answers) => Object.values(answerProblems(answers)).every((p) => !p);

// The unlock note saved in the stats log
const answersNote = (answers) => ANSWERS.map(({ key, note }) => `${note}: ${answers[key].trim()}`).join("\n");

// The text "Copy as AI prompt" puts on the clipboard
const answersPrompt = (answers) =>
  ANSWERS.map(({ key, prompt }) => `${prompt}: ${answers[key].trim()}`).join("\n") +
  "\nPlease give me a hint or explain the cause, not the full solution.";
