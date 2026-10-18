# Utsav Wedding Tracker

A static website (no server, no login) to search guests and rooms and check shirts, sarees,
pending work, payments and expenses. It reads the Google Sheet of the wedding plan.

## Files
- `index.html`, `app.js` – the website
- `config.js` – Google Sheet links and room colours
- `data/` – a copy of each tab (used when no live link is set, or if the link fails)
- `scripts/export_csv.py` – refreshes `data/` from the Excel workbook

## 1. Connect to your Google Sheet (live)
1. Open the Google Sheet → **File → Share → Publish to web**.
2. For each tab below, choose the tab, format **Comma-separated values (.csv)**, click **Publish**, and copy the link:
   - `FINAL` → `sources.guests`
   - `Copy of Room Allocation1` → `sources.rooms`
   - `works to do` → `sources.works`
   - `Advances` → `sources.advances`
   - `summary` → `sources.summary`
3. Paste each link into `config.js` between the quotes.
4. Whenever the sheet changes, reload the site (published CSVs update within a few minutes).

Note: anyone with a published link can read those tabs, so only publish what you are happy to share.

## 2. Host on GitHub Pages (free)
1. Create a new GitHub repository (for example `utsav-tracker`). Public or private repo both work, but private repos need a paid GitHub plan for Pages.
2. Upload all files in this folder (keep the `data/` folder) and commit.
3. In the repository: **Settings → Pages → Build and deployment → Deploy from a branch → main / (root) → Save**.
4. After a minute the site is live at `https://<your-username>.github.io/utsav-tracker/`.

## 3. Using it
- **Find guest / room**: type a name (`Akash`) or a room number (`104`). A room shows its cluster colour, floor and occupants. A guest shows rooms, category, PAX, function, room days, sweets, gift, WA invitation status, shirt size and saree.
- **Shirts & sarees**: sizes count, and filter for guests who get a saree or not.
- **Pending work**: tasks not yet done (filter for done or all).
- **Payments**: advances paid and balance still due per vendor.
- **Expenses**: actual counts, common expenses, and the earlier booked plan for reference.

## Refreshing the bundled copy
If you prefer not to use the live link, update the workbook and run:

    python3 scripts/export_csv.py path/to/Utsav_Marriage_Plan.xlsx

then commit the new `data/` files.

## Notes
- Room colours come from the room-cluster legend in `config.js` (`clusterOfRoom`). Edit that function if a room moves cluster.
- Column N of `FINAL` has no heading in the sheet, so the site does not use it.
- Names are matched ignoring case, spaces and punctuation between the guest list and the room sheet.

## 4. Enable editing from the website (optional)
The published Google Sheet links are read-only. Editing needs a small script attached to the sheet.

1. Open the Google Sheet → **Extensions → Apps Script**.
2. Delete any code in the editor, paste the contents of `scripts/apps-script/Code.gs`, and save.
3. In the editor, select the function `setup` in the toolbar and click **Run**. Approve the permissions prompt.
4. Click **Project Settings** (gear icon) → **Script properties** → open `EDIT_PASSWORD` and set your own password. Save.
5. Click **Deploy → New deployment → Select type: Web app**.
   - Execute as: **Me**
   - Who has access: **Anyone**
   - Click **Deploy**, then copy the **Web app URL** (ends in `/exec`).
6. Open that URL in a browser. You should see `{"ok":true,...}`. This confirms the script works.
7. In `config.js`, paste the URL into `writeUrl`, then commit the file to GitHub.

After that, the site shows **Edit** on guest cards, a status dropdown on pending work, and **+ Payment** on payment rows. Each save is written to the sheet. The password is asked once per browser session.

Notes:
- The password is checked by the script, so it is never stored in the public code. Anyone with the password can change the sheet, so keep it private.
- The site shows the change straight away. The published CSV links can take a few minutes to show the change after a reload.
- Adding a new guest inserts a row below the last guest. The totals row at the bottom of `FINAL` may need its range extended.
- Room changes (moving a guest to another room) are not in the site yet. Tell me if you want them added.
