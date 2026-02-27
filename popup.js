/* popup.js – GroupCheckr popup logic */
'use strict';

// ─── State ───────────────────────────────────────────────────────────────────
let myGroups = [];          // Raw groups from Facebook (My Groups tab)
let searchResults = [];     // Raw groups from Facebook search
let activeMaxMembers = null; // Active filter value

// ─── Init ────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // Tab switching
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  // My Groups
  document.getElementById('load-groups-btn').addEventListener('click', loadMyGroups);
  document.getElementById('apply-filter-btn').addEventListener('click', applyFilter);
  document.getElementById('clear-filter-btn').addEventListener('click', clearFilter);
  document.getElementById('sort-by').addEventListener('change', renderMyGroups);

  // Find Groups
  document.getElementById('search-btn').addEventListener('click', handleSearch);
  document.getElementById('search-query').addEventListener('keydown', e => {
    if (e.key === 'Enter') handleSearch();
  });
});

// ─── Tab switching ────────────────────────────────────────────────────────────
function switchTab(tabId) {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    const active = btn.dataset.tab === tabId;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-selected', String(active));
  });
  document.querySelectorAll('.tab-pane').forEach(pane => {
    const active = pane.id === tabId;
    pane.classList.toggle('active', active);
    pane.hidden = !active;
  });
  hideStatus();
}

// ─── Load My Groups ───────────────────────────────────────────────────────────
async function loadMyGroups() {
  const btn = document.getElementById('load-groups-btn');
  btn.disabled = true;
  showLoading('groups-list');
  hideStatus();

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab || !tab.url || !isFacebookUrl(tab.url)) {
      await chrome.tabs.update(tab.id, {
        url: 'https://www.facebook.com/groups/?category=joined'
      });
      showStatus(
        'Opening Facebook Groups… wait for the page to load, then click "Load My Groups" again.',
        'info'
      );
      showPlaceholder(
        'groups-list',
        'After the page loads, click <strong>Load My Groups</strong> again to extract your groups.'
      );
      return;
    }

    // Execute extraction in the context of the Facebook tab
    const [result] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: extractGroupsFromPage
    });

    if (!result || !result.result) {
      showStatus('Could not extract groups. Make sure you are on a Facebook groups page.', 'warning');
      showPlaceholder('groups-list', 'Navigate to <strong>facebook.com/groups</strong> and try again.');
      return;
    }

    myGroups = result.result;
    activeMaxMembers = null;
    document.getElementById('max-members').value = '';

    if (myGroups.length === 0) {
      showStatus(
        'No groups detected on this page. Navigate to facebook.com/groups and try again.',
        'warning'
      );
      showPlaceholder('groups-list', 'Go to <strong>facebook.com/groups</strong> and click Load My Groups.');
      return;
    }

    // Show filter controls
    document.getElementById('filter-bar').hidden = false;
    renderMyGroups();
    showStatus(`Found ${myGroups.length} group${myGroups.length !== 1 ? 's' : ''}.`, 'success');
  } catch (err) {
    showStatus('Error: ' + err.message, 'error');
    showPlaceholder('groups-list', 'An error occurred. Please try again.');
  } finally {
    btn.disabled = false;
  }
}

// ─── Apply / Clear filter ─────────────────────────────────────────────────────
function applyFilter() {
  const val = parseInt(document.getElementById('max-members').value, 10);
  activeMaxMembers = isNaN(val) ? null : val;
  renderMyGroups();
}

function clearFilter() {
  activeMaxMembers = null;
  document.getElementById('max-members').value = '';
  renderMyGroups();
}

// ─── Render My Groups ─────────────────────────────────────────────────────────
function renderMyGroups() {
  if (myGroups.length === 0) return;

  const sortBy = document.getElementById('sort-by').value;
  let groups = [...myGroups];

  // Filter
  if (activeMaxMembers !== null) {
    groups = groups.filter(g => g.memberCount <= activeMaxMembers);
  }

  // Sort
  groups = sortGroups(groups, sortBy);

  // Count line
  const countEl = document.getElementById('my-groups-count');
  countEl.hidden = false;
  countEl.textContent = activeMaxMembers !== null
    ? `Showing ${groups.length} of ${myGroups.length} groups (max ${activeMaxMembers.toLocaleString()} members)`
    : `${groups.length} group${groups.length !== 1 ? 's' : ''} found`;

  renderGroupCards('groups-list', groups, 'my');
}

// ─── Search for Groups ────────────────────────────────────────────────────────
async function handleSearch() {
  const query = document.getElementById('search-query').value.trim();
  if (!query) {
    showStatus('Please enter keywords to search for.', 'warning');
    return;
  }

  const btn = document.getElementById('search-btn');
  btn.disabled = true;
  showLoading('search-results');
  hideStatus();

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const searchUrl = `https://www.facebook.com/search/groups/?q=${encodeURIComponent(query)}`;

    if (!tab || !tab.url || !isFacebookUrl(tab.url)) {
      await chrome.tabs.update(tab.id, { url: searchUrl });
      showStatus(
        'Opening Facebook group search… wait for results to load, then click Search again.',
        'info'
      );
      showPlaceholder('search-results', 'After the page loads, click <strong>Search</strong> again.');
      return;
    }

    // Already on Facebook – navigate if not already on the right search page
    const isOnSearch = tab.url.includes('/search/groups') &&
      tab.url.toLowerCase().includes(encodeURIComponent(query.toLowerCase()));

    if (!isOnSearch) {
      await chrome.tabs.update(tab.id, { url: searchUrl });
      showStatus(
        'Navigating to search results… wait for results to load, then click Search again.',
        'info'
      );
      showPlaceholder('search-results', 'After results load, click <strong>Search</strong> again.');
      return;
    }

    // Page already shows the search results – extract them
    const [result] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: extractGroupsFromPage
    });

    if (!result || !result.result) {
      showStatus('Could not extract search results from this page.', 'warning');
      showPlaceholder('search-results', 'Make sure you are on the Facebook groups search results page.');
      return;
    }

    searchResults = result.result;

    const countEl = document.getElementById('search-count');
    countEl.hidden = false;
    countEl.textContent = `${searchResults.length} result${searchResults.length !== 1 ? 's' : ''} for "${query}"`;

    if (searchResults.length === 0) {
      showStatus('No group results found on this page.', 'warning');
      showPlaceholder('search-results', 'No group results found. Try different keywords.');
      return;
    }

    renderGroupCards('search-results', searchResults, 'search');
    showStatus(`Found ${searchResults.length} group${searchResults.length !== 1 ? 's' : ''} for "${query}".`, 'success');
  } catch (err) {
    showStatus('Error: ' + err.message, 'error');
    showPlaceholder('search-results', 'An error occurred. Please try again.');
  } finally {
    btn.disabled = false;
  }
}

// ─── Render group cards ───────────────────────────────────────────────────────
function renderGroupCards(containerId, groups, mode) {
  const container = document.getElementById(containerId);

  if (groups.length === 0) {
    container.innerHTML = '<div class="no-results">No groups match your criteria.</div>';
    return;
  }

  container.innerHTML = groups.map(g => groupCardHTML(g, mode)).join('');
}

function groupCardHTML(group, mode) {
  const initial = group.name ? group.name.charAt(0).toUpperCase() : '?';
  const badge = memberBadge(group.memberCount);
  const memberText = group.memberCountText || (group.memberCount > 0
    ? group.memberCount.toLocaleString() + ' members'
    : 'Unknown members');

  const actionBtn = mode === 'my'
    ? `<a href="${escapeAttr(group.url + '/members')}" target="_blank" class="btn btn-danger" title="Open Leave Group page">Leave</a>`
    : `<a href="${escapeAttr(group.url)}" target="_blank" class="btn btn-join" title="Open group to join">Join</a>`;

  return `
    <div class="group-card">
      <div class="group-avatar" aria-hidden="true">${escapeHTML(initial)}</div>
      <div class="group-info">
        <a href="${escapeAttr(group.url)}" target="_blank" class="group-name" title="${escapeAttr(group.name)}">${escapeHTML(group.name)}</a>
        <div class="group-meta">
          <span class="member-count"><span class="icon">👥</span>${escapeHTML(memberText)}</span>
          ${badge}
        </div>
      </div>
      <div class="group-actions">${actionBtn}</div>
    </div>`;
}

function memberBadge(count) {
  if (count <= 0) return '';
  let cls, label;
  if (count < 500) {
    cls = 'badge-small'; label = 'Small';
  } else if (count < 5000) {
    cls = 'badge-medium'; label = 'Medium';
  } else if (count < 50000) {
    cls = 'badge-large'; label = 'Large';
  } else {
    cls = 'badge-huge'; label = 'Huge';
  }
  return `<span class="member-badge ${cls}">${label}</span>`;
}

// ─── Sort helper ──────────────────────────────────────────────────────────────
function sortGroups(groups, by) {
  return [...groups].sort((a, b) => {
    if (by === 'name') return a.name.localeCompare(b.name);
    if (by === 'members-asc') return a.memberCount - b.memberCount;
    if (by === 'members-desc') return b.memberCount - a.memberCount;
    return 0;
  });
}

// ─── URL helpers ──────────────────────────────────────────────────────────────
/**
 * Returns true only if the URL's hostname is exactly facebook.com or a
 * subdomain of facebook.com (e.g. www.facebook.com).  Using the URL API
 * avoids substring-match false positives like "notfacebook.com".
 */
function isFacebookUrl(urlStr) {
  try {
    const { hostname } = new URL(urlStr);
    return hostname === 'facebook.com' || hostname.endsWith('.facebook.com');
  } catch {
    return false;
  }
}

// ─── UI helpers ───────────────────────────────────────────────────────────────
function showLoading(containerId) {
  document.getElementById(containerId).innerHTML = `
    <div class="loading">
      <div class="spinner"></div>
      <span>Loading…</span>
    </div>`;
}

function showPlaceholder(containerId, html) {
  document.getElementById(containerId).innerHTML = `<div class="placeholder"><p>${html}</p></div>`;
}

function showStatus(msg, type = 'info') {
  const bar = document.getElementById('status-bar');
  bar.textContent = msg;
  bar.className = 'status-bar ' + type;
  bar.hidden = false;
}

function hideStatus() {
  const bar = document.getElementById('status-bar');
  bar.hidden = true;
}

// ─── Security helpers ─────────────────────────────────────────────────────────
function escapeHTML(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttr(str) {
  return escapeHTML(str);
}

// ─── extractGroupsFromPage ────────────────────────────────────────────────────
// This function is serialised and injected into the Facebook tab via
// chrome.scripting.executeScript – it must be entirely self-contained.
function extractGroupsFromPage() {
  'use strict';

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
    // Walk up at most 8 levels looking for "X members" text
    let el = anchor;
    for (let i = 0; i < 8; i++) {
      el = el.parentElement;
      if (!el) break;
      const text = el.innerText || '';
      // Match patterns like: "1,234 members", "1.2K members", "25K Members"
      const m = text.match(/([\d,.]+\s*[KMBkmb]?)\s+[Mm]embers?/);
      if (m) {
        return {
          memberCount: parseCount(m[1]),
          memberCountText: m[0].trim()
        };
      }
    }
    return { memberCount: 0, memberCountText: '' };
  }

  const groups = [];
  const seen = new Set();

  const links = document.querySelectorAll('a[href*="/groups/"]');

  links.forEach(link => {
    const href = link.href || '';
    const match = href.match(/facebook\.com\/groups\/([^/?#\s]+)/);
    if (!match) return;

    const groupId = match[1].toLowerCase();
    if (SKIP_IDS.has(groupId)) return;
    if (seen.has(groupId)) return;

    // Get name from link text (strip extraneous whitespace)
    let name = (link.innerText || link.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim();
    if (!name || name.length < 2 || name.length > 200) return;

    // Skip pure icon / navigation anchors that have no useful text
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

  return groups;
}
