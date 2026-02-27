/* background.js – GroupCheckr service worker (Manifest V3) */
'use strict';

// No persistent state needed – extraction happens on demand via
// chrome.scripting.executeScript called from popup.js.

chrome.runtime.onInstalled.addListener(() => {
  console.log('GroupCheckr installed.');
});
