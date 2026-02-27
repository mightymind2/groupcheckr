/* content.js – GroupCheckr content script
 *
 * Runs on every facebook.com page.  Listens for messages from the
 * popup and responds with group data extracted from the current page.
 *
 * The heavy lifting (extractGroupsFromPage) is also duplicated inside
 * popup.js so that it can be injected via chrome.scripting.executeScript
 * without needing the content script to be loaded first.
 */
'use strict';

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'ping') {
    sendResponse({ ok: true });
    return true;
  }

  if (request.action === 'extractGroups') {
    extractGroupsFromPage().then(groups => sendResponse({ groups }));
    return true;
  }

  if (request.action === 'getPageType') {
    sendResponse({ pageType: detectPageType() });
    return true;
  }
});

// ─── Page type detection ──────────────────────────────────────────────────────
function detectPageType() {
  const url = window.location.href;
  if (/facebook\.com\/groups\/?(feed|joined|suggested|\?category=joined)?/.test(url)) {
    return 'my-groups';
  }
  if (url.includes('/search/groups') || /facebook\.com\/search\?/.test(url)) {
    return 'search-results';
  }
  return 'other';
}

// ─── Group extraction ─────────────────────────────────────────────────────────
// NOTE: Keep in sync with the copy inside popup.js (extractGroupsFromPage).
// Async so it can scroll the page to trigger Facebook's lazy loading and
// collect ALL groups, not just those initially visible in the DOM.
async function extractGroupsFromPage() {
  const SKIP_IDS = new Set([
    'feed', 'create', 'discover', 'joined', 'suggested', 'local',
    'category', 'app', 'events', 'invites', 'updates'
  ]);

  function parseCount(raw) {
    if (!raw) return 0;
    const s = raw.replace(/,/g, '').trim();
    const n = parseFloat(s);
    if (isNaN(n)) return 0;
    const u = s.toUpperCase();
    if (u.endsWith('K')) return Math.round(n * 1_000);
    if (u.endsWith('M')) return Math.round(n * 1_000_000);
    if (u.endsWith('B')) return Math.round(n * 1_000_000_000);
    return Math.round(n);
  }

  function findMemberCount(anchor) {
    // Walk up at most 6 levels; at each level check direct children
    // independently to avoid capturing text from sibling group cards.
    let el = anchor;
    for (let i = 0; i < 6; i++) {
      el = el.parentElement;
      if (!el) break;
      for (const child of el.children) {
        const text = child.innerText || '';
        const m = text.match(/([\d,.]+\s*[KMBkmb]?)\s+[Mm]embers?/);
        if (m) {
          return { memberCount: parseCount(m[1]), memberCountText: m[0].trim() };
        }
      }
    }
    return { memberCount: 0, memberCountText: '' };
  }

  const groups = [];
  const seen = new Set();

  function collectVisible() {
    document.querySelectorAll('a[href*="/groups/"]').forEach(link => {
      const href = link.href || '';
      const match = href.match(/facebook\.com\/groups\/([^/?#\s]+)/);
      if (!match) return;

      const groupId = match[1].toLowerCase();
      if (SKIP_IDS.has(groupId)) return;
      if (seen.has(groupId)) return;

      let name = (link.innerText || link.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim();
      if (!name || name.length < 2 || name.length > 200) return;
      if (link.getAttribute('role') === 'button') return;

      const { memberCount, memberCountText } = findMemberCount(link);

      seen.add(groupId);
      groups.push({
        id: groupId,
        name,
        url: 'https://www.facebook.com/groups/' + match[1],
        memberCount,
        memberCountText
      });
    });
  }

  function scrollAll() {
    window.scrollTo(0, document.body.scrollHeight);
    const visited = new Set();
    document.querySelectorAll('a[href*="/groups/"]').forEach(link => {
      let el = link.parentElement;
      while (el && el !== document.body && el !== document.documentElement) {
        if (visited.has(el)) break;
        visited.add(el);
        const { overflow, overflowY } = window.getComputedStyle(el);
        if (/auto|scroll/.test(overflow) || /auto|scroll/.test(overflowY)) {
          el.scrollTop = el.scrollHeight;
          break;
        }
        el = el.parentElement;
      }
    });
  }

  function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  collectVisible();

  // NOTE: MAX_SCROLLS / PAUSE_MS / STOP_AFTER are intentionally duplicated here
  // and in the copy inside popup.js. extractGroupsFromPage must be entirely
  // self-contained because chrome.scripting.executeScript serialises its body.
  const MAX_SCROLLS = 30;
  const PAUSE_MS = 1000;
  const STOP_AFTER = 3;
  let empty = 0;

  for (let i = 0; i < MAX_SCROLLS; i++) {
    const before = groups.length;
    scrollAll();
    await wait(PAUSE_MS);
    collectVisible();
    if (groups.length === before) {
      if (++empty >= STOP_AFTER) break;
    } else {
      empty = 0;
    }
  }

  window.scrollTo(0, 0);

  return groups;
}
