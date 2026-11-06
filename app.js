import { EX, BLOCKS, DAYS, WEEK_ORDER, BENCHMARKS, PLAN_VERSION } from "./plan.js";
import * as L from "./logic.js";
import * as Store from "./store.js";

let S = Store.emptyState();
const ui = { view: "today", day: null, drafts: new Map(), rest: null, sheet: null, toastTimer: null, open: null };
const $app = document.getElementById("app");
const $sheet = document.getElementById("sheet");
const $rest = document.getElementById("rest");
const $toast = document.getElementById("toast");

const today = () => L.isoDate();
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WD = { MON: "Mon", TUE: "Tue", WED: "Wed", THU: "Thu", FRI: "Fri", SAT: "Sat", SUN: "Sun" };
function fmtDay(iso) { const d = L.parseISO(iso); return `${WD[L.dowCode(iso)]} ${d.getDate()} ${MON[d.getMonth()]}`; }
function applyTheme() {
  const t = S.theme || "auto";
  document.documentElement.dataset.theme = t;
  const dark = t === "dark" || (t === "auto" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = dark ? "#1E2124" : "#ECEEEB";
}
try { window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", applyTheme); } catch {}
function persist() { if (!Store.save(S)) toast("Storage is full. Back up your log from Settings."); }
const UI_KEY = "anchor7.ui";
function saveUi() {
  try { localStorage.setItem(UI_KEY, JSON.stringify({ date: today(), day: ui.day, drafts: [...ui.drafts], rest: ui.rest && !ui.rest.over ? { end: ui.rest.end, total: ui.rest.total } : null })); } catch {}
}
function loadUi() {
  try {
    const u = JSON.parse(localStorage.getItem(UI_KEY) || "null");
    if (!u || u.date !== today()) return;
    if (u.day && DAYS[u.day]) ui.day = u.day;
    if (Array.isArray(u.drafts)) ui.drafts = new Map(u.drafts);
    if (u.rest && u.rest.end > Date.now()) startRest((u.rest.end - Date.now()) / 1000, u.rest.total);
  } catch {}
}
const num = (v) => parseFloat(String(v).trim().replace(",", "."));

// ---------- session helpers ----------

function sessionsOn(date) { return Object.values(S.sessions).filter((s) => s.date === date); }
function hasSets(s) { return !!s && !!s.sets && Object.values(s.sets).some((a) => L.liveSets(a).length); }

// Which plan day is shown on Today: an explicit pick, else a session already
// started today, else today's weekday.
function activeDayCode() {
  if (ui.day) return ui.day;
  const started = sessionsOn(today()).filter((s) => DAYS[s.day] && hasSets(s));
  if (started.length === 1) return started[0].day;
  return L.dowCode(today());
}
function sessionId(date, code) { return `${date}_${DAYS[code].key}`; }
function getSession(date, code) { return S.sessions[sessionId(date, code)] || null; }
function ensureSession(date, code) {
  const id = sessionId(date, code);
  if (!S.sessions[id]) {
    const c = L.cycleInfo(date, S) || { cw: 0, eff: 0, q: 1, w: 1, block: "base", deload: false };
    S.sessions[id] = { id, date, day: code, key: DAYS[code].key, cw: c.cw, eff: c.eff, q: c.q, w: c.w, block: c.block, deload: c.deload, plan: PLAN_VERSION, sets: {} };
  }
  return S.sessions[id];
}
function cycleFor(date, code) {
  const s = getSession(date, code);
  if (s) return { cw: s.cw, eff: s.eff, q: s.q, w: s.w, block: s.block, deload: s.deload, preStart: s.cw < 1 };
  return L.cycleInfo(date, S);
}

// Build the full view model for a day: groups -> items -> rows with live values.
function buildDay(date, code) {
  const sess = getSession(date, code);
  const sid = sessionId(date, code);
  const cycle = cycleFor(date, code);
  const groups = L.dayItems(code, S).map((g) => ({
    ...g,
    items: g.items.map((item) => {
      const pr = L.prescribe(item, { state: S, dayKey: DAYS[code].key, cycle, date, sessionId: sid });
      const logged = sess ? sess.sets[item.id] || [] : [];
      const rows = pr.rows.map((row, i) => {
        const lg = logged[i];
        const d = ui.drafts.get(`${sid}|${item.id}|${i}`);
        const done = !!(lg && lg.w != null);
        return { ...row, i, done, w: done ? lg.w : d ? d.w : row.w, r: done ? lg.r : d ? d.r : row.r, mini: done ? lg.mini || [] : [] };
      });
      return { item, ex: EX[item.id], pr, rows };
    }),
  }));
  const total = groups.reduce((n, g) => n + g.items.reduce((m, it) => m + it.rows.length, 0), 0);
  const done = groups.reduce((n, g) => n + g.items.reduce((m, it) => m + it.rows.filter((r) => r.done).length, 0), 0);
  return { date, code, sid, cycle, groups, total, done };
}

// ---------- render ----------

function render() {
  if (!S.startDate) { $app.innerHTML = onboarding(); syncNav(); return; }
  if (ui.view === "week") $app.innerHTML = weekView();
  else if (ui.view === "progress") $app.innerHTML = progressView();
  else if (ui.view === "settings") $app.innerHTML = settingsView();
  else $app.innerHTML = todayView();
  syncNav();
}
function syncNav() {
  document.querySelectorAll("nav [data-view]").forEach((b) => b.setAttribute("aria-current", b.dataset.view === ui.view ? "page" : "false"));
  document.querySelector("nav").hidden = !S.startDate;
}

function onboarding() {
  const thisTue = L.weekTuesday(today());
  const nextTue = L.addDaysISO(thisTue, 7);
  return `<section class="onboard">
    <h1>Plateload</h1>
    <p class="lead">Your year-long plan, one tap per set. Pick the Tuesday your week 1 begins.</p>
    <button class="big" data-act="start" data-date="${thisTue}">This week, ${fmtDay(thisTue)}</button>
    <button class="big ghost" data-act="start" data-date="${nextTue}">Next week, ${fmtDay(nextTue)}</button>
    <p class="fine">You can change this later in Settings.</p>
  </section>`;
}

function cycleLine(c) {
  if (!c) return "";
  if (c.preStart) return `Week 1 starts ${fmtDay(S.startDate)}`;
  return `Quarter ${c.q}, week ${c.w} of 13, ${c.block === "test" ? "test week" : `${BLOCKS[c.block].name} block`}${c.deload ? ", deload" : ""}`;
}

function banners(c) {
  const out = [];
  if (!c) return "";
  if (c.preStart) out.push(`<div class="banner">Week 1 starts ${fmtDay(S.startDate)}. Sessions you log before then are kept but don't count toward the plan.</div>`);
  if (c.deload) out.push(`<div class="banner calm"><b>Deload week.</b> Half the sets, 10% lighter, 3–4 reps short of failure. No rest-pause or drop sets.</div>`);
  else if (c.block === "test") out.push(`<div class="banner gold"><b>Test week.</b> Heavy lifts get one test set. Everything else is half sets so you go in fresh.</div>`);
  if (!c.deload && !c.preStart && c.w === 4) out.push(`<div class="banner"><b>Joint check.</b> If elbows or shoulders ache, drop Sunday's lateral raises. <button class="link" data-act="toggleSun">${S.skipSunRaises ? "Bring them back" : "Drop them"}</button></div>`);
  const sessCount = Object.values(S.sessions).filter(hasSets).length;
  const since = S.lastExport ? L.daysBetween(L.isoDate(new Date(S.lastExport)), today()) : null;
  if (sessCount >= 3 && (since === null || since > 7)) out.push(`<div class="banner gold">${since === null ? "You haven't backed up your log yet." : `Last backup was ${since} days ago.`} <button class="link" data-act="exportJson">Back up now</button></div>`);
  return out.join("");
}

function todayView() {
  const date = today();
  const code = activeDayCode();
  const head = `<header class="top"><div><p class="date">${fmtDay(date)}</p></div><button class="icon" data-act="go" data-view="settings" aria-label="Settings">${gearSvg()}</button></header>`;
  if (code === "MON") {
    const c = L.cycleInfo(date, S);
    return `${head}<section class="restday"><h1>Rest day</h1><p class="sub">${cycleLine(c)}</p>${banners(c)}
      <p class="lead">Rest and fast day. Have your banana shake with a scoop of whey, and drink plenty of water before tomorrow's heavy session.</p>
      <button class="big" data-act="body">Log bodyweight</button>
      <button class="big ghost" data-act="go" data-view="week">Train a different session</button></section>`;
  }
  const m = buildDay(date, code);
  const day = DAYS[code];
  const picked = ui.day && ui.day !== L.dowCode(today());
  return `${head}
  <section class="dayhead">
    <p class="kind">${day.type === "push" ? "Push day" : "Pull day"}</p>
    <h1>${esc(day.title)}</h1>
    <p class="sub">${esc(day.sub)}</p>
    <p class="cycle">${cycleLine(m.cycle)}</p>
    <div class="meter" role="progressbar" aria-valuemin="0" aria-valuemax="${m.total}" aria-valuenow="${m.done}"><span style="width:${m.total ? (m.done / m.total) * 100 : 0}%"></span></div>
    <p class="count">${m.done} of ${m.total} sets${m.done === m.total && m.total ? ". Session complete." : ""}</p>
    ${picked ? `<button class="link" data-act="pickDay" data-code="">Back to today's session</button>` : ""}
  </section>
  ${banners(m.cycle)}
  ${m.groups.map((g) => groupCard(g, m)).join("")}
  <p class="fine center">Tap a name for cues and history.</p>`;
}

function groupCard(g, m) {
  const pair = g.items.length > 1;
  const heavy = g.items[0].item.kind === "heavy";
  return `<section class="group ${pair ? "pair" : ""} ${heavy ? "heavy" : ""}">
    ${heavy ? `<p class="tag">Strength lift</p>` : pair ? `<p class="tag">Superset, 30 s between A and B, ${g.rest} s after B</p>` : ""}
    ${g.items.map((it, idx) => exerciseBlock(it, idx, pair, g, m)).join("")}
  </section>`;
}

function targetText(it) {
  const { item, pr } = it;
  if (item.kind === "rounds") return `${pr.rows.length} rounds`;
  if (item.kind === "heavy") {
    if (pr.rows[0].label === "Test set") return "One test set, 3 to 6 reps";
    const back = pr.rows.length - 1;
    if (!back) return `Top set ${pr.rows[0].lo}–${pr.rows[0].hi}, lighter this week`;
    return `Top set ${pr.rows[0].lo}–${pr.rows[0].hi}, then ${back} back-off${back === 1 ? "" : "s"} ${pr.rows[1] ? `${pr.rows[1].lo}–${pr.rows[1].hi}` : ""} at −10%`;
  }
  let t = `${pr.rows.length} × ${item.lo}–${item.hi}`;
  if (pr.rows.some((r) => r.rp)) t += ", rest-pause last set";
  if (pr.rows.some((r) => r.drop)) t += ", drop set last set";
  return t;
}

function exerciseBlock(it, idx, pair, g, m) {
  const { item, ex, pr, rows } = it;
  const letter = pair ? `<span class="letter">${idx === 0 ? "A" : "B"}</span>` : "";
  const firstOpen = rows.find((r) => !r.done) || rows[0];
  let extra = "";
  if (item.kind === "heavy") {
    const B = BLOCKS[m.cycle.block];
    const top = rows[0];
    const wu = L.warmups(top.w, ex.inc);
    extra += `<p class="note">${esc(m.cycle.deload ? "Deload: 3–4 reps short" : B.rir)} on the top set.${wu.length ? ` Warm up ${wu.map((x) => `${L.fmtW(x.w)}×${x.r}`).join(", ")}, then rest 3 min.` : ""}</p>`;
    if (pr.fromMax && !rows.some((r) => r.done)) extra += `<p class="note">New block: weights set from your recent best.</p>`;
    if (pr.note) extra += `<p class="note">${esc(pr.note)}</p>`;
  }
  if (ex.bar && firstOpen && firstOpen.w > 0) extra += plateLine(firstOpen.w, ex.bar);
  return `<div class="ex">
    <div class="exhead">${letter}<button class="exname" data-act="detail" data-ex="${item.id}">${esc(ex.name)}</button>${pr.addWeight ? `<span class="up">+${L.fmtW(ex.inc)} kg</span>` : ""}</div>
    <p class="target">${targetText(it)}</p>
    ${extra}
    <div class="rows">${rows.map((r) => rowHtml(it, r, m)).join("")}</div>
  </div>`;
}

function plateLine(w, bar) {
  const { plates, rest } = L.platesPerSide(w, bar, S.barKg);
  if (!plates.length) return "";
  const bars = plates.map((p) => `<i class="plate p${String(p).replace(".", "_")}" title="${p} kg"></i>`).join("");
  return `<p class="plates"><span class="rack">${bars}</span>${bar === "barbell" ? `${L.fmtW(S.barKg)} kg bar + ` : ""}${plates.map(L.fmtW).join(" + ")} per side${rest ? ` (+${L.fmtW(rest)} kg not loadable)` : ""}</p>`;
}

function rowHtml(it, r, m) {
  const { item, ex } = it;
  const key = `data-ex="${item.id}" data-i="${r.i}"`;
  const rounds = item.kind === "rounds";
  const noW = ex.inc === 0;
  const isOpen = ui.open === `${item.id}|${r.i}`;
  const value = rounds
    ? `<span class="vals plain">Leg raise, toes to heaven, flag hold</span>`
    : `<button class="vals ${isOpen ? "on" : ""}" data-act="open" ${key} aria-expanded="${isOpen}" aria-label="Adjust ${esc(r.label)}">${noW ? "" : `<b>${L.fmtW(r.w)}</b><small>kg</small><span class="x">×</span>`}<b>${r.r}</b><small>reps</small></button>`;
  const stepper = (axis, val, unit) => `<div class="step">
      <button data-act="dec" data-axis="${axis}" ${key} aria-label="Less ${axis === "w" ? "weight" : "reps"}">−</button>
      <button class="val" data-act="${axis === "w" ? "typeW" : "typeR"}" ${key} aria-label="Type ${axis === "w" ? "weight" : "reps"}">${axis === "w" ? L.fmtW(val) : val}<small>${unit}</small></button>
      <button data-act="inc" data-axis="${axis}" ${key} aria-label="More ${axis === "w" ? "weight" : "reps"}">+</button></div>`;
  const tray = isOpen && !rounds ? `<div class="tray">${noW ? "" : stepper("w", r.w, "kg")}${stepper("r", r.r, "reps")}</div>` : "";
  const mini = (r.rp || r.drop) && r.done ? miniHtml(it, r) : "";
  return `<div class="row ${r.done ? "done" : ""}">
    <span class="lbl">${esc(r.label)}</span>${value}
    <button class="check" data-act="log" ${key} aria-pressed="${r.done}" aria-label="${r.done ? "Logged. Tap to undo" : "Log set"}">${checkSvg()}</button>
  </div>${tray}${mini}`;
}

function miniHtml(it, r) {
  const n = r.rp ? 2 : 1;
  const vals = Array.from({ length: n }, (_, k) => r.mini[k] || 0);
  const key = `data-ex="${it.item.id}" data-i="${r.i}"`;
  return `<div class="mini"><span>${r.rp ? "Mini-sets after 15–20 s" : "Reps after dropping ~25%"}</span>
    ${vals.map((v, k) => `<div class="step small"><button data-act="mdec" data-k="${k}" ${key} aria-label="Fewer reps">−</button><span class="val">+${v}</span><button data-act="minc" data-k="${k}" ${key} aria-label="More reps">+</button></div>`).join("")}</div>`;
}

// ---------- week ----------

function weekView() {
  const t = today();
  const tue = L.weekTuesday(t);
  const c = L.cycleInfo(t, S);
  const seg = Array.from({ length: 13 }, (_, i) => {
    const w = i + 1, b = L.blockForWeek(w);
    return `<span class="seg ${b} ${c && !c.preStart && w === c.w ? "now" : ""} ${c && !c.preStart && w < c.w ? "past" : ""}" title="Week ${w}"></span>`;
  }).join("");
  const rows = WEEK_ORDER.map((code, i) => {
    const date = L.addDaysISO(tue, i);
    const isToday = date === t;
    if (code === "MON") return `<li class="wk rest ${isToday ? "today" : ""}"><span class="wd">${fmtDay(date)}${isToday ? ", today" : ""}</span><span class="wt">Rest</span><span class="wl">Fast day</span></li>`;
    const day = DAYS[code];
    const sess = sessionsOn(date).filter((s) => DAYS[s.day] && hasSets(s));
    const heavyItem = day.groups[0].items[0];
    const lead = heavyItem.kind === "heavy" ? `Heavy: ${EX[heavyItem.id].name}` : EX[heavyItem.id].name;
    let status = "";
    if (sess.length) {
      const m = buildDay(date, sess[0].day);
      status = `<span class="st done">${m.done}/${m.total}${sess[0].day !== code ? ` (${DAYS[sess[0].day].title})` : ""}</span>`;
    }
    return `<li class="wk ${day.type} ${isToday ? "today" : ""}"><button data-act="weekDay" data-code="${code}" data-date="${date}">
      <span class="wd">${fmtDay(date)}${isToday ? ", today" : ""}</span><span class="wt">${esc(day.title)}</span><span class="wl">${esc(day.sub)}. ${esc(lead)}</span>${status}</button></li>`;
  }).join("");
  const legend = `<p class="legend"><span class="seg base"></span>Base, 6–8 reps <span class="seg build"></span>Build, 4–6 <span class="seg peak"></span>Peak, 3–5 <span class="seg test"></span>Test</p>`;
  return `<header class="top"><div><p class="date">This week</p></div><button class="icon" data-act="go" data-view="settings" aria-label="Settings">${gearSvg()}</button></header>
  <section class="weekhead"><h1>${c && !c.preStart ? `Week ${c.w}` : "Before week 1"}</h1><p class="sub">${cycleLine(c)}</p>
  <div class="segs">${seg}</div>${legend}</section>
  <ol class="week">${rows}</ol>
  <p class="fine">Missed a day? Tap any session to do it today instead.</p>`;
}

// ---------- progress ----------

function progressView() {
  const cards = BENCHMARKS.map((id) => {
    const series = L.e1rmSeries(S, id);
    const last = series.at(-1), first = series[0];
    const diff = last && first ? Math.round((last.v - first.v) * 10) / 10 : 0;
    return `<button class="bm" data-act="detail" data-ex="${id}"><span class="bmname">${esc(EX[id].name)}</span>
      <span class="bmval">${last ? L.fmtW(last.v) : "–"}<small> kg est. max</small></span>
      <span class="bmdiff">${series.length > 1 ? `${diff >= 0 ? "+" : ""}${L.fmtW(diff)} kg since ${fmtDay(first.date)}` : "Log heavy sets to see a trend"}</span>
      ${spark(series.map((p) => p.v))}</button>`;
  }).join("");
  const body = [...S.body].sort((a, b) => a.date.localeCompare(b.date));
  const bw = body.filter((b) => b.bw > 0);
  const t = today();
  const avg = (from, to) => { const xs = bw.filter((b) => b.date > from && b.date <= to).map((b) => b.bw); return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null; };
  const a1 = avg(L.addDaysISO(t, -7), t), a0 = avg(L.addDaysISO(t, -14), L.addDaysISO(t, -7));
  const latest = (k) => { const x = body.filter((b) => b[k] > 0).at(-1); return x ? `${L.fmtW(x[k])} cm, ${fmtDay(x.date)}` : "–"; };
  const exIds = Object.keys(EX);
  return `<header class="top"><div><p class="date">Progress</p></div><button class="icon" data-act="go" data-view="settings" aria-label="Settings">${gearSvg()}</button></header>
  <section><h2>Strength benchmarks</h2><div class="bms">${cards}</div>
  <p class="fine">Estimated max = weight × (1 + reps ÷ 30), best set per session.</p></section>
  <section><h2>Body</h2>
    <div class="bodygrid">
      <div><span class="k">Bodyweight, 7-day average</span><span class="v">${a1 ? `${L.fmtW(Math.round(a1 * 10) / 10)} kg` : "–"}</span>${a1 && a0 ? `<span class="d">${a1 - a0 >= 0 ? "+" : ""}${L.fmtW(Math.round((a1 - a0) * 100) / 100)} kg vs last week</span>` : ""}</div>
      <div><span class="k">Waist</span><span class="v small">${latest("waist")}</span></div>
      <div><span class="k">Arm / chest / shoulders</span><span class="v small">${["arm", "chest", "shoulder"].map((k) => { const x = body.filter((b) => b[k] > 0).at(-1); return x ? L.fmtW(x[k]) : "–"; }).join(" / ")} cm</span></div>
    </div>
    ${spark(bw.slice(-30).map((b) => b.bw), true)}
    <button class="big" data-act="body">Log weight or measurements</button>
    <p class="fine">Weigh in each morning or weekly. Waist every 2 weeks. Arms, chest, shoulders and photos monthly. Aim for about 0.1–0.25 kg gain per week.</p>
  </section>
  <section><h2>All exercises</h2><ul class="exlist">${exIds.map((id) => `<li><button data-act="detail" data-ex="${id}">${esc(EX[id].name)}</button></li>`).join("")}</ul></section>`;
}

function spark(values, violet = false) {
  if (values.length < 2) return "";
  const W = 300, H = 56, P = 4;
  const min = Math.min(...values), max = Math.max(...values), span = max - min || 1;
  const pts = values.map((v, i) => `${(P + (i * (W - 2 * P)) / (values.length - 1)).toFixed(1)},${(H - P - ((v - min) / span) * (H - 2 * P)).toFixed(1)}`);
  return `<svg class="spark ${violet ? "violet" : ""}" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true"><polyline points="${pts.join(" ")}"/><circle cx="${pts.at(-1).split(",")[0]}" cy="${pts.at(-1).split(",")[1]}" r="3.5"/></svg>`;
}

// ---------- settings ----------

function settingsView() {
  const t = today();
  const c = L.cycleInfo(t, S);
  const inDeload = c && (S.deloadWeeks || []).includes(c.cw);
  return `<header class="top"><div><p class="date">Settings</p></div></header>
  <section class="settings">
    <div class="set"><div><b>Deload this week</b><p class="fine">Use when two show up together: a benchmark stalls twice in a row, joints ache, or sleep and energy crash for a week. The 13-week cycle pauses for this week.</p></div>
      <button class="toggle" data-act="toggleDeload" aria-pressed="${!!inDeload}" ${c && !c.preStart ? "" : "disabled"}><span></span></button></div>
    <div class="set"><div><b>Drop Sunday lateral raises</b><p class="fine">First fix for sore elbows or shoulders. Side delts still get 15 sets a week.</p></div>
      <button class="toggle" data-act="toggleSun" aria-pressed="${!!S.skipSunRaises}"><span></span></button></div>
    <div class="set"><div><b>Theme</b><p class="fine">Auto follows your phone.</p></div>
      <div class="seg3" role="group" aria-label="Theme">${["auto", "light", "dark"].map((t) => `<button data-act="theme" data-t="${t}" aria-pressed="${(S.theme || "auto") === t}">${t[0].toUpperCase() + t.slice(1)}</button>`).join("")}</div></div>
    <div class="set"><div><b>Rest timer sound</b><p class="fine">The phone also vibrates when rest ends.</p></div>
      <button class="toggle" data-act="toggleSound" aria-pressed="${!!S.sound}"><span></span></button></div>
    <div class="set"><div><b>Barbell weight</b><p class="fine">Used for plates per side on rows and RDLs. Smith lifts are logged as plates only.</p></div>
      <div class="step"><button data-act="bar" data-d="-2.5" aria-label="Lighter bar">−</button><span class="val">${L.fmtW(S.barKg)}<small>kg</small></span><button data-act="bar" data-d="2.5" aria-label="Heavier bar">+</button></div></div>
    <div class="set"><div><b>Week 1 started</b><p class="fine">Changing this moves every week and block.</p></div>
      <input type="date" value="${S.startDate}" data-act="startDate" aria-label="Week 1 start date"></div>
    <h2>Backup</h2>
    <p class="fine">Your log lives on this phone. Back up weekly and keep the file somewhere safe, like Google Drive.</p>
    <button class="big" data-act="exportJson">Back up log (JSON)</button>
    <button class="big ghost" data-act="exportCsv">Export spreadsheet (CSV)</button>
    <button class="big ghost" data-act="import">Restore from backup</button>
    <input type="file" id="importFile" accept="application/json,.json" hidden>
    <h2>Danger zone</h2>
    <button class="big danger" data-act="wipe">Erase everything</button>
    <p class="fine">Plan ${PLAN_VERSION}. ${(() => { const n = Object.values(S.sessions).filter(hasSets).length; return `${n} session${n === 1 ? "" : "s"} logged`; })()}.</p>
  </section>`;
}

// ---------- sheets ----------

function openSheet(html) { $sheet.innerHTML = `<div class="scrim" data-act="closeSheet"></div><div class="panel" role="dialog" aria-modal="true">${html}</div>`; $sheet.hidden = false; const f = $sheet.querySelector("input"); if (f) setTimeout(() => f.focus(), 50); }
function closeSheet() { $sheet.hidden = true; $sheet.innerHTML = ""; ui.sheet = null; }

function detailSheet(id) {
  const ex = EX[id];
  const hist = L.sortedSessions(S).filter((s) => L.liveSets(s.sets[id]).length).slice(-8).reverse();
  const series = L.e1rmSeries(S, id);
  return `<h2>${esc(ex.name)}</h2>
    <ul class="cues">${ex.cues.map((c) => `<li>${esc(c)}</li>`).join("")}</ul>
    ${series.length > 1 ? `<p class="k">Estimated max</p>${spark(series.map((p) => p.v))}` : ""}
    <p class="k">Recent sessions</p>
    ${hist.length ? `<ul class="hist">${hist.map((s) => `<li><span>${fmtDay(s.date)}${s.deload ? ", deload" : ""}</span><span>${L.liveSets(s.sets[id]).map((x) => `${ex.inc ? `${L.fmtW(x.w)}×` : ""}${x.r}${x.mini && x.mini.some((v) => v > 0) ? `+${x.mini.filter((v) => v > 0).join("+")}` : ""}`).join(", ")}</span></li>`).join("")}</ul>` : `<p class="fine">No sets logged yet.</p>`}
    <button class="big ghost" data-act="closeSheet">Close</button>`;
}

function numberSheet(title, value, act, attrs) {
  return `<h2>${esc(title)}</h2><input class="num" type="text" inputmode="decimal" autocomplete="off" value="${value}" id="numIn">
    <button class="big" data-act="${act}" ${attrs}>Save</button><button class="big ghost" data-act="closeSheet">Cancel</button>`;
}

function bodySheet() {
  const e = S.body.find((b) => b.date === today()) || {};
  const f = (k, label, unit) => `<label class="field"><span>${label}</span><input type="text" inputmode="decimal" autocomplete="off" data-k="${k}" value="${e[k] || ""}" placeholder="${unit}"></label>`;
  return `<h2>${fmtDay(today())}</h2>
    ${f("bw", "Bodyweight", "kg")}${f("waist", "Waist at the navel", "cm")}${f("arm", "Arm", "cm")}${f("chest", "Chest", "cm")}${f("shoulder", "Shoulders", "cm")}
    <button class="big" data-act="saveBody">Save</button><button class="big ghost" data-act="closeSheet">Cancel</button>`;
}

function weekDaySheet(code, date) {
  const sess = sessionsOn(date).filter((s) => DAYS[s.day] && hasSets(s));
  const day = DAYS[code];
  if (sess.length && date !== today()) {
    const s = sess[0];
    const lines = Object.entries(s.sets).filter(([, a]) => L.liveSets(a).length).map(([id, a]) => `<li><span>${esc(EX[id] ? EX[id].name : id)}</span><span>${L.liveSets(a).map((x) => `${EX[id] && EX[id].inc ? `${L.fmtW(x.w)}×` : ""}${x.r}`).join(", ")}</span></li>`).join("");
    return `<h2>${esc(DAYS[s.day].title)}, ${fmtDay(date)}</h2><ul class="hist">${lines}</ul><button class="big ghost" data-act="closeSheet">Close</button>`;
  }
  return `<h2>${esc(day.title)}: ${esc(day.sub)}</h2><p class="lead">${date === today() ? "This is today's session." : `Do this session today (${fmtDay(today())}) instead of today's planned one?`}</p>
    <button class="big" data-act="pickDay" data-code="${code}">Open ${esc(day.title)}</button><button class="big ghost" data-act="closeSheet">Cancel</button>`;
}

// ---------- actions ----------

function findRow(exId, i) {
  const code = activeDayCode();
  const m = buildDay(today(), code);
  for (const g of m.groups) for (let k = 0; k < g.items.length; k++) if (g.items[k].item.id === exId) return { m, g, it: g.items[k], idx: k, row: g.items[k].rows[i] };
  return null;
}

function setDraft(sid, exId, i, w, r, touched = true) { ui.drafts.set(`${sid}|${exId}|${i}`, { w, r, touched }); saveUi(); }

function changeValue(exId, i, axis, delta, absolute = null) {
  const f = findRow(exId, i);
  if (!f || !f.row) return;
  const { m, it, row } = f;
  const step = axis === "w" ? (it.ex.inc || 1) : 1;
  let w = row.w, r = row.r;
  if (axis === "w") w = Math.max(0, absolute != null ? absolute : Math.round((w + delta * step) * 100) / 100);
  else r = Math.max(0, absolute != null ? Math.round(absolute) : r + delta);
  if (row.done) {
    const sess = getSession(m.date, m.code);
    const st = sess.sets[exId][i];
    st.w = w; st.r = r; persist();
  } else {
    setDraft(m.sid, exId, i, w, r);
    // Straight sets: untouched later sets follow the new weight.
    if (axis === "w" && it.item.kind === "straight") {
      it.rows.slice(i + 1).forEach((b) => {
        const d = ui.drafts.get(`${m.sid}|${exId}|${b.i}`);
        if (!b.done && !(d && d.touched)) setDraft(m.sid, exId, b.i, w, b.r, false);
      });
    }
    // Heavy top set changed: untouched back-offs follow at -10%.
    if (axis === "w" && it.item.kind === "heavy" && i === 0) {
      it.rows.slice(1).forEach((b) => {
        const d = ui.drafts.get(`${m.sid}|${exId}|${b.i}`);
        if (!b.done && !(d && d.touched)) setDraft(m.sid, exId, b.i, L.roundDown(w * 0.9, it.ex.inc), b.r, false);
      });
    }
  }
  render();
}

function logSet(exId, i) {
  const f = findRow(exId, i);
  if (!f || !f.row) return;
  const { m, g, it, idx, row } = f;
  const sess = ensureSession(m.date, m.code);
  const arr = (sess.sets[exId] ||= []);
  if (row.done) {
    // A fast double tap would log then instantly undo. Ignore undo within 1.2 s of logging.
    if (arr[i] && arr[i].t && Date.now() - arr[i].t < 1200) return;
    arr[i] = null; persist(); render(); toast("Set removed"); return;
  }
  arr[i] = { w: it.ex.inc === 0 ? 0 : row.w, r: row.r, mini: [], t: Date.now() };
  ui.drafts.delete(`${m.sid}|${exId}|${i}`);
  persist(); saveUi();
  try { navigator.vibrate && navigator.vibrate(12); } catch {}
  keepAwake();
  let secs = g.rest;
  if (g.items.length > 1 && idx === 0) {
    const partner = g.items[1];
    if (partner.rows[i] && !partner.rows[i].done) secs = 30;
  }
  const allDone = buildDay(m.date, m.code).done === buildDay(m.date, m.code).total;
  if (allDone) { stopRest(); toast("Session complete. Nice work."); }
  else startRest(secs);
  render();
}

function changeMini(exId, i, k, delta) {
  const f = findRow(exId, i);
  if (!f || !f.row || !f.row.done) return;
  const sess = getSession(f.m.date, f.m.code);
  const st = sess.sets[exId][i];
  st.mini = st.mini || [];
  st.mini[k] = Math.max(0, (st.mini[k] || 0) + delta);
  persist(); render();
}

async function download(name, text, type) {
  const blob = new Blob([text], { type });
  try {
    const file = new File([blob], name, { type });
    const standalone = window.matchMedia("(display-mode: standalone)").matches || navigator.standalone;
    if (standalone && navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: name }); return; }
  } catch (e) { if (e && e.name === "AbortError") return; }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
function exportJson() { S.lastExport = Date.now(); persist(); download(`plateload-backup-${today()}.json`, JSON.stringify(S, null, 1), "application/json"); toast("Backup saved to your downloads"); render(); }
function exportCsv() {
  const lines = ["date,session,exercise,set,weight_kg,reps,extra_reps,deload"];
  for (const s of L.sortedSessions(S)) for (const [id, arr] of Object.entries(s.sets)) (arr || []).forEach((x, i) => {
    if (x && x.w != null) lines.push([s.date, DAYS[s.day] ? DAYS[s.day].title : s.day, `"${(EX[id] ? EX[id].name : id).replace(/"/g, '""')}"`, i + 1, x.w, x.r, (x.mini || []).filter((v) => v > 0).join("+"), s.deload ? "yes" : ""].join(","));
  });
  download(`plateload-log-${today()}.csv`, lines.join("\n"), "text/csv");
}

$app.addEventListener("change", async (e) => {
  const t = e.target;
  if (t.dataset.act === "startDate" && t.value) {
    S.startDate = L.weekTuesday(t.value); persist(); render(); toast(`Week 1 now starts ${fmtDay(S.startDate)}`);
  }
  if (t.id === "importFile" && t.files[0]) {
    try {
      const next = Store.importState(await t.files[0].text());
      const n = Object.values(next.sessions).length;
      openSheet(`<h2>Restore backup?</h2><p class="lead">This replaces what's on this phone with ${n} sessions from the file.</p><button class="big" data-act="confirmImport">Restore</button><button class="big ghost" data-act="closeSheet">Cancel</button>`);
      ui.pendingImport = next;
    } catch (err) { toast(err.message || "That file couldn't be read."); }
    t.value = "";
  }
});

document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-act]");
  if (!b || b.disabled) return;
  const a = b.dataset.act, d = b.dataset;
  unlockAudio();
  switch (a) {
    case "start": S.startDate = d.date; persist(); render(); break;
    case "go": ui.view = d.view; ui.open = null; closeSheet(); render(); window.scrollTo(0, 0); break;
    case "log": if (ui.open === `${d.ex}|${d.i}`) ui.open = null; logSet(d.ex, +d.i); break;
    case "open": ui.open = ui.open === `${d.ex}|${d.i}` ? null : `${d.ex}|${d.i}`; render(); break;
    case "inc": changeValue(d.ex, +d.i, d.axis, 1); break;
    case "dec": changeValue(d.ex, +d.i, d.axis, -1); break;
    case "minc": changeMini(d.ex, +d.i, +d.k, 1); break;
    case "mdec": changeMini(d.ex, +d.i, +d.k, -1); break;
    case "typeW": case "typeR": {
      const f = findRow(d.ex, +d.i); if (!f) break;
      openSheet(numberSheet(`${EX[d.ex].name}: ${a === "typeW" ? "weight (kg)" : "reps"}`, a === "typeW" ? f.row.w : f.row.r, "saveNum", `data-ex="${d.ex}" data-i="${d.i}" data-axis="${a === "typeW" ? "w" : "r"}"`));
      break;
    }
    case "saveNum": {
      const v = num(document.getElementById("numIn").value);
      if (Number.isFinite(v) && v >= 0) changeValue(d.ex, +d.i, d.axis, 0, v);
      closeSheet(); break;
    }
    case "detail": openSheet(detailSheet(d.ex)); break;
    case "closeSheet": closeSheet(); break;
    case "body": openSheet(bodySheet()); break;
    case "saveBody": {
      const entry = { date: today() };
      $sheet.querySelectorAll("input[data-k]").forEach((inp) => { const v = num(inp.value); if (Number.isFinite(v) && v > 0) entry[inp.dataset.k] = v; });
      S.body = S.body.filter((x) => x.date !== today());
      if (Object.keys(entry).length > 1) S.body.push(entry);
      persist(); closeSheet(); render(); toast("Saved"); break;
    }
    case "weekDay": openSheet(weekDaySheet(d.code, d.date)); break;
    case "pickDay": ui.day = d.code || L.dowCode(today()); ui.view = "today"; saveUi(); closeSheet(); render(); window.scrollTo(0, 0); break;
    case "toggleSun": S.skipSunRaises = !S.skipSunRaises; persist(); render(); break;
    case "theme": S.theme = d.t; persist(); applyTheme(); render(); break;
    case "toggleSound": S.sound = !S.sound; persist(); render(); break;
    case "toggleDeload": {
      const c = L.cycleInfo(today(), S); if (!c || c.preStart) break;
      const set = new Set(S.deloadWeeks || []);
      set.has(c.cw) ? set.delete(c.cw) : set.add(c.cw);
      S.deloadWeeks = [...set].sort((x, y) => x - y);
      // Only sessions not yet started this week pick up the change.
      persist(); render(); toast(set.has(c.cw) ? "Deload on for this week" : "Deload off"); break;
    }
    case "bar": S.barKg = Math.max(0, S.barKg + parseFloat(d.d)); persist(); render(); break;
    case "exportJson": exportJson(); break;
    case "exportCsv": exportCsv(); break;
    case "import": document.getElementById("importFile").click(); break;
    case "confirmImport": if (ui.pendingImport) { S = ui.pendingImport; ui.pendingImport = null; ui.drafts.clear(); persist(); applyTheme(); } closeSheet(); render(); toast("Backup restored"); break;
    case "wipe": openSheet(`<h2>Erase everything?</h2><p class="lead">Every logged set and measurement on this phone will be deleted. Back up first if you might want it.</p><button class="big danger" data-act="confirmWipe">Erase everything</button><button class="big ghost" data-act="closeSheet">Cancel</button>`); break;
    case "confirmWipe": S = Store.emptyState(); ui.drafts.clear(); persist(); closeSheet(); ui.view = "today"; render(); break;
    case "restAdd": if (ui.rest) { if (ui.rest.over) { ui.rest.over = false; ui.rest.end = Date.now(); } ui.rest.end += 30000; ui.rest.total += 30; saveUi(); tickRest(); } break;
    case "restSkip": stopRest(); break;
  }
});

$sheet.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && e.target.tagName === "INPUT") { e.preventDefault(); const b = $sheet.querySelector(".big:not(.ghost)"); if (b) b.click(); }
});

// ---------- rest timer ----------

let restTimer = null;
function startRest(secs, total = secs) {
  ui.rest = { end: Date.now() + secs * 1000, total, over: false };
  saveUi();
  $rest.hidden = false;
  clearInterval(restTimer);
  restTimer = setInterval(tickRest, 250);
  tickRest();
}
function stopRest() { clearInterval(restTimer); ui.rest = null; $rest.hidden = true; saveUi(); }
function tickRest() {
  if (!ui.rest) return;
  const left = Math.max(0, Math.ceil((ui.rest.end - Date.now()) / 1000));
  const pct = ui.rest.total ? (left / ui.rest.total) * 100 : 0;
  if (left === 0 && !ui.rest.over) {
    ui.rest.over = true;
    try { navigator.vibrate && navigator.vibrate([200, 100, 200]); } catch {}
    if (S.sound) beep();
    setTimeout(() => { if (ui.rest && ui.rest.over) stopRest(); }, 4000);
  }
  $rest.classList.toggle("over", left === 0);
  $rest.innerHTML = `<span class="bar" style="width:${pct}%"></span><span class="t">${left === 0 ? "Go" : `Rest ${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`}</span>
    <button data-act="restAdd">+30 s</button><button data-act="restSkip">Skip</button>`;
}

let actx = null;
function unlockAudio() { try { actx ||= new (window.AudioContext || window.webkitAudioContext)(); if (actx.state === "suspended") actx.resume(); } catch {} }
function beep() {
  try {
    unlockAudio(); if (!actx) return;
    [0, 0.25].forEach((off) => {
      const o = actx.createOscillator(), g = actx.createGain();
      o.frequency.value = 880; o.connect(g); g.connect(actx.destination);
      const t = actx.currentTime + off;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.3, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
      o.start(t); o.stop(t + 0.2);
    });
  } catch {}
}

let wake = null;
async function keepAwake() { try { if (!wake && navigator.wakeLock) { wake = await navigator.wakeLock.request("screen"); wake.addEventListener("release", () => { wake = null; }); } } catch {} }
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") { if (ui.rest) tickRest(); render(); }
});

// ---------- misc ----------

function toast(msg) { $toast.textContent = msg; $toast.hidden = false; clearTimeout(ui.toastTimer); ui.toastTimer = setTimeout(() => { $toast.hidden = true; }, 2200); }
function gearSvg() { return `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="currentColor" d="M19.4 13a7.5 7.5 0 0 0 0-2l2-1.6-2-3.4-2.4 1a7.3 7.3 0 0 0-1.7-1L15 3.5h-4l-.4 2.5a7.3 7.3 0 0 0-1.7 1l-2.4-1-2 3.4L6.6 11a7.5 7.5 0 0 0 0 2l-2 1.6 2 3.4 2.4-1a7.3 7.3 0 0 0 1.7 1l.4 2.5h4l.4-2.5a7.3 7.3 0 0 0 1.7-1l2.4 1 2-3.4zM13 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7z" transform="translate(-1 0)"/></svg>`; }
function checkSvg() { return `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" d="M5.5 12.5l4 4L18.5 7.5"/></svg>`; }

// Re-render when the date rolls over (phone left open overnight).
let lastDate = today();
setInterval(() => { if (today() !== lastDate) { lastDate = today(); ui.day = null; ui.drafts.clear(); saveUi(); render(); } }, 30000);

(async function boot() {
  const { state, restored } = await Store.load();
  S = state;
  loadUi();
  applyTheme();
  render();
  if (restored) toast("Restored from backup copy");
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js").catch(() => {});
})();
