(function () {
  "use strict";

  // ---------- helpers ----------
  const $ = (s) => document.querySelector(s);
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const norm = (s) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const hkey = (s) => String(s ?? "").toLowerCase().replace(/\s+/g, " ").trim();
  const num = (s) => {
    if (s === null || s === undefined) return null;
    const t = String(s).replace(/[,₹\s]/g, "");
    if (t === "") return null;
    const n = Number(t);
    return Number.isNaN(n) ? null : n;
  };
  const yes = (s) => /^y/i.test(String(s ?? "").trim());
  const fmt = (n) => (n === null || n === undefined ? "—" : Math.round(n).toLocaleString("en-IN"));
  const size = (s) => { const n = num(s); return n === null ? "" : String(Math.round(n)); };
  const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => String(a + i));
  const canWrite = () => !!(window.TRACKER_CONFIG && window.TRACKER_CONFIG.writeUrl);
  const getPw = () => { try { return sessionStorage.getItem("trackerPw") || ""; } catch (e) { return ""; } };
  const setPw = (v) => { try { sessionStorage.setItem("trackerPw", v); } catch (e) {} };

  // CSV parser (quotes, commas and newlines inside quotes)
  function parseCSV(text) {
    const rows = []; let row = []; let f = ""; let q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) {
        if (c === '"' && text[i + 1] === '"') { f += '"'; i++; }
        else if (c === '"') q = false;
        else f += c;
      } else if (c === '"') q = true;
      else if (c === ",") { row.push(f); f = ""; }
      else if (c === "\n" || c === "\r") {
        if (c === "\r" && text[i + 1] === "\n") i++;
        row.push(f); rows.push(row); row = []; f = "";
      } else f += c;
    }
    if (f !== "" || row.length) { row.push(f); rows.push(row); }
    return rows.filter((r) => r.some((x) => String(x).trim() !== ""));
  }
  function toObjects(rows, headerRow = 0) {
    const head = rows[headerRow].map(hkey);
    return rows.slice(headerRow + 1).map((r) => {
      const o = {};
      head.forEach((h, i) => { if (h) o[h] = (r[i] ?? "").trim(); });
      o.__raw = r;
      return o;
    });
  }
  const col = (o, ...names) => { for (const n of names) { const v = o[hkey(n)]; if (v !== undefined) return v; } return ""; };

  // ---------- loading ----------
  function warn(msg) { $("#err").innerHTML += `<div class="err">${esc(msg)}</div>`; }
  async function loadCSV(key) {
    const cfg = window.TRACKER_CONFIG;
    const remote = cfg.sources[key];
    if (remote) {
      try {
        const r = await fetch(remote, { cache: "no-store" });
        if (!r.ok) throw new Error("HTTP " + r.status);
        const t = await r.text();
        if (t.trim().startsWith("<")) throw new Error("not CSV (is the sheet published?)");
        return { rows: parseCSV(t), source: "live" };
      } catch (e) {
        warn(`Could not load live "${key}" (${e.message}). Using the bundled copy.`);
      }
    }
    const r = await fetch(cfg.local[key], { cache: "no-store" });
    return { rows: parseCSV(await r.text()), source: "bundled" };
  }

  // ---------- data model ----------
  const D = { guests: [], people: new Map(), rooms: new Map(), works: [], advances: [], expenses: { booked: [], actual: [], common: [] } };

  function buildModel(gRows, rRows, wRows, aRows, sRows) {
    const g = toObjects(gRows, 0).filter((o) => col(o, "Name").trim() !== "");
    D.guests = g.map((o) => ({
      name: col(o, "Name"),
      category: col(o, "Category Relative/Friend"),
      pax: num(col(o, "Expect. PAX")),
      invitation: col(o, "Invitation"),
      function: yes(col(o, "Marriage function")),
      roomsDay1: num(col(o, "Rooms Required day-I")),
      roomsDay2: num(col(o, "Rooms Required Day-II")),
      sweets: yes(col(o, "Sweets")),
      gift: yes(col(o, "Return Gift")),
      waSent: yes(col(o, "Invitation Sent on WA")),
      shirt: size(col(o, "Shirt Size")),
      sarees: num(col(o, "Sarees")) || 0,
      checkedIn: yes(col(o, "Checked in")),
      sareeGiven: yes(col(o, "Saree given")),
      shirtGiven: yes(col(o, "Shirt given")),
      sareePacked: yes(col(o, "Saree packed")),
      shirtPacked: yes(col(o, "Shirt packed")),
      giftPacked: yes(col(o, "Gift packed")),
    }));
    for (const x of D.guests) D.people.set(norm(x.name), { name: x.name, guest: x, rooms: [] });

    const r = toObjects(rRows, 0).filter((o) => col(o, "ROOM NO").trim() !== "");
    for (const o of r) {
      const room = String(Math.round(num(col(o, "ROOM NO"))));
      if (!D.rooms.has(room)) D.rooms.set(room, { room, cluster: window.clusterOfRoom(room), occupants: [] });
      const name = col(o, "Name").trim();
      if (name) {
        D.rooms.get(room).occupants.push({ name, category: col(o, "Category Relative/Friend") });
        const k = norm(name);
        if (!D.people.has(k)) D.people.set(k, { name, guest: null, rooms: [] });
        D.people.get(k).rooms.push(room);
      }
    }

    D.works = toObjects(wRows, 0).filter((o) => col(o, "Pending work").trim() !== "").map((o) => ({
      task: col(o, "Pending work"),
      initiated: col(o, "Initiated or not"),
      status: col(o, "Final or pending").toLowerCase().includes("done") ? "done" : (col(o, "Final or pending") ? "pending" : ""),
      statusText: col(o, "Final or pending"),
      priority: col(o, "Priority"),
      remark: col(o, "Remark"),
    }));

    D.advances = toObjects(aRows, 0).filter((o) => col(o, "Purpose").trim() !== "").map((o) => {
      const total = num(col(o, "Total Value/Rate"));
      const paid = num(col(o, "Advance paid"));
      let balance = num(col(o, "Balance amount"));
      if (balance === null && total !== null) balance = total - (paid ?? 0);
      return { purpose: col(o, "Purpose"), contact: col(o, "Name of Contact person"), total, paid, balance,
               date: col(o, "date of Advance Pymnt"), phone: col(o, "Contact No"), room: col(o, "ROOM ClusterNO") };
    });

    let section = null;
    for (const row of sRows) {
      const line = row.join(" ").toLowerCase();
      if (line.includes("banquest expenses head booked")) { section = "booked"; continue; }
      if (line.includes("banquest expected actual")) { section = "actual"; continue; }
      if (line.includes("other expenses common")) { section = "common"; continue; }
      if (!section) continue;
      const head = (row[2] ?? "").trim();
      if (!head || /^expense head$/i.test(head)) continue;
      const rate = num(row[3]), qty = num(row[4]);
      let amount = num(row[5]);
      if (amount === null && rate !== null && qty !== null) amount = rate * qty;
      if (amount === null) continue;
      D.expenses[section].push({ head, date: (row[1] ?? "").trim(), rate, qty, amount });
    }
  }

  // ---------- field definitions (used by the editor and the save logic) ----------
  // kind: yn = Yes/No (stored as "y" or blank), num = number, text = text
  const EDIT_FIELDS = [
    { k: "category", h: "Category Relative/Friend", label: "Category", kind: "text", group: "Guest details", opts: () => uniq(["R", "F", "F-JK", "O", "M"], D.guests.map((g) => g.category)) },
    { k: "pax", h: "Expect. PAX", label: "Expected PAX", kind: "num", group: "Guest details", opts: () => range(0, 20) },
    { k: "invitation", h: "Invitation", label: "Invitation type", kind: "text", group: "Guest details", opts: () => ["B", "M"] },
    { k: "function", h: "Marriage function", label: "Attends marriage function", kind: "yn", group: "Guest details" },
    { k: "roomsDay1", h: "Rooms Required day-I", label: "Rooms needed, day I", kind: "num", group: "Guest details", opts: () => range(0, 5) },
    { k: "roomsDay2", h: "Rooms Required Day-II", label: "Rooms needed, day II", kind: "num", group: "Guest details", opts: () => range(0, 5) },
    { k: "waSent", h: "Invitation Sent on WA", label: "Invitation sent on WhatsApp", kind: "yn", group: "Guest details" },
    { k: "sweets", h: "Sweets", label: "Sweets to be given on wedding day", kind: "yn", group: "Gifts & sarees" },
    { k: "gift", h: "Return Gift", label: "Return gift to be given", kind: "yn", group: "Gifts & sarees" },
    { k: "sarees", h: "Sarees", label: "Sarees to be given", kind: "num", group: "Gifts & sarees", opts: () => range(0, 6) },
    { k: "shirt", h: "Shirt Size", label: "Shirt size", kind: "text", group: "Gifts & sarees", opts: () => uniq(range(36, 48), D.guests.map((g) => g.shirt)) },
    { k: "checkedIn", h: "Checked in", label: "Checked in (green) / not yet (red)", kind: "yn", group: "Check-in & handover" },
    { k: "sareeGiven", h: "Saree given", label: "Saree handed over", kind: "yn", group: "Check-in & handover" },
    { k: "shirtGiven", h: "Shirt given", label: "Shirt handed over", kind: "yn", group: "Check-in & handover" },
    { k: "sareePacked", h: "Saree packed", label: "Saree packed", kind: "yn", group: "Packing" },
    { k: "shirtPacked", h: "Shirt packed", label: "Shirt packed", kind: "yn", group: "Packing" },
    { k: "giftPacked", h: "Gift packed", label: "Gift packed", kind: "yn", group: "Packing" },
  ];
  const fieldBy = (k) => EDIT_FIELDS.find((f) => f.k === k);
  function uniq(...lists) { const s = new Set(); lists.flat().forEach((v) => { if (v !== "" && v != null) s.add(String(v)); }); return [...s]; }
  function optionsFor(f, current) {
    if (f.kind === "yn") return [["", "No"], ["y", "Yes"]];
    const base = f.opts ? f.opts() : [];
    const list = [...new Set([...base, current].filter((v) => v !== "" && v != null))];
    return [["", "—"], ...list.map((v) => [String(v), String(v)])];
  }
  function currentStr(f, g) {
    const v = g ? g[f.k] : undefined;
    if (f.kind === "yn") return v ? "y" : "";
    return v === null || v === undefined ? "" : String(v);
  }

  // ---------- views ----------
  const VIEWS = {};
  let current = "find";

  function clusterSwatch(room) {
    const c = window.ROOM_CLUSTERS.find((x) => x.key === window.clusterOfRoom(room));
    return `<span class="swatch" style="background:${c.color}"></span>${esc(c.label)}`;
  }
  function floorOf(room) { return Number(room) >= 200 ? `2nd floor (above ${Number(room) - 100})` : `1st floor (partner ${Number(room) + 100})`; }
  const tick = (on, onTxt, offTxt) => on ? `<span class="ok">✔ ${onTxt}</span>` : `<span class="warn">${offTxt}</span>`;

  function guestCard(p) {
    const g = p.guest;
    const rooms = [...new Set(p.rooms)];
    const roomsHtml = rooms.length ? rooms.map((r) => `<span class="chip">${esc(r)}</span>`).join("") : `<span class="muted">not allocated</span>`;
    const dot = !g ? "grey" : g.checkedIn ? "green" : "red";
    const statusTxt = !g ? "Not in guest list" : g.checkedIn ? "Checked in" : "Not checked in";
    const btn = (key, on, onTxt, offTxt) => (canWrite() && g)
      ? `<button class="tog ${on ? "on" : ""}" data-toggle="${key}" data-name="${esc(p.name)}">${on ? onTxt : offTxt}</button>` : "";
    const actions = canWrite() ? `<div class="actions">
        ${btn("checkedIn", g && g.checkedIn, "Checked in ✔ (undo)", "Mark checked in")}
        ${btn("sareeGiven", g && g.sareeGiven, "Saree given ✔ (undo)", "Mark saree given")}
        ${btn("shirtGiven", g && g.shirtGiven, "Shirt given ✔ (undo)", "Mark shirt given")}
        ${btn("sareePacked", g && g.sareePacked, "Saree packed ✔ (undo)", "Mark saree packed")}
        ${btn("shirtPacked", g && g.shirtPacked, "Shirt packed ✔ (undo)", "Mark shirt packed")}
        ${btn("giftPacked", g && g.giftPacked, "Gift packed ✔ (undo)", "Mark gift packed")}
        <button class="tab" data-edit-name="${esc(p.name)}">${g ? "Edit" : "Add to guest list"}</button>
      </div>` : "";
    const saree = g ? (g.sarees > 0 ? `${g.sarees} to give · ${tick(g.sareeGiven, "given", "not given yet")}` : `<span class="muted">none</span>`) : "—";
    const shirt = g ? (g.shirt ? `${esc(g.shirt)} · ${tick(g.shirtGiven, "given", "not given yet")}` : `<span class="muted">not entered</span>`) : "—";
    return `<div class="card">
      <div class="gh"><span class="dot ${dot}" title="${statusTxt}"></span><h3>${esc(p.name)}</h3></div>
      <div class="muted small">${statusTxt}</div>
      <div style="margin-top:6px">${roomsHtml}</div>
      ${actions}
      <dl>
        <dt>Category</dt><dd>${g ? esc(g.category || "—") : "—"}</dd>
        <dt>Expected PAX</dt><dd>${g ? fmt(g.pax) : "—"}</dd>
        <dt>Invitation</dt><dd>${g ? esc(g.invitation || "—") : "—"}</dd>
        <dt>Marriage function</dt><dd>${g ? (g.function ? "Attends" : "No") : "—"}</dd>
        <dt>Rooms needed I / II</dt><dd>${g ? `${fmt(g.roomsDay1)} / ${fmt(g.roomsDay2)}` : "—"}</dd>
        <dt>Sweets on wedding day</dt><dd>${g ? (g.sweets ? "To be given" : "No") : "—"}</dd>
        <dt>Return gift</dt><dd>${g ? (g.gift ? "To be given" : "No") : "—"}</dd>
        <dt>Invitation on WA</dt><dd>${g ? (g.waSent ? "Sent" : "Not sent") : "—"}</dd>
        <dt>Shirt size</dt><dd>${shirt}</dd>
        <dt>Saree</dt><dd>${saree}</dd>
        <dt>Packed</dt><dd>${g ? `Saree ${g.sareePacked ? "✔" : "✘"} · Shirt ${g.shirtPacked ? "✔" : "✘"} · Gift ${g.giftPacked ? "✔" : "✘"}` : "—"}</dd>
      </dl>
    </div>`;
  }

  // Rooms panel for the opening page: capacity per day, rooms taken by checked-in guests, rooms left
  function roomsPanel() {
    const cap = (window.TRACKER_CONFIG && window.TRACKER_CONFIG.roomCapacity) || { day1: 0, day2: 0 };
    const excluded = new Set(((window.TRACKER_CONFIG && window.TRACKER_CONFIG.roomsExcluded) || []).map(norm));
    const sumRooms = (key, checkedOnly) => D.guests
      .filter((g) => !excluded.has(norm(g.name)))
      .filter((g) => !checkedOnly || g.checkedIn)
      .reduce((s, g) => s + (g[key] || 0), 0);
    const day = (label, key, capacity) => {
      const occupied = sumRooms(key, true);
      const planned = sumRooms(key, false);
      const left = capacity - occupied;
      const cls = left < 0 ? "bad" : left <= 3 ? "warn" : "ok";
      return `<div class="card">
        <h3>${label}</h3>
        <dl>
          <dt>Rooms available in total</dt><dd>${capacity}</dd>
          <dt>Occupied (checked in)</dt><dd><b>${occupied}</b></dd>
          <dt>Rooms left</dt><dd class="${cls}"><b>${left}</b></dd>
          <dt>Planned (all guests)</dt><dd class="muted">${planned}</dd>
        </dl>
      </div>`;
    };
    return `<div class="section-title">Rooms</div>
      <div class="grid">${day("Day 1", "roomsDay1", cap.day1)}${day("Day 2", "roomsDay2", cap.day2)}</div>`;
  }

  VIEWS.find = function (q) {
    const box = $("#view");
    const query = q.trim();
    if (!query) {
      box.innerHTML = roomsPanel() + `<div class="empty">Type a guest name or a room number above. Examples: <b>Akash</b>, <b>Sonu</b>, <b>104</b>, <b>215</b>.</div>`;
      return;
    }
    if (/^\d{2,3}$/.test(query)) {
      const room = String(Number(query));
      const roomHtml = (() => {
        const r = D.rooms.get(room);
        if (!r) return `<div class="empty">Room ${esc(room)} is not in the allocation sheet.</div>`;
        const occ = r.occupants.length ? r.occupants.map((o) => `<div class="chip">${esc(o.name)}${o.category ? ` · ${esc(o.category)}` : ""}</div>`).join("") : `<span class="muted">Empty / not assigned</span>`;
        return `<div class="card"><h3>Room ${esc(room)}</h3><dl>
          <dt>Cluster</dt><dd>${clusterSwatch(room)}</dd>
          <dt>Floor</dt><dd>${floorOf(room)}</dd>
          <dt>Occupants</dt><dd>${occ}</dd></dl></div>`;
      })();
      const partner = Number(room) >= 200 ? String(Number(room) - 100) : String(Number(room) + 100);
      const people = [...D.people.values()].filter((p) => p.rooms.includes(room));
      box.innerHTML = `<div class="grid">${roomHtml}</div>
        ${D.rooms.has(partner) ? `<p class="muted">Partner room: ${esc(partner)}</p>` : ""}
        <div class="section-title">Guests in room ${esc(room)}</div>
        <div class="grid">${people.length ? people.map(guestCard).join("") : `<div class="empty">No guest details found.</div>`}</div>`;
      return;
    }
    const k = norm(query);
    const hits = [...D.people.values()].filter((p) => norm(p.name).includes(k));
    if (!hits.length) {
      box.innerHTML = `<div class="empty">No guest matches "${esc(query)}".</div>${canWrite() ? `<p><button class="tab" data-edit-name="${esc(query)}">Add "${esc(query)}" as a new guest</button></p>` : ""}`;
      return;
    }
    box.innerHTML = `<div class="grid">${hits.slice(0, 60).map(guestCard).join("")}</div>
      ${hits.length > 60 ? `<p class="muted">Showing 60 of ${hits.length}. Type more letters to narrow down.</p>` : ""}`;
  };

  VIEWS.shirts = function () {
    const gs = D.guests;
    const bySize = {};
    gs.forEach((g) => { if (g.shirt) bySize[g.shirt] = (bySize[g.shirt] || 0) + 1; });
    const sizes = Object.keys(bySize).sort((a, b) => a - b);
    const f = (window.__shirtFilter = window.__shirtFilter || { saree: "all", size: "all" });
    const rows = gs.filter((g) => (f.saree === "all" || (f.saree === "yes" ? g.sarees > 0 : g.sarees === 0)) && (f.size === "all" || g.shirt === f.size));
    $("#view").innerHTML = `
      <div class="section-title">Shirt sizes (guests with a size entered)</div>
      <div class="legend">${sizes.map((s) => `<span class="chip">${esc(s)}: ${bySize[s]}</span>`).join("") || "<span class='muted'>none entered</span>"}</div>
      <div class="controls">
        <label>Saree: <select id="f-saree"><option value="all">All</option><option value="yes">Give saree</option><option value="no">No saree</option></select></label>
        <label>Shirt size: <select id="f-size"><option value="all">All</option>${sizes.map((s) => `<option value="${esc(s)}">${esc(s)}</option>`).join("")}</select></label>
        <span class="muted">${gs.filter((g) => g.sarees > 0).length} guests get sarees · ${gs.filter((g) => g.sarees > 0 && !g.sareeGiven).length} still to hand over</span>
      </div>
      <div class="table-wrap"><table><thead><tr><th>Name</th><th>Status</th><th>Shirt size</th><th>Shirt given</th><th>Sarees</th><th>Saree given</th></tr></thead><tbody>
      ${rows.map((g) => `<tr><td>${esc(g.name)}</td>
        <td><span class="dot ${g.checkedIn ? "green" : "red"}"></span> ${g.checkedIn ? "Checked in" : "Not yet"}</td>
        <td>${esc(g.shirt || "—")}</td><td>${g.shirtGiven ? '<span class="ok">✔</span>' : "—"}</td>
        <td>${g.sarees > 0 ? g.sarees : "—"}</td><td>${g.sarees > 0 ? (g.sareeGiven ? '<span class="ok">✔</span>' : '<span class="warn">not yet</span>') : "—"}</td></tr>`).join("")}
      </tbody></table></div>`;
    $("#f-saree").value = f.saree; $("#f-size").value = f.size;
    $("#f-saree").onchange = (e) => { f.saree = e.target.value; VIEWS.shirts(); };
    $("#f-size").onchange = (e) => { f.size = e.target.value; VIEWS.shirts(); };
  };

  VIEWS.work = function () {
    const f = (window.__workFilter = window.__workFilter || "pending");
    const rows = D.works.filter((w) => f === "all" || w.status === f);
    const pend = D.works.filter((w) => w.status === "pending").length;
    $("#view").innerHTML = `
      <div class="controls">
        <select id="f-work"><option value="pending">Pending</option><option value="done">Done</option><option value="all">All</option></select>
        <span class="muted">${pend} pending of ${D.works.length}</span>
      </div>
      <div class="table-wrap"><table><thead><tr><th>Task</th><th>Initiated?</th><th>Status</th><th>Priority</th><th>Remark</th></tr></thead><tbody>
      ${rows.map((w) => `<tr><td>${esc(w.task)}</td><td>${esc(w.initiated || "—")}</td>
        <td>${canWrite() ? `<select class="work-status" data-task="${esc(w.task)}"><option value="pending" ${w.status !== "done" ? "selected" : ""}>pending</option><option value="done" ${w.status === "done" ? "selected" : ""}>done</option></select>` : `<span class="${w.status === "done" ? "ok" : "warn"}">${esc(w.statusText || "—")}</span>`}</td>
        <td>${esc(w.priority || "—")}</td><td>${esc(w.remark)}</td></tr>`).join("") || `<tr><td colspan="5" class="muted">Nothing here.</td></tr>`}
      </tbody></table></div>`;
    $("#f-work").value = f;
    $("#f-work").onchange = (e) => { window.__workFilter = e.target.value; VIEWS.work(); };
  };

  VIEWS.pay = function () {
    const f = (window.__payFilter = window.__payFilter ?? true);
    const rows = D.advances.filter((a) => !f || (a.balance === null || a.balance > 0));
    const totalPaid = D.advances.reduce((s, a) => s + (a.paid || 0), 0);
    const totalBal = D.advances.reduce((s, a) => s + (a.balance > 0 ? a.balance : 0), 0);
    const unknown = D.advances.filter((a) => a.balance === null).length;
    $("#view").innerHTML = `
      <div class="controls">
        <label><input type="checkbox" id="f-pay" ${f ? "checked" : ""}> Only show balances still due</label>
        <span class="muted">Advances paid ₹${fmt(totalPaid)} · Balance still due ₹${fmt(totalBal)}${unknown ? ` · ${unknown} rows with no total entered` : ""}</span>
      </div>
      <div class="table-wrap"><table><thead><tr><th>Purpose</th><th>Contact</th><th>Total</th><th>Advance paid</th><th>Balance</th><th>Date</th><th></th></tr></thead><tbody>
      ${rows.map((a) => `<tr><td>${esc(a.purpose)}</td><td>${esc(a.contact)}<br><span class="muted">${esc(a.phone)}</span></td>
        <td>${fmt(a.total)}</td><td>${fmt(a.paid)}</td>
        <td class="${a.balance === null ? "muted" : a.balance > 0 ? "warn" : "ok"}">${a.balance === null ? "not entered" : fmt(a.balance)}</td><td>${esc(a.date)}</td>
        <td>${canWrite() ? `<button class="tab" data-pay="${esc(a.purpose)}">+ Payment</button>` : ""}</td></tr>`).join("") || `<tr><td colspan="7" class="muted">No payments to show.</td></tr>`}
      </tbody></table></div>`;
    $("#f-pay").onchange = (e) => { window.__payFilter = e.target.checked; VIEWS.pay(); };
  };

  VIEWS.exp = function () {
    const sum = (a) => a.reduce((s, x) => s + x.amount, 0);
    const table = (title, items) => `
      <div class="section-title">${title} <span class="muted">· total ₹${fmt(sum(items))}</span></div>
      <div class="table-wrap"><table><thead><tr><th>Expense head</th><th>Date</th><th>Rate</th><th>Qty / PAX</th><th>Amount</th></tr></thead><tbody>
      ${items.map((x) => `<tr><td>${esc(x.head)}</td><td>${esc(x.date)}</td><td>${fmt(x.rate)}</td><td>${fmt(x.qty)}</td><td>${fmt(x.amount)}</td></tr>`).join("") || `<tr><td colspan="5" class="muted">No items.</td></tr>`}
      </tbody></table></div>`;
    const actual = sum(D.expenses.actual), common = sum(D.expenses.common), booked = sum(D.expenses.booked);
    $("#view").innerHTML = `
      <div class="stats">
        <div class="stat"><b>₹${fmt(actual + common)}</b><span>Total expenses (actual + common)</span></div>
        <div class="stat"><b>₹${fmt(actual)}</b><span>Function-wise (actual counts)</span></div>
        <div class="stat"><b>₹${fmt(common)}</b><span>Common expenses</span></div>
        <div class="stat"><b>₹${fmt(booked)}</b><span>Booked earlier (for reference)</span></div>
      </div>
      ${table("Actual counts", D.expenses.actual)}
      ${table("Other expenses (common)", D.expenses.common)}
      ${table("Booked (earlier plan)", D.expenses.booked)}`;
  };

  // ---------- writing (through the Apps Script web app) ----------
  async function postWrite(payload) {
    const r = await fetch(window.TRACKER_CONFIG.writeUrl, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },   // avoids a CORS preflight on Apps Script
      body: JSON.stringify(Object.assign({ password: getPw() }, payload)),
    });
    const j = await r.json();
    if (!j.ok) throw new Error(j.error || "Save failed");
    return j;
  }

  function applyGuestLocal(name, local) {
    const k = norm(name);
    const p = D.people.get(k) || { name, guest: null, rooms: [] };
    if (!D.people.has(k)) D.people.set(k, p);
    if (!p.guest) {
      p.guest = { name, category: "", pax: null, invitation: "", function: false, roomsDay1: null, roomsDay2: null,
                  sweets: false, gift: false, waSent: false, shirt: "", sarees: 0, checkedIn: false, sareeGiven: false, shirtGiven: false, sareePacked: false, shirtPacked: false, giftPacked: false };
      D.guests.push(p.guest);
    }
    Object.assign(p.guest, local);
  }

  function applyRoomsLocal(name, newRooms) {
    const k = norm(name);
    D.rooms.forEach((r) => { r.occupants = r.occupants.filter((o) => norm(o.name) !== k); });
    const p = D.people.get(k);
    const cat = p && p.guest ? p.guest.category : "";
    newRooms.forEach((room) => {
      if (!D.rooms.has(room)) D.rooms.set(room, { room, cluster: window.clusterOfRoom(room), occupants: [] });
      D.rooms.get(room).occupants.push({ name, category: cat });
    });
    if (p) p.rooms = [...newRooms];
  }

  // ---------- editor ----------
  function openEditor(name) {
    const p = D.people.get(norm(name)) || { name, guest: null, rooms: [] };
    const g = p.guest;
    const sections = ["Guest details", "Gifts & sarees", "Packing", "Check-in & handover"];
    const body = sections.map((sec) => `
      <div class="ed-sec">${sec}</div>
      ${EDIT_FIELDS.filter((f) => f.group === sec).map((f) => {
        const cur = currentStr(f, g);
        const opts = optionsFor(f, cur).map(([v, l]) => `<option value="${esc(v)}" ${v === cur ? "selected" : ""}>${esc(l)}</option>`).join("");
        return `<div class="ed-row"><label for="ed-${f.k}">${esc(f.label)}</label><select id="ed-${f.k}" data-k="${f.k}">${opts}</select></div>`;
      }).join("")}`).join("");

    const wrap = document.createElement("div");
    wrap.id = "editor";
    wrap.className = "modal";
    wrap.innerHTML = `<div class="modal-card" role="dialog" aria-modal="true">
      <div class="modal-head"><h3>${g ? "Edit" : "Add new guest:"} ${esc(p.name)}</h3><button class="x" id="ed-x" aria-label="Close">×</button></div>
      <div class="modal-body">
        <div class="ed-sec">Room</div>
        <div class="ed-row"><label for="ed-rooms">Room(s)</label><input id="ed-rooms" type="text" inputmode="numeric" value="${esc([...new Set(p.rooms)].join(", "))}" placeholder="e.g. 104 or 104, 204"></div>
        ${body}
        <div class="ed-sec">Edit password</div>
        <div class="ed-row"><label for="ed-pw">Password</label><input id="ed-pw" type="password" value="${esc(getPw())}" placeholder="only if your sheet has one"></div>
        <div id="ed-msg" class="err" style="display:none"></div>
      </div>
      <div class="modal-foot"><button class="tab" id="ed-cancel">Cancel</button><button class="tab active" id="ed-save">Save to sheet</button></div>
    </div>`;
    document.body.appendChild(wrap);
    const close = () => wrap.remove();
    wrap.addEventListener("click", (e) => { if (e.target === wrap) close(); });
    $("#ed-x").addEventListener("click", close);
    $("#ed-cancel").addEventListener("click", close);

    $("#ed-save").addEventListener("click", async () => {
      const btn = $("#ed-save"); const msg = $("#ed-msg");
      msg.style.display = "none";
      const changed = {}; const local = {};
      EDIT_FIELDS.forEach((f) => {
        const el = wrap.querySelector(`[data-k="${f.k}"]`);
        const now = el.value;
        if (now === currentStr(f, g)) return;
        changed[f.h] = now;
        local[f.k] = f.kind === "yn" ? now === "y" : f.kind === "num" ? (now === "" ? null : Number(now)) : now;
      });
      const newRooms = ($("#ed-rooms").value || "").replace(/\s+/g, "").split(",").filter(Boolean);
      const roomsChanged = newRooms.join(",") !== [...new Set(p.rooms)].join(",");
      if (roomsChanged && newRooms.some((r) => !/^\d{3}$/.test(r))) {
        msg.textContent = "Room numbers must be 3 digits, separated by commas (e.g. 104, 204)."; msg.style.display = "block";
        return;
      }
      if (!Object.keys(changed).length && !roomsChanged && g) { close(); return; }
      setPw($("#ed-pw").value);
      btn.disabled = true; btn.textContent = "Saving…";
      try {
        if (Object.keys(changed).length || !g) {
          if (g) await postWrite({ action: "updateGuest", name: p.name, fields: changed });
          else await postWrite({ action: "addGuest", name: p.name, fields: changed });
          applyGuestLocal(p.name, local);
        }
        if (roomsChanged) {
          await postWrite({ action: "setRooms", name: p.name, rooms: newRooms });
          applyRoomsLocal(p.name, newRooms);
        }
        close();
        show(current);
      } catch (err) {
        msg.textContent = "Not saved: " + err.message; msg.style.display = "block";
        btn.disabled = false; btn.textContent = "Save to sheet";
      }
    });
  }

  // ---------- table/card events (one listener on the results area) ----------
  function bindEvents() {
    $("#view").addEventListener("change", async (e) => {
      const sel = e.target.closest(".work-status");
      if (!sel) return;
      const w = D.works.find((x) => x.task === sel.dataset.task);
      if (!w) return;
      try {
        await postWrite({ action: "updateWork", task: w.task, status: sel.value });
        w.status = sel.value; w.statusText = sel.value;
        show(current);
      } catch (err) { alert("Not saved: " + err.message); show(current); }
    });
    $("#view").addEventListener("click", async (e) => {
      const ed = e.target.closest("[data-edit-name]");
      if (ed) { openEditor(ed.dataset.editName); return; }

      const tg = e.target.closest("[data-toggle]");
      if (tg) {
        const p = D.people.get(norm(tg.dataset.name));
        if (!p || !p.guest) return;
        const f = fieldBy(tg.dataset.toggle);
        const on = !p.guest[f.k];
        try {
          await postWrite({ action: "updateGuest", name: p.name, fields: { [f.h]: on ? "y" : "" } });
          p.guest[f.k] = on;
          show(current);
        } catch (err) { alert("Not saved: " + err.message); }
        return;
      }

      const pay = e.target.closest("[data-pay]");
      if (pay) {
        const a = D.advances.find((x) => x.purpose === pay.dataset.pay);
        const amount = Number(window.prompt(`Amount received/paid for "${a.purpose}" (₹):`, ""));
        if (!amount || amount <= 0) return;
        const d = new Date();
        const date = [String(d.getDate()).padStart(2, "0"), String(d.getMonth() + 1).padStart(2, "0"), d.getFullYear()].join(".");
        const newPaid = (a.paid || 0) + amount;
        try {
          await postWrite({ action: "updateAdvance", purpose: a.purpose, paid: newPaid, date });
          a.paid = newPaid; a.date = date;
          if (a.total !== null) a.balance = a.total - newPaid;
          show(current);
        } catch (err) { alert("Not saved: " + err.message); }
      }
    });
  }

  // ---------- header stats & navigation ----------
  function sumExpenses() { return ["actual", "common"].reduce((s, k) => s + D.expenses[k].reduce((a, x) => a + x.amount, 0), 0); }
  function renderStats() {
    const pax = D.guests.reduce((s, g) => s + (g.pax || 0), 0);
    const sarees = D.guests.reduce((s, g) => s + (g.sarees || 0), 0);
    const checked = D.guests.filter((g) => g.checkedIn).length;
    const pendWork = D.works.filter((w) => w.status === "pending").length;
    const due = D.advances.reduce((s, a) => s + (a.balance > 0 ? a.balance : 0), 0);
    $("#stats").innerHTML = [
      [`${checked} / ${D.guests.length}`, "Checked in"],
      [pax, "Expected PAX"],
      [sarees, "Sarees to give"],
      [pendWork, "Pending work items"],
      ["₹" + fmt(due), "Payments still due"],
      ["₹" + fmt(sumExpenses()), "Total expenses"],
    ].map(([v, l]) => `<div class="stat"><b>${v}</b><span>${l}</span></div>`).join("");
  }
  function show(view) {
    current = view;
    document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t.dataset.view === view));
    if (view === "find") VIEWS.find($("#q").value); else VIEWS[view]();
  }

  document.querySelectorAll(".tab").forEach((t) => t.addEventListener("click", () => show(t.dataset.view)));
  $("#q").addEventListener("input", (e) => { if (current !== "find") show("find"); else VIEWS.find(e.target.value); });

  (async function init() {
    try {
      const [g, r, w, a, s] = await Promise.all(["guests", "rooms", "works", "advances", "summary"].map(loadCSV));
      buildModel(g.rows, r.rows, w.rows, a.rows, s.rows);
      const live = [g, r, w, a, s].filter((x) => x.source === "live").length;
      $("#status").textContent = `${D.guests.length} guests · ${D.rooms.size} rooms · data: ${live ? "live Google Sheet" : "bundled copy"}`;
      renderStats();
      bindEvents();
      show("find");
    } catch (e) {
      $("#status").textContent = "Could not load data.";
      warn("Error: " + e.message + ". Open the site through a web address (GitHub Pages or a local server), not by double-clicking the file.");
    }
  })();
})();
