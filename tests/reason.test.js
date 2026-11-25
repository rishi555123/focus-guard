// Tests for src/shared/reason.js, which checks the block page's three unlock answers.
// Plain Node 22+, no installs:  node --test
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const read = (f) => fs.readFileSync(path.join(__dirname, "..", f), "utf8");
const context = vm.createContext({});
vm.runInContext(read("src/shared/constants.js"), context);
vm.runInContext(read("src/shared/reason.js"), context);
const get = (name) => vm.runInContext(name, context);
const looksLikeMashing = get("looksLikeMashing");
const answerProblem = get("answerProblem");
const MIN = get("UNLOCK_MIN_CHARS");

// Real answers people write, including code, errors, numbers and other languages
const REAL = [
  "I added console.log before the loop and the index starts at 1",
  "TypeError: Cannot read properties of undefined (reading 'map')",
  "cd src && npm run build failed with exit code 1",
  "It should print 42 but prints 41 instead",
  "binary search on the sorted array, checked the mid calculation",
  "Reinstalled node_modules and cleared the cache",
  "我试过重新安装依赖但是还是报同样的错误信息",
  "Probé reiniciar el servidor y limpiar la caché del navegador",
  "Мой цикл не заканчивается, проверил условие выхода",
  "segfault in main.c when n is 0, gdb shows null ptr",
  "expected O(n log n) but got TLE on test 14",
  "kubectl get pods shows CrashLoopBackOff for api",
  "The output should be [1, 2, 3] sorted ascending",
  "git rebase main gave a merge conflict in app.py",
  "printf shows i=5 then crash at arr[i+1]",
  "Expected 200 OK from fetch, got 403 Forbidden",
  "Tried recursion with memo dict, still TLE on n=100000",
  "strcpy into a char buf[8] overflows I think",
  "Rust borrow checker says cannot borrow x as mutable",
  "nothing works and it keeps failing!!!!!"
];

// Keyboard mashing and filler
const MASHING = [
  "asdfasdfasdfasdfasdf",
  "aaaaaaaaaaaaaaaaaaaaaaa",
  "qwertyuiopqwertyuiop",
  "jfkdlsjfkdlsjfkdlsjfk",
  "test test test test test",
  "sdfghjk sdfghj dfgh x",
  "lkjhlkjhlkjhlkjhlkjh",
  "hello hello hello hello",
  "ab ab ab ab ab ab ab ab",
  "......................",
  "1234567890123456789012",
  "dkfjghdkfjghdkfjgh xx",
  "zxcvzxcvzxcv zxcv zxcv",
  "hjdsk fjdks fjdkslw",
  "mnbvcxz lkjhgf poiuyt",
  "aaaaa it does not work"
];

for (const text of REAL) test(`real answer passes: ${text}`, () => assert.equal(looksLikeMashing(text), false));
for (const text of MASHING) test(`mashing is caught: ${text}`, () => assert.equal(looksLikeMashing(text), true));

test("each answer needs UNLOCK_MIN_CHARS characters, counted without outer spaces", () => {
  const short = "x is undefined here".padEnd(MIN - 1, "!");
  assert.equal(short.length, MIN - 1);
  assert.equal(answerProblem("  " + short + "  "), "1 more character");
  assert.equal(answerProblem(""), `${MIN} more characters`);
  assert.equal(answerProblem(undefined), `${MIN} more characters`);
  assert.equal(answerProblem("x is undefined here at line 12"), "");
  assert.match(answerProblem("asdf asdf asdf asdf asdf"), /random typing/);
});

const GOOD = {
  tried: "I printed the values right before the loop",
  expected: "The loop should stop at the last index",
  got: "It reads one past the end and crashes"
};

test("answersOk needs all three answers to be fine", () => {
  const answersOk = get("answersOk");
  assert.equal(answersOk(GOOD), true);
  assert.equal(answersOk({ ...GOOD, got: "" }), false);
  assert.equal(answersOk({ ...GOOD, expected: "qwertyuiop qwertyuiop" }), false);
  assert.equal(answersOk(undefined), false);
  assert.equal(answersOk({ tried: GOOD.tried }), false);
});

test("the saved note and the AI prompt list the answers in order", () => {
  assert.equal(get("answersNote")(GOOD), `Tried: ${GOOD.tried}\nExpected: ${GOOD.expected}\nInstead: ${GOOD.got}`);
  assert.equal(get("answersPrompt")({ ...GOOD, got: "  " + GOOD.got + "\n" }),
    `I tried: ${GOOD.tried}\nI expected: ${GOOD.expected}\nInstead: ${GOOD.got}\n` +
    "Please give me a hint or explain the cause, not the full solution.");
});

test("the block page asks the questions in the same order as the note and the prompt", () => {
  const html = read("src/blocked/blocked.html");
  const order = [...html.matchAll(/<textarea id="(\w+)"/g)].map((m) => m[1]);
  assert.deepEqual(order, structuredClone(get("ANSWERS").map((a) => a.key)));
  for (const key of order) assert.match(html, new RegExp(`<label class="answer" for="${key}">`), `${key} has a label`);
});
