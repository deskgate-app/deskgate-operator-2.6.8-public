// DeskGate 2.6.8 — service worker. Guard optional APIs so registration cannot fail.
try {
  chrome.sidePanel
    ?.setPanelBehavior({ openPanelOnActionClick: true })
    ?.catch((error) => console.warn(error));
} catch (e) {
  console.warn(e);
}

chrome.runtime.onInstalled.addListener(() => {
  try {
    chrome.contextMenus?.create({
      id: 'extract-desk-state',
      title: 'DeskGate: Read page state',
      contexts: ['page', 'link', 'selection'],
    });
  } catch (e) {
    console.warn(e);
  }
});

if (chrome.contextMenus?.onClicked) {
  chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === 'extract-desk-state' && tab?.id) {
      chrome.tabs.sendMessage(tab.id, { action: 'GET_DOM_STATE' }).catch(() => {});
    }
  });
}

chrome.tabs.onActivated.addListener((activeInfo) => {
  chrome.tabs.get(activeInfo.tabId, (tab) => {
    if (tab && tab.url && !tab.url.startsWith('chrome://')) {
      chrome.runtime.sendMessage({
        action: 'TAB_CONTEXT_SWITCH',
        data: { url: tab.url, title: tab.title },
      }).catch(() => {});
    }
  });
});
