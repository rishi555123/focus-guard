// Limits from shared/constants.js; the answers are checked by shared/reason.js
const MIN_CHARS = UNLOCK_MIN_CHARS, WAIT_SECONDS = UNLOCK_WAIT_SECONDS;
const link = readBlockLink(location.search); // from links.js
const target = link.url;

document.getElementById("site").textContent = target || "AI chat site";

// Unlock wording, built from the limits so it always matches them
document.getElementById("unlockIntro").textContent =
  `Answer all three questions, at least ${MIN_CHARS} characters each. ` +
  `You'll get a ${PASS_MINUTES}-minute pass for this site after a ${WAIT_SECONDS}-second wait.`;
document.getElementById("unlock").textContent = `Start ${WAIT_SECONDS}-second wait`;

// Random questions, picked once per visit. Ticking a box only changes that box,
// so the list never reshuffles while you're using it.
function showQuestions(containerId, questions) {
  const container = document.getElementById(containerId);
  for (const question of questions) {
    const label = document.createElement("label");
    label.className = "check";
    const box = document.createElement("input");
    box.type = "checkbox";
    const text = document.createElement("span");
    text.textContent = question; // text, never HTML
    label.append(box, text);
    container.append(label);
  }
}
const picked = pickQuestions(); // from questions.js
showQuestions("debuggingQuestions", picked.debugging);
showQuestions("problemSolvingQuestions", picked.problemSolving);

// Explain re-blocks caused by a pass moving to another site or running out
const whyNote = document.getElementById("why");
whyNote.textContent = sweepNote(link); // from links.js
whyNote.hidden = !whyNote.textContent;

// Warn before the wait if unlocking here would end a pass for another site.
// Kept up to date if a pass starts or ends while this page is open.
const passWarning = document.getElementById("passWarning");
async function showPassWarning() {
  const { pass } = await chrome.storage.local.get("pass");
  const other = otherPass(pass, target, Date.now()); // from links.js
  passWarning.textContent = other
    ? `This will end your pass for ${other}. You can only have one pass at a time, so ${other} will be blocked again.`
    : "";
  passWarning.hidden = !other;
}
showPassWarning();
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && "pass" in changes) showPassWarning();
});

// Only fresh visits count: not reloads, Back/Forward, or Focus Guard
// re-blocking tabs that were already open
const nav = performance.getEntriesByType("navigation")[0];
const countVisit = !link.sweep && (!nav || nav.type === "navigate");

// Counts this visit, or reopens the site if it isn't blocked any more
// (session over, or a pass covers it). Only listed sites are ever reopened.
chrome.runtime.sendMessage({ type: "blocked", url: target, count: countVisit }).then((res) => {
  if (res?.ok && res.reopen) location.replace(target);
});

const fields = ANSWERS.map(({ key }) => ({ key, box: document.getElementById(key), hint: document.getElementById(key + "Hint") }));
const btn = document.getElementById("unlock");
const count = document.getElementById("count");
const answers = () => Object.fromEntries(fields.map(({ key, box }) => [key, box.value.trim()]));
const setLocked = (locked) => fields.forEach(({ box }) => { box.readOnly = locked; });

// Each answer gets its own hint once you've started typing it; the button waits for all three
function checkAnswers() {
  const problems = answerProblems(answers()); // from shared/reason.js
  for (const { key, box, hint } of fields) {
    const problem = box.value.trim() ? problems[key] : "";
    hint.textContent = problem;
    hint.classList.toggle("failed", problem !== "" && !/more characters?$/.test(problem));
  }
  const ready = Object.values(problems).every((p) => !p);
  btn.disabled = !ready;
  count.classList.remove("failed");
  count.textContent = ready ? "Ready" : "Answer all three questions";
}
fields.forEach(({ box }) => box.addEventListener("input", checkAnswers));
checkAnswers(); // also covers answers the browser restored after Back

// After a pass is granted the site opens when you choose, so you can copy your answers first
const granted = document.getElementById("granted");
const openButton = document.getElementById("open");
const copied = document.getElementById("copied");
openButton.addEventListener("click", () => { location.href = target; });
document.getElementById("copyPrompt").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(answersPrompt(answers())); // from shared/reason.js
    copied.textContent = "Copied";
  } catch (err) {
    copied.textContent = "Couldn't copy: " + (err?.message || String(err));
  }
});

btn.addEventListener("click", () => {
  btn.disabled = true;
  setLocked(true);
  count.classList.remove("failed");
  let s = WAIT_SECONDS;
  count.textContent = `Wait ${s}s. Try one more idea while you wait.`;
  const t = setInterval(async () => {
    s -= 1;
    count.textContent = `Wait ${s}s. Try one more idea while you wait.`;
    if (s <= 0) {
      clearInterval(t);
      let res;
      try {
        res = await chrome.runtime.sendMessage({ type: "unlock", answers: answers(), url: target });
      } catch (err) { // e.g. Focus Guard was reloaded while this page was open
        res = { ok: false, error: err?.message || String(err) };
      }
      if (!res?.ok) {
        // Keep the answers and let the user try again without reloading (with a fresh wait)
        btn.disabled = false;
        setLocked(false);
        count.classList.add("failed");
        count.textContent = "Couldn't grant a pass: " + (res?.error || "no reply from Focus Guard") + ". You can try again.";
        return;
      }
      if (res.granted) {
        count.textContent = `Pass granted for ${res.domain} for ${minutesText(PASS_MINUTES)}. It's running now.`;
        btn.hidden = true;
        openButton.textContent = `Open ${res.domain}`;
        granted.hidden = false;
      } else if (res.reopen) {
        count.textContent = "No session is running, so this site isn't blocked";
        location.href = target;
      } else {
        count.textContent = "No session is running, so there's nothing to unlock";
      }
    }
  }, 1000);
});

document.getElementById("back").onclick = async () => {
  const steps = backSteps(link, history.length);
  if (steps) return history.go(-steps);
  // Nothing to go back to: close this tab, or show a new tab page if it's the window's last tab
  const tab = await chrome.tabs.getCurrent();
  const inWindow = await chrome.tabs.query({ windowId: tab.windowId });
  if (inWindow.length > 1) chrome.tabs.remove(tab.id);
  else chrome.tabs.update(tab.id, { url: BROWSER.newTab }); // from shared/browser.js
};
