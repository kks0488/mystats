const APP_URL = 'https://mystats-eta.vercel.app/';
const APP_MATCH = 'https://mystats-eta.vercel.app/*';

function openOrFocusMyStats() {
  chrome.tabs.query({ url: APP_MATCH }, (tabs) => {
    if (chrome.runtime.lastError) {
      chrome.tabs.create({ url: APP_URL });
      return;
    }

    const first = Array.isArray(tabs) && tabs.length ? tabs[0] : null;
    if (!first || typeof first.id !== 'number') {
      chrome.tabs.create({ url: APP_URL });
      return;
    }

    chrome.tabs.update(first.id, { active: true }, () => {
      if (typeof first.windowId === 'number') {
        chrome.windows.update(first.windowId, { focused: true });
      }
    });
  });
}

chrome.action.onClicked.addListener(() => {
  openOrFocusMyStats();
});

