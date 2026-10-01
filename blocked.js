const MIN_CHARS = 60, WAIT_SECONDS = 60;
const raw = location.search.startsWith("?u=") ? location.search.slice(3) : "";
let target = raw;
try { target = decodeURIComponent(raw); } catch (_) {}

document.getElementById("site").textContent = target || "AI chat site";
chrome.runtime.sendMessage({ type: "blocked" });

const reason = document.getElementById("reason");
const btn = document.getElementById("unlock");
const count = document.getElementById("count");

reason.addEventListener("input", () => {
  const left = MIN_CHARS - reason.value.trim().length;
  btn.disabled = left > 0;
  count.textContent = left > 0 ? `${left} more characters` : "Ready";
});

btn.addEventListener("click", () => {
  btn.disabled = true;
  reason.readOnly = true;
  let s = WAIT_SECONDS;
  count.textContent = `Wait ${s}s. Try one more idea while you wait.`;
  const t = setInterval(async () => {
    s -= 1;
    count.textContent = `Wait ${s}s. Try one more idea while you wait.`;
    if (s <= 0) {
      clearInterval(t);
      await chrome.runtime.sendMessage({ type: "unlock", reason: reason.value.trim() });
      count.textContent = "Pass granted for 5 minutes";
      if (target.startsWith("http")) location.href = target;
    }
  }, 1000);
});

document.getElementById("back").onclick = () => {
  if (history.length > 1) history.back(); else window.close();
};
