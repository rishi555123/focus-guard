const $ = (id) => document.getElementById(id);

// Show this browser's version of each step and its wording (from shared/browser.js)
applyBrowserText(document);

// 1. The browser's built-in AI: Gemini in Chrome, or Copilot in Edge (optional).
// Each has its own checkbox; Chrome's is shared with the popup's reminder.
const assistant = BROWSER.id === "edge"
  ? { open: "openCopilot", box: "copilotOff", done: "copilotDone" }
  : { open: "openGemini", box: "geminiOff", done: "geminiDone" };
const key = BROWSER.assistant.storageKey;

$(assistant.open).onclick = () => openAssistantSettings(); // from shared/setup.js
async function showAssistant() {
  const { [key]: off = false } = await chrome.storage.local.get(key);
  $(assistant.box).checked = off;
  $(assistant.done).hidden = !off;
}
$(assistant.box).onchange = () => chrome.storage.local.set({ [key]: $(assistant.box).checked });

// 2. Incognito (InPrivate in Edge). Checked again when you come back from the settings tab.
$("openIncognito").onclick = () => openExtensionSettings(); // from shared/setup.js
async function showIncognito() {
  const allowed = await incognitoAllowed(); // from shared/setup.js
  $("incognitoDone").hidden = !allowed;
  $("incognitoOk").hidden = !allowed;
  $("incognitoTodo").hidden = allowed;
}

// 3. Test notification, sent by the background script so it looks exactly like a pass notification
$("testNotification").onclick = async () => {
  const res = await chrome.runtime.sendMessage({ type: "testNotification" });
  $("testResult").textContent = res?.ok
    ? "Sent. If nothing appeared, check the Windows steps above."
    : "Couldn't send it: " + (res?.error || "no reply from Focus Guard");
};

showAssistant();
showIncognito();
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && key in changes) showAssistant();
});
document.addEventListener("visibilitychange", () => { if (!document.hidden) showIncognito(); });
