const MIN_CHARS = 60, WAIT_SECONDS = 60;
const raw = location.search.startsWith("?u=") ? location.search.slice(3) : "";
let target = raw;
try { target = decodeURIComponent(raw); } catch (_) {}

document.getElementById("site").textContent = target || "AI chat site";

// Counts this visit, or reopens the site if it isn't blocked any more
// (session over, or a pass covers it). Only listed sites are ever reopened.
chrome.runtime.sendMessage({ type: "blocked", url: target }).then((res) => {
  if (res?.ok && res.reopen) location.replace(target);
});

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
      const res = await chrome.runtime.sendMessage({ type: "unlock", reason: reason.value.trim(), url: target });
      if (!res?.ok) {
        count.textContent = "Couldn't grant a pass: " + (res?.error || "no reply from Focus Guard");
        return;
      }
      if (res.granted) {
        count.textContent = `Pass granted for ${res.domain} for 5 minutes`;
        location.href = target;
      } else if (res.reopen) {
        count.textContent = "No session is running, so this site isn't blocked";
        location.href = target;
      } else {
        count.textContent = "No session is running, so there's nothing to unlock";
      }
    }
  }, 1000);
});

document.getElementById("back").onclick = () => {
  if (history.length > 1) history.back(); else window.close();
};
