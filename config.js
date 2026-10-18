// ---------------------------------------------------------------------------
// Connect the site to your Google Sheet.
//
// 1. In Google Sheets: File > Share > Publish to web.
// 2. For EACH tab below pick the tab in the first dropdown, choose "Comma-separated
//    values (.csv)", click Publish, and copy the link.
// 3. Paste each link between the quotes. Leave a link empty to use the copy
//    bundled in ./data/ (exported from the workbook).
//
// Links look like:
// https://docs.google.com/spreadsheets/d/e/2PACX-.../pub?gid=123456&single=true&output=csv
// ---------------------------------------------------------------------------
window.TRACKER_CONFIG = {
  // Apps Script web app URL (see README, "Enable editing"). Leave empty for a read-only site.
  writeUrl: "https://script.google.com/macros/s/AKfycbwlNBYph9r9_p4JDQWshg1JBHhM8Hkl2lVyAe-4zEQ/dev",
  sources: {
    guests:   "https://docs.google.com/spreadsheets/d/e/2PACX-1vTNcFyXdsa3r52DMrs7yn6BhiJxha4hLX_lthIh2swE1jdqSWLyLeCZ5-qYHiZ7fYH_SQFLi6iV547i/pub?gid=771095474&single=true&output=csv",   // tab "FINAL"                      (names, PAX, shirt size, sarees, ...)
    rooms:    "https://docs.google.com/spreadsheets/d/e/2PACX-1vTNcFyXdsa3r52DMrs7yn6BhiJxha4hLX_lthIh2swE1jdqSWLyLeCZ5-qYHiZ7fYH_SQFLi6iV547i/pub?gid=210364121&single=true&output=csv",   // tab "Copy of Room Allocation1"   (room number -> guest)
    works:    "https://docs.google.com/spreadsheets/d/e/2PACX-1vTNcFyXdsa3r52DMrs7yn6BhiJxha4hLX_lthIh2swE1jdqSWLyLeCZ5-qYHiZ7fYH_SQFLi6iV547i/pub?gid=1375866172&single=true&output=csv",   // tab "works to do"               (pending work)
    advances: "https://docs.google.com/spreadsheets/d/e/2PACX-1vTNcFyXdsa3r52DMrs7yn6BhiJxha4hLX_lthIh2swE1jdqSWLyLeCZ5-qYHiZ7fYH_SQFLi6iV547i/pub?gid=1432770904&single=true&output=csv",   // tab "Advances"                  (payments / balances)
    summary:  "https://docs.google.com/spreadsheets/d/e/2PACX-1vTNcFyXdsa3r52DMrs7yn6BhiJxha4hLX_lthIh2swE1jdqSWLyLeCZ5-qYHiZ7fYH_SQFLi6iV547i/pub?gid=102000808&single=true&output=csv",   // tab "summary"                   (expenses)
  },
  // Local fallback files (exported from the workbook by scripts/export_csv.py)
  local: {
    guests:   "data/FINAL.csv",
    rooms:    "data/Copy-of-Room-Allocation1.csv",
    works:    "data/works-to-do.csv",
    advances: "data/Advances.csv",
    summary:  "data/summary.csv",
  },
};

// Room cluster colours, as in the sheet's legend (ROOM CLUSTER in 'Copy of Room Allocation1')
window.ROOM_CLUSTERS = [
  { key: "cyan",   label: "Room cat1",                 color: "#00FFFF" },
  { key: "yellow", label: "Bhaisaheb",                 color: "#FFFF00" },
  { key: "blue",   label: "FRIENDS",                   color: "#9BC2E6" },
  { key: "red",    label: "LADKI WALE (bride side)",   color: "#FF0000" },
  { key: "none",   label: "No category in sheet",      color: "#E6E6E6" },
];
window.clusterOfRoom = function (room) {
  const n = Number(room);
  const cyan = [101,102,103,104,105,106,107,108,109,110,112,114,126,127,128];
  const yellow = [115,116,117,118,119,120,121,122,124,125];
  const blue = [130,131,132,133,134,135,137,138,227,228,229,230,231,232,233];
  if (cyan.includes(n)) return "cyan";
  if (yellow.includes(n)) return "yellow";
  if (blue.includes(n)) return "blue";
  if (n >= 201 && n <= 238 && ![213,227,228,229,230,231,232,233,234].includes(n)) return "red";
  return "none";
};
