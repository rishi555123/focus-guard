const $ = (id) => document.getElementById(id);

// 1. Gemini in Chrome. The checkbox is shared with the popup's reminder.
$("openGemini").onclick = () => openGeminiSettings(); // from shared/setup.js
async function showGemini() {
  const { geminiOff = false } = await chrome.storage.local.get("geminiOff");
  $("geminiOff").checked = geminiOff;
  $("geminiDone").hidden = !geminiOff;
}
$("geminiOff").onchange = () => chrome.storage.local.set({ geminiOff: $("geminiOff").checked });

// 2. Incognito. Checked again when you come back from the settings tab.
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

showGemini();
showIncognito();
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && "geminiOff" in changes) showGemini();
});
document.addEventListener("visibilitychange", () => { if (!document.hidden) showIncognito(); });
