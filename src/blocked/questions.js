// The questions on the block page. Each time it opens, it shows a few random
// questions from each list. To add one, add a line to either list.
// Loaded by blocked.html before blocked.js, and by the tests.

const QUESTIONS = {
  debugging: [
    "Did you read the full error message, including the line number?",
    "Did you print the values right before where it breaks?",
    "What changed since it last worked?",
    "Did you shrink it to the smallest input that still fails?",
    "Did you explain your code out loud, line by line?",
    "Did you check the official docs for the function you're using?"
  ],
  problemSolving: [
    "Can you restate the problem in your own words?",
    "Did you solve a tiny example by hand on paper?",
    "What's the brute-force solution, even if it's slow?",
    "What do the constraints tell you? (n ≤ 10^5 usually means O(n log n) or better)",
    "Which pattern might fit: two pointers, sliding window, hashmap, binary search, BFS/DFS, or DP?",
    "Did you check edge cases: empty input, one element, duplicates, negatives?",
    "Did you dry-run your code line by line with your example?",
    "Could it be an off-by-one error in a loop or index?",
    "Have you stepped away for 5 minutes?"
  ]
};

// How many to show from each list
const QUESTIONS_SHOWN = { debugging: 3, problemSolving: 3 };

// `count` different items from `list`, in random order (a partial Fisher-Yates shuffle).
// `random` returns a number from 0 up to (not including) 1, like Math.random.
function pickRandom(list, count, random) {
  const pool = list.slice();
  const n = Math.min(count, pool.length);
  for (let i = 0; i < n; i++) {
    const j = i + Math.floor(random() * (pool.length - i));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, n);
}

// The questions for one visit to the block page: { debugging: [...], problemSolving: [...] }
function pickQuestions(questions = QUESTIONS, shown = QUESTIONS_SHOWN, random = Math.random) {
  const picked = {};
  for (const group of Object.keys(shown)) picked[group] = pickRandom(questions[group] || [], shown[group], random);
  return picked;
}
