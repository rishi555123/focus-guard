// Setup helpers shared by the popup and the welcome page.
// Needs shared/browser.js loaded first, for BROWSER.

// The browser's built-in AI settings: Gemini in Chrome, or Copilot in Edge
const openAssistantSettings = () => chrome.tabs.create({ url: BROWSER.assistant.settingsUrl });

// Focus Guard's own card on chrome://extensions or edge://extensions, where
// "Allow in Incognito" (Chrome) or "Allow in InPrivate" (Edge) is
const openExtensionSettings = () =>
  chrome.tabs.create({ url: BROWSER.extensionsPage + "/?id=" + chrome.runtime.id });

const openSetupChecklist = () =>
  chrome.tabs.create({ url: chrome.runtime.getURL("src/welcome/welcome.html") });

// Private windows are only covered if the user allows it on the extensions page
const incognitoAllowed = () => chrome.extension.isAllowedIncognitoAccess();
