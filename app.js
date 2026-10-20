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
    if (t === "" ) return null;
    const n = Number(t);
    return Number.isNaN(n) ? null : n;
  };
  const yes = (s) => /^y/i.test(String(s ?? "").trim());
  const fmt = (n) => (n === null || n === undefined ? "—" : Math.round(n).toLocaleString("en-IN"));
  const size = (s) => { const n = num(s); return n === null ? "" : String(Math.round(n)); };

  // CSV parser (handles quotes, commas and newlines inside quotes)
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

  // Turn rows into objects keyed by normalised header text
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
  function warn(msg) { $("#err").innerHTML += `<div class="err">${esc(msg)}</div>`; }

  // ---------- data model ----------
  const D = { guests: [], people: new Map(), rooms: new Map(), works: [], advances: [], expenses: { booked: [], actual: [], common: [] }, sources: {} };

  function buildModel(gRows, rRows, wRows, aRows, sRows) {
    // Guests (FINAL)
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
      phone: yes(col(o, "On phone")),
      shirt: size(col(o, "Shirt Size")),
      sarees: num(col(o, "Sarees")) || 0,
    }));
    for (const x of D.guests) D.people.set(norm(x.name), { name: x.name, guest: x, rooms: [] });

    // Room allocation (Copy of Room Allocation1)
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

    // Pending work (works to do)
    D.works = toObjects(wRows, 0).filter((o) => col(o, "Pending work").trim() !== "").map((o) => ({
      task: col(o, "Pending work"),
      initiated: col(o, "Initiated or not"),
      status: col(o, "Final or pending").toLowerCase().includes("done") ? "done" : (col(o, "Final or pending") ? "pending" : ""),
      statusText: col(o, "Final or pending"),
      priority: col(o, "Priority"),
      remark: col(o, "Remark"),
    }));

    // Payments (Advances)
    D.advances = toObjects(aRows, 0).filter((o) => col(o, "Purpose").trim() !== "").map((o) => {
      const total = num(col(o, "Total Value/Rate"));
      const paid = num(col(o, "Advance paid"));
      let balance = num(col(o, "Balance amount"));
      if (balance === null && total !== null) balance = total - (paid ?? 0);
      return { purpose: col(o, "Purpose"), contact: col(o, "Name of Contact person"), total, paid, balance,
               date: col(o, "date of Advance Pymnt"), phone: col(o, "Contact No"), room: col(o, "ROOM ClusterNO") };
    });

    // Expenses (summary): section headers switch the bucket, rows with a head and an amount are items
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

  // ---------- views ----------
  const VIEWS = {};
  let current = "find";

  function clusterSwatch(room) {
    const c = window.ROOM_CLUSTERS.find((x) => x.key === window.clusterOfRoom(room));
    return `<span class="swatch" style="background:${c.color}"></span>${esc(c.label)}`;
  }
  function floorOf(room) { return Number(room) >= 200 ? `2nd floor (above ${Number(room) - 100})` : `1st floor (partner ${Number(room) + 100})`; }

  function guestCard(p) {
    const g = p.guest;
    const rooms = [...new Set(p.rooms)];
    const roomsHtml = rooms.length
      ? rooms.map((r) => `<span class="chip">${esc(r)}</span>`).join("")
      : `<span class="muted">not allocated</span>`;
    const saree = g ? (g.sarees > 0 ? `<span class="ok">Yes, ${g.sarees}</span>` : `<span class="muted">No</span>`) : `<span class="muted">—</span>`;
    const shirt = g && g.shirt ? esc(g.shirt) : `<span class="muted">not entered</span>`;
    return `<div class="card">
      <h3>${esc(p.name)}</h3>${writeBtn(p.name, "Edit")}
      <div>${roomsHtml}</div>
      <dl>
        <dt>Category</dt><dd>${g ? esc(g.category || "—") : "not in guest list"}</dd>
        <dt>Expected PAX</dt><dd>${g ? fmt(g.pax) : "—"}</dd>
        <dt>Invitation</dt><dd>${g ? esc(g.invitation || "—") : "—"}</dd>
        <dt>Marriage function</dt><dd>${g ? (g.function ? "Yes" : "No") : "—"}</dd>
        <dt>Rooms day I / II</dt><dd>${g ? `${fmt(g.roomsDay1)} / ${fmt(g.roomsDay2)}` : "—"}</dd>
        <dt>Sweets / Return gift</dt><dd>${g ? `${g.sweets ? "Yes" : "No"} / ${g.gift ? "Yes" : "No"}` : "—"}</dd>
        <dt>Invitation on WA</dt><dd>${g ? (g.waSent ? "Sent" : "Not sent") : "—"}</dd>
        <dt>Shirt size</dt><dd>${shirt}</dd>
        <dt>Saree</dt><dd>${saree}</dd>
      </dl>
    </div>`;
  }

  function roomCard(room) {
    const r = D.rooms.get(room);
    if (!r) return `<div class="empty">Room ${esc(room)} is not in the allocation sheet.</div>`;
    const occ = r.occupants.length
      ? r.occupants.map((o) => `<div class="chip">${esc(o.name)}${o.category ? ` · ${esc(o.category)}` : ""}</div>`).join("")
      : `<span class="muted">Empty / not assigned</span>`;
    return `<div class="card">
      <h3>Room ${esc(room)}</h3>
      <dl>
        <dt>Cluster</dt><dd>${clusterSwatch(room)}</dd>
        <dt>Floor</dt><dd>${floorOf(room)}</dd>
        <dt>Occupants</dt><dd>${occ}</dd>
      </dl>
    </div>`;
  }

  VIEWS.find = function (q) {
    const box = $("#view");
    const query = q.trim();
    if (!query) {
      box.innerHTML = `<div class="empty">Type a guest name or a room number above. Examples: <b>Akash</b>, <b>Sonu</b>, <b>104</b>, <b>215</b>.</div>`;
      return;
    }
    if (/^\d{2,3}$/.test(query)) {
      const room = String(Number(query));
      const roomHtml = roomCard(room);
      const partner = Number(room) >= 200 ? String(Number(room) - 100) : String(Number(room) + 100);
      const people = [...D.people.values()].filter((p) => p.rooms.includes(room));
      box.innerHTML = `<div class="grid">${roomHtml}</div>
        ${D.rooms.has(partner) ? `<p class="muted">Room ${esc(room)} partner room: ${esc(partner)}</p>` : ""}
        <div class="section-title">Guests in room ${esc(room)}</div>
        <div class="grid">${people.length ? people.map(guestCard).join("") : `<div class="empty">No guest details found.</div>`}</div>`;
      return;
    }
    const k = norm(query);
    const hits = [...D.people.values()].filter((p) => norm(p.name).includes(k));
    if (!hits.length) { box.innerHTML = `<div class="empty">No guest matches "${esc(query)}".</div>${canWrite() ? `<p>${writeBtn(query, "Add \"" + esc(query) + "\" as a new guest")}</p>` : ""}`; return; }
    box.innerHTML = `<div class="grid">${hits.slice(0, 60).map(guestCard).join("")}</div>
      ${hits.length > 60 ? `<p class="muted">Showing 60 of ${hits.length}. Type more letters to narrow down.</p>` : ""}`;
  };

  VIEWS.shirts = function () {
    const gs = D.guests;
    const bySize = {};
    gs.forEach((g) => { if (g.shirt) bySize[g.shirt] = (bySize[g.shirt] || 0) + 1; });
    const sizes = Object.keys(bySize).sort((a, b) => a - b);
    const withSaree = gs.filter((g) => g.sarees > 0);
    const f = (window.__shirtFilter = window.__shirtFilter || { saree: "all", size: "all" });
    const rows = gs.filter((g) => (f.saree === "all" || (f.saree === "yes" ? g.sarees > 0 : g.sarees === 0)) && (f.size === "all" || g.shirt === f.size));
    $("#view").innerHTML = `
      <div class="section-title">Shirt sizes (guests with a size entered)</div>
      <div class="legend">${sizes.map((s) => `<span class="chip">${esc(s)}: ${bySize[s]}</span>`).join("") || "<span class='muted'>none entered</span>"}</div>
      <div class="controls">
        <label>Saree: <select id="f-saree"><option value="all">All</option><option value="yes">Give saree</option><option value="no">No saree</option></select></label>
        <label>Shirt size: <select id="f-size"><option value="all">All</option>${sizes.map((s) => `<option value="${esc(s)}">${esc(s)}</option>`).join("")}</select></label>
        <span class="muted">${withSaree.length} guests get sarees (${gs.reduce((a, g) => a + g.sarees, 0)} sarees in total)</span>
      </div>
      <div class="table-wrap"><table><thead><tr><th>Name</th><th>Category</th><th>Shirt size</th><th>Saree</th><th>Rooms</th></tr></thead><tbody>
      ${rows.map((g) => `<tr><td>${esc(g.name)}</td><td>${esc(g.category)}</td><td>${esc(g.shirt || "—")}</td>
        <td>${g.sarees > 0 ? `<span class="ok">Yes, ${g.sarees}</span>` : `<span class="muted">No</span>`}</td>
        <td>${esc([...new Set((D.people.get(norm(g.name)) || { rooms: [] }).rooms)].join(", ") || "—")}</td></tr>`).join("")}
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
        <td>${canWrite() ? `<select class="work-status" data-task="${esc(w.task)}"><option value="pending" ${w.status !== "done" ? "selected" : ""}>pending</option><option value="done" ${w.status === "done" ? "selected" : ""}>done</option></select>` : `<span class="${w.status === "done" ? "ok" : "warn"}">${esc(w.statusText || "—")}</span>`}</td><td>${esc(w.priority || "—")}</td><td>${esc(w.remark)}</td></tr>`).join("") || `<tr><td colspan="5" class="muted">Nothing here.</td></tr>`}
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
        <td class="${a.balance === null ? "muted" : a.balance > 0 ? "warn" : "ok"}">${a.balance === null ? "not entered" : fmt(a.balance)}</td><td>${esc(a.date)}</td><td>${canWrite() ? `<button class="tab" data-pay="${esc(a.purpose)}">+ Payment</button>` : ""}</td></tr>`).join("") || `<tr><td colspan="7" class="muted">No payments to show.</td></tr>`}
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

  // ---------- header stats ----------
  function renderStats() {
    const pax = D.guests.reduce((s, g) => s + (g.pax || 0), 0);
    const sarees = D.guests.reduce((s, g) => s + (g.sarees || 0), 0);
    const pendWork = D.works.filter((w) => w.status === "pending").length;
    const due = D.advances.reduce((s, a) => s + (a.balance > 0 ? a.balance : 0), 0);
    const exp = sumAll();
    $("#stats").innerHTML = [
      [D.guests.length, "Guests in list"],
      [pax, "Expected PAX"],
      [sarees, "Sarees to give"],
      [pendWork, "Pending work items"],
      ["₹" + fmt(due), "Payments still due"],
      ["₹" + fmt(exp), "Total expenses"],
    ].map(([v, l]) => `<div class="stat"><b>${v}</b><span>${l}</span></div>`).join("");
  }
  function sumAll() { return ["actual", "common"].reduce((s, k) => s + D.expenses[k].reduce((a, x) => a + x.amount, 0), 0); }


  // ---------- editing (writes go to the Google Sheet through the Apps Script web app) ----------
  const canWrite = () => !!(window.TRACKER_CONFIG && window.TRACKER_CONFIG.writeUrl);
  const getPw = () => { try { return sessionStorage.getItem("trackerPw") || ""; } catch (e) { return ""; } };
  const setPw = (v) => { try { sessionStorage.setItem("trackerPw", v); } catch (e) {} };
  function writeBtn(name, label) { return canWrite() ? `<button class="tab" data-edit-name="${esc(name)}">${label}</button>` : ""; }

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

  const EDIT_FIELDS = [
    { k: "category", h: "Category Relative/Friend", label: "Category (R / F / O / S / BS …)", type: "text" },
    { k: "pax", h: "Expect. PAX", label: "Expected PAX", type: "number" },
    { k: "invitation", h: "Invitation", label: "Invitation (B / M)", type: "text" },
    { k: "function", h: "Marriage function", label: "Attends marriage function", type: "yn" },
    { k: "roomsDay1", h: "Rooms Required day-I", label: "Rooms day I", type: "number" },
    { k: "roomsDay2", h: "Rooms Required Day-II", label: "Rooms day II", type: "number" },
    { k: "sweets", h: "Sweets", label: "Sweets given", type: "yn" },
    { k: "gift", h: "Return Gift", label: "Return gift given", type: "yn" },
    { k: "waSent", h: "Invitation Sent on WA", label: "Invitation sent on WhatsApp", type: "yn" },
    { k: "shirt", h: "Shirt Size", label: "Shirt size", type: "number" },
    { k: "sarees", h: "Sarees", label: "Number of sarees", type: "number" },
  ];

  function openEditor(name) {
    const p = D.people.get(norm(name)) || { name, guest: null, rooms: [] };
    const g = p.guest || { category: "", pax: null, invitation: "", function: false, roomsDay1: null, roomsDay2: null,
                           sweets: false, gift: false, waSent: false, shirt: "", sarees: 0 };
    const val = (f) => {
      const v = g[f.k === "category" ? "category" : f.k];
      return f.type === "yn" ? !!v : (v ?? "");
    };
    const rows = EDIT_FIELDS.map((f) => {
      const v = val(f);
      const input = f.type === "yn"
        ? `<input type="checkbox" data-k="${f.k}" ${v ? "checked" : ""}>`
        : `<input data-k="${f.k}" type="${f.type === "number" ? "number" : "text"}" value="${esc(v)}" style="width:100%">`;
      return `<label style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin:6px 0">${esc(f.label)} ${input}</label>`;
    }).join("");
    const wrap = document.createElement("div");
    wrap.id = "editor";
    wrap.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,.45);display:flex;align-items:flex-start;justify-content:center;padding:16px;overflow:auto;z-index:50";
    wrap.innerHTML = `<div class="card" style="max-width:460px;width:100%;margin-top:30px">
      <h3>${p.guest ? "Edit" : "Add new guest:"} ${esc(p.name)}</h3>
      <p class="muted" style="margin:0 0 8px">Changes are written to the Google Sheet. Leave a field as it is to keep it.</p>
      ${rows}
      <label style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin:6px 0">Room(s) <input id="ed-rooms" type="text" value="${esc([...new Set(p.rooms)].join(", "))}" placeholder="e.g. 104 or 104, 204" style="width:60%"></label>
      <label style="display:block;margin-top:10px">Edit password <input id="ed-pw" type="password" value="${esc(getPw())}" style="width:100%"></label>
      <div id="ed-msg" class="err" style="display:none"></div>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px">
        <button class="tab" id="ed-cancel">Cancel</button>
        <button class="tab active" id="ed-save">Save to sheet</button>
      </div></div>`;
    document.body.appendChild(wrap);
    wrap.addEventListener("click", (e) => { if (e.target === wrap || e.target.id === "ed-cancel") wrap.remove(); });
    $("#ed-save").addEventListener("click", async () => {
      const btn = $("#ed-save"); const msg = $("#ed-msg");
      msg.style.display = "none";
      const changed = {}; const local = {};
      EDIT_FIELDS.forEach((f) => {
        const el = wrap.querySelector(`[data-k="${f.k}"]`);
        const now = f.type === "yn" ? el.checked : el.value.trim();
        const before = val(f);
        const same = f.type === "yn" ? now === !!before : String(now) === String(before ?? "");
        if (same) return;
        const h = f.type === "yn" ? (now ? "y" : "") : now;
        changed[f.h] = h;
        local[f.k] = f.type === "yn" ? !!now : (f.type === "number" ? (now === "" ? null : Number(now)) : now);
      });
      const newRooms = ($("#ed-rooms").value || "").replace(/\s+/g, "").split(",").filter(Boolean);
      const oldRooms = [...new Set(p.rooms)];
      const roomsChanged = newRooms.join(",") !== oldRooms.join(",");
      if (roomsChanged && newRooms.some((r) => !/^\d{3}$/.test(r))) {
        msg.textContent = "Room numbers must be 3 digits, separated by commas (e.g. 104, 204)."; msg.style.display = "block";
        return;
      }
      if (!Object.keys(changed).length && !roomsChanged && p.guest) { wrap.remove(); return; }
      setPw($("#ed-pw").value);
      btn.disabled = true; btn.textContent = "Saving…";
      try {
        if (Object.keys(changed).length || !p.guest) {
          if (p.guest) await postWrite({ action: "updateGuest", name: p.name, fields: changed });
          else await postWrite({ action: "addGuest", name: p.name, fields: changed });
          applyGuestLocal(p.name, local);
        }
        if (roomsChanged) {
          await postWrite({ action: "setRooms", name: p.name, rooms: newRooms });
          applyRoomsLocal(p.name, newRooms);
        }
        wrap.remove();
        show(current);
      } catch (err) {
        msg.textContent = "Not saved: " + err.message; msg.style.display = "block";
        btn.disabled = false; btn.textContent = "Save to sheet";
      }
    });
  }

  // Update the in-page room map after a room change (the sheet is updated by the script)
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

  function applyGuestLocal(name, local) {
    const k = norm(name);
    const p = D.people.get(k) || { name, guest: null, rooms: [] };
    if (!D.people.has(k)) D.people.set(k, p);
    if (!p.guest) {
      p.guest = { name, category: "", pax: null, invitation: "", function: false, roomsDay1: null, roomsDay2: null,
                  sweets: false, gift: false, waSent: false, shirt: "", sarees: 0 };
      D.guests.push(p.guest);
    }
    Object.assign(p.guest, local);
    if ("shirt" in local) p.guest.shirt = String(local.shirt ?? "");
  }

  // Work status: change the dropdown, the sheet is updated straight away
  function bindTableEvents() {
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

  // ---------- wiring ----------
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
      bindTableEvents();
      show("find");
    } catch (e) {
      $("#status").textContent = "Could not load data.";
      warn("Error: " + e.message + ". Open the site through a web address (GitHub Pages or a local server), not by double-clicking the file.");
    }
  })();
})();
