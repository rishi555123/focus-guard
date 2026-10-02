// Setup helpers shared by the popup and the welcome page.

// Chrome's "Gemini in Chrome" settings. If a Chrome version doesn't have this
// sub-page, Chrome shows its main Settings page instead.
const GEMINI_SETTINGS_URL = "chrome://settings/ai/gemini";

const openGeminiSettings = () => chrome.tabs.create({ url: GEMINI_SETTINGS_URL });

// Focus Guard's own card on chrome://extensions, where "Allow in Incognito" is
const openExtensionSettings = () =>
  chrome.tabs.create({ url: "chrome://extensions/?id=" + chrome.runtime.id });

const openSetupChecklist = () =>
  chrome.tabs.create({ url: chrome.runtime.getURL("src/welcome/welcome.html") });

// Incognito windows are only covered if the user allows it on chrome://extensions
const incognitoAllowed = () => chrome.extension.isAllowedIncognitoAccess();
