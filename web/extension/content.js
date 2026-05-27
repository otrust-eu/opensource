// OTRUST Chrome Extension - Content Script
// Extracts page content for timestamping

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getPageContent') {
    const content = extractPageContent();
    sendResponse({
      content,
      url: window.location.href,
      title: document.title
    });
  }
  return true;
});

function extractPageContent() {
  // Get the main text content of the page
  const selectors = ['article', 'main', '[role="main"]', '.content', '#content'];
  let content = '';
  
  for (const selector of selectors) {
    const el = document.querySelector(selector);
    if (el) {
      content = el.innerText;
      break;
    }
  }
  
  if (!content) {
    content = document.body.innerText;
  }
  
  content = content.replace(/\s+/g, ' ').trim();
  
  return `---OTRUST---
URL: ${window.location.href}
Title: ${document.title}
Captured: ${new Date().toISOString()}
---CONTENT---
${content}`;
}
