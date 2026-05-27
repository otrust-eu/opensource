// OTRUST Chrome Extension - Background Service Worker

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'otrust-timestamp',
    title: ' Timestamp with OTRUST',
    contexts: ['page']
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'otrust-timestamp') {
    chrome.tabs.sendMessage(tab.id, { action: 'getPageContent' });
  }
});
