# GroupCheckr

A Chrome extension that helps you manage your Facebook groups.

## Features

- **My Groups** – Load all Facebook groups you are in, complete with member counts.
- **Filter by member count** – Hide groups above a specified member threshold so you can focus on smaller (or larger) communities.
- **Sort** – Order groups by name, member count (ascending or descending).
- **Leave group** – One click opens the group's Members page where you can leave.
- **Find Groups** – Search Facebook for groups by keyword or niche; results include member counts and a direct Join link.
- **Member-size badges** – Small / Medium / Large / Huge labels give you an instant visual cue.

## Installation (unpacked)

1. Clone or download this repository.
2. Open Chrome and go to `chrome://extensions`.
3. Enable **Developer mode** (top-right toggle).
4. Click **Load unpacked** and select the `groupcheckr` folder.
5. The GroupCheckr icon appears in the toolbar – pin it for easy access.

## Usage

### My Groups
1. Navigate to **facebook.com** (any page, e.g. `facebook.com/groups`).
2. Click the GroupCheckr icon → **Load My Groups**.
3. If not on Facebook, the extension opens `facebook.com/groups` – wait for it to load, then click again.
4. Use the **Max members** filter to hide large groups, then click **Leave** to open a group's membership page.

### Find Groups
1. Switch to the **Find Groups** tab.
2. Type keywords (e.g. `photography`, `cooking NYC`) and press **Enter** or click **Search**.
3. The extension navigates to Facebook's group search – wait for results, then click **Search** again.
4. Browse results with member counts; click **Join** to open a group.

## Files

| File | Purpose |
|------|---------|
| `manifest.json` | Chrome extension manifest (MV3) |
| `popup.html` | Extension popup UI |
| `popup.css` | Popup styles |
| `popup.js` | Popup logic (group loading, filtering, sorting, search) |
| `content.js` | Content script injected into Facebook pages |
| `background.js` | Service worker |
| `icons/` | Extension icons (16 × 16, 48 × 48, 128 × 128) |

## Permissions

| Permission | Why |
|-----------|-----|
| `activeTab` | Read the currently active Facebook tab |
| `scripting` | Inject the extraction function into Facebook pages |
| `storage` | (Reserved for future caching) |
| `tabs` | Navigate to Facebook groups / search pages |
| `*://*.facebook.com/*` | Access Facebook pages to extract group data |
