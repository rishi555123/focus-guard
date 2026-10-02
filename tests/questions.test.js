// Tests for src/blocked/questions.js, the rotating questions on the block page.
// Plain Node 22+, no installs:  node --test
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const context = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(__dirname, "../src/blocked/questions.js"), "utf8"), context);
const QUESTIONS = structuredClone(vm.runInContext("QUESTIONS", context));
const SHOWN = structuredClone(vm.runInContext("QUESTIONS_SHOWN", context));
const pickQuestions = (...args) => structuredClone(vm.runInContext("pickQuestions", context)(...args));

// A predictable stand-in for Math.random
function seeded(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

test("the pool has 6 debugging and 9 problem-solving questions", () => {
  assert.equal(QUESTIONS.debugging.length, 6);
  assert.equal(QUESTIONS.problemSolving.length, 9);
});

test("3 debugging and 3 problem-solving questions are shown", () => {
  assert.deepEqual(SHOWN, { debugging: 3, problemSolving: 3 });
  const picked = pickQuestions();
  assert.equal(picked.debugging.length, 3);
  assert.equal(picked.problemSolving.length, 3);
});

test("each group only has its own questions, with no repeats", () => {
  for (let seed = 1; seed <= 200; seed++) {
    const picked = pickQuestions(undefined, undefined, seeded(seed));
    for (const group of ["debugging", "problemSolving"]) {
      assert.equal(new Set(picked[group]).size, 3, `repeat in ${group} (seed ${seed})`);
      for (const q of picked[group]) assert.ok(QUESTIONS[group].includes(q), `${q} isn't a ${group} question`);
    }
  }
});

test("every question gets shown sometimes", () => {
  const seen = new Set();
  for (let seed = 1; seed <= 500; seed++) {
    const picked = pickQuestions(undefined, undefined, seeded(seed));
    [...picked.debugging, ...picked.problemSolving].forEach((q) => seen.add(q));
  }
  assert.equal(seen.size, QUESTIONS.debugging.length + QUESTIONS.problemSolving.length);
});

test("different visits get different questions", () => {
  const sets = new Set();
  for (let seed = 1; seed <= 50; seed++) sets.add(JSON.stringify(pickQuestions(undefined, undefined, seeded(seed))));
  assert.ok(sets.size > 40, `only ${sets.size} different sets in 50 visits`);
});

test("the same random numbers give the same questions", () => {
  assert.deepEqual(pickQuestions(undefined, undefined, seeded(7)), pickQuestions(undefined, undefined, seeded(7)));
});

test("works at the edges of Math.random's range", () => {
  for (const value of [0, 0.999999]) {
    const picked = pickQuestions(undefined, undefined, () => value);
    assert.equal(picked.debugging.length, 3);
    assert.equal(new Set(picked.problemSolving).size, 3);
  }
});

test("a short list shows what it has instead of breaking", () => {
  const picked = pickQuestions({ debugging: ["Only one?"], problemSolving: [] }, { debugging: 3, problemSolving: 3 });
  assert.deepEqual(picked, { debugging: ["Only one?"], problemSolving: [] });
});

test("picking doesn't change the pool", () => {
  const before = JSON.stringify(vm.runInContext("QUESTIONS", context));
  for (let i = 0; i < 20; i++) pickQuestions();
  assert.equal(JSON.stringify(vm.runInContext("QUESTIONS", context)), before);
});

test("every question is unique, trimmed, and long enough to read", () => {
  const all = [...QUESTIONS.debugging, ...QUESTIONS.problemSolving];
  assert.equal(new Set(all).size, all.length, "duplicate question");
  for (const q of all) {
    assert.equal(q, q.trim(), "extra spaces: " + JSON.stringify(q));
    assert.ok(q.length >= 15, "too short: " + q);
    assert.doesNotMatch(q, /[<>]/, "no HTML: " + q);
  }
});
