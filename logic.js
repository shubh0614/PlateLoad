import { EX, BLOCKS, DAYS } from "./plan.js";

const DAY_MS = 86400000;
const DOW = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

// ---------- dates (always local calendar dates, never UTC) ----------

export function isoDate(d = new Date()) {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, "0"), dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}
export function parseISO(iso) { const [y, m, d] = iso.split("-").map(Number); return new Date(y, m - 1, d, 12); }
export function addDaysISO(iso, n) { const d = parseISO(iso); d.setDate(d.getDate() + n); return isoDate(d); }
export function dowCode(iso) { return DOW[parseISO(iso).getDay()]; }
export function daysBetween(aIso, bIso) { return Math.round((parseISO(bIso) - parseISO(aIso)) / DAY_MS); }

// Training weeks run Tuesday to Monday. Monday belongs to the week before it.
export function weekTuesday(iso) {
  const back = (parseISO(iso).getDay() + 5) % 7; // Tue=0, Wed=1, ..., Mon=6
  return addDaysISO(iso, -back);
}

// ---------- cycle: 13-week quarters, deload weeks pause the cycle ----------

export function calendarWeek(iso, startIso) {
  return Math.floor(daysBetween(weekTuesday(startIso), weekTuesday(iso)) / 7) + 1;
}

export function blockForWeek(w) {
  if (w <= 4) return "base";
  if (w <= 8) return "build";
  if (w <= 12) return "peak";
  return "test";
}

export function cycleInfo(iso, state) {
  if (!state.startDate) return null;
  const cw = calendarWeek(iso, state.startDate);
  if (cw < 1) return { preStart: true, cw, eff: 1, q: 1, w: 1, block: "base", deload: false };
  const deloads = state.deloadWeeks || [];
  const deload = deloads.includes(cw);
  const eff = cw - deloads.filter((x) => x < cw).length;
  const q = Math.floor((eff - 1) / 13) + 1;
  const w = ((eff - 1) % 13) + 1;
  return { preStart: false, cw, eff, q, w, block: blockForWeek(w), deload };
}

// ---------- numbers ----------

export function e1rm(w, r) { return w > 0 && r > 0 ? w * (1 + r / 30) : 0; }
export function roundDown(x, inc) {
  if (!(x > 0)) return 0;
  if (!(inc > 0)) return Math.round(x * 100) / 100;
  return Math.round(Math.floor(x / inc + 1e-9) * inc * 100) / 100;
}
export function fmtW(w) { return Number.isInteger(w) ? String(w) : String(Math.round(w * 100) / 100); }

// Greedy plate breakdown for one side of the bar.
const PLATES = [20, 15, 10, 7.5, 5, 2.5];
export function platesPerSide(total, bar, barKg) {
  const load = bar === "barbell" ? total - barKg : total;
  if (!(load > 0)) return { plates: [], rest: 0 };
  let side = load / 2;
  const plates = [];
  for (const p of PLATES) { while (side >= p - 1e-9) { plates.push(p); side -= p; } }
  return { plates, rest: Math.round(side * 100) / 100 };
}

// ---------- history ----------

export function liveSets(arr) { return (arr || []).filter((x) => x && x.w != null); }

export function sortedSessions(state) {
  return Object.values(state.sessions || {}).sort((a, b) => (a.date === b.date ? a.id.localeCompare(b.id) : a.date.localeCompare(b.date)));
}

// Most recent normal (non-deload, non-test) session of the same plan day that logged this exercise.
export function lastNormal(state, exId, dayKey, excludeId) {
  const list = sortedSessions(state).filter((s) => s.id !== excludeId && s.key === dayKey && !s.deload && s.block !== "test" && liveSets(s.sets[exId]).length);
  return list.length ? list[list.length - 1] : null;
}

// Best estimated max for an exercise over the window before a date (reps <= 12 only).
export function bestE1rm(state, exId, beforeIso, windowDays = 56, excludeId = null) {
  let best = 0;
  for (const s of sortedSessions(state)) {
    if (s.id === excludeId || s.deload) continue;
    const age = daysBetween(s.date, beforeIso);
    if (age < 0 || age > windowDays) continue;
    for (const st of liveSets(s.sets[exId])) if (st.r <= 12) best = Math.max(best, e1rm(st.w, st.r));
  }
  return best;
}

export function e1rmSeries(state, exId) {
  const out = [];
  for (const s of sortedSessions(state)) {
    if (s.deload) continue;
    let best = 0;
    for (const st of liveSets(s.sets[exId])) if (st.r <= 12) best = Math.max(best, e1rm(st.w, st.r));
    if (best > 0) out.push({ date: s.date, v: Math.round(best * 10) / 10 });
  }
  return out;
}

// ---------- prescriptions ----------

const RIR_NUM = { base: 3, build: 2, peak: 1.5, test: 1 };
const halfSets = (n) => Math.max(1, Math.round(n / 2));

// Returns { rows: [{label, lo, hi, w, r, rp, drop}], addWeight, kind, note }
export function prescribe(item, ctx) {
  const { state, dayKey, cycle, date, sessionId } = ctx;
  const ex = EX[item.id];
  const inc = ex.inc;
  const deload = cycle.deload;
  const test = cycle.block === "test" && !deload;

  if (item.kind === "rounds") {
    const n = deload || test ? halfSets(item.sets) : item.sets;
    return { kind: "rounds", addWeight: false, rows: Array.from({ length: n }, (_, i) => ({ label: `Round ${i + 1}`, lo: 1, hi: 1, w: 0, r: 1 })) };
  }

  if (item.kind === "heavy") return prescribeHeavy(item, ex, ctx);

  const last = lastNormal(state, item.id, dayKey, sessionId);
  const ls = last ? liveSets(last.sets[item.id]) : [];
  const lastTop = ls.reduce((m, s) => Math.max(m, s.w), 0);
  const addWeight = inc > 0 && !deload && ls.length >= item.sets && ls.every((s) => s.r >= item.hi) && ls.every((s) => s.w === lastTop);
  const n = deload || test ? halfSets(item.sets) : item.sets;
  const rows = [];
  for (let i = 0; i < n; i++) {
    let w, r;
    if (!ls.length) { w = 0; r = item.lo; }
    else if (addWeight) { w = lastTop + inc; r = item.lo; }
    else { const raw = (last.sets[item.id] || [])[i]; const p = raw && raw.w != null ? raw : ls[Math.min(i, ls.length - 1)]; w = p.w; r = Math.max(item.lo, Math.min(p.r, item.hi)); }
    if (deload) { w = roundDown(w * 0.9, inc); r = item.lo; }
    const isLast = i === n - 1;
    rows.push({ label: `Set ${i + 1}`, lo: item.lo, hi: item.hi, w, r, rp: !!item.rp && isLast && !deload, drop: !!item.drop && isLast && !deload });
  }
  return { kind: "straight", addWeight, rows };
}

function prescribeHeavy(item, ex, ctx) {
  const { state, dayKey, cycle, date, sessionId } = ctx;
  const inc = ex.inc;
  const B = BLOCKS[cycle.block];
  const deload = cycle.deload;
  const last = lastNormal(state, item.id, dayKey, sessionId);
  const raw = last ? last.sets[item.id] || [] : [];
  const at = (k) => (raw[k] && raw[k].w != null ? raw[k] : null);
  const lastTopSet = at(0);
  const sameBlock = !!(last && last.block === cycle.block && last.q === cycle.q && lastTopSet);

  let topW = 0, topR = B.top[0], addWeight = false, fromMax = false;
  if (sameBlock) {
    topW = lastTopSet.w;
    if (lastTopSet.r >= B.top[1]) { topW += inc; addWeight = true; topR = B.top[0]; }
    else topR = Math.max(B.top[0], Math.min(lastTopSet.r, B.top[1]));
  } else {
    const best = bestE1rm(state, item.id, date, 56, sessionId);
    if (best > 0) {
      const reps = cycle.block === "test" ? 6 : B.top[0] + RIR_NUM[cycle.block];
      topW = roundDown(best / (1 + reps / 30), inc);
      fromMax = true;
    }
  }

  if (cycle.block === "test" && !deload) {
    return { kind: "heavy", addWeight: false, fromMax, rows: [{ label: "Test set", lo: B.top[0], hi: B.top[1], w: topW, r: 5 }],
      note: "Work up to a weight you can do for 3 to 6 clean reps. Stop at the first rep that slows down. Catches set." };
  }

  const backW = roundDown(topW * 0.9, inc);
  const rows = [{ label: "Top", lo: B.top[0], hi: B.top[1], w: topW, r: topR }];
  // Test week has no back-offs; a deload taken in test week is just a lighter top set.
  const backSets = !B.back ? 0 : deload ? 1 : B.backSets;
  for (let i = 0; i < backSets; i++) {
    const prevSet = sameBlock ? at(i + 1) : null;
    const prev = prevSet && prevSet.w === backW ? prevSet.r : B.back[0];
    rows.push({ label: `Back-off`, lo: B.back[0], hi: B.back[1], w: backW, r: Math.max(B.back[0], Math.min(prev, B.back[1])) });
  }
  if (deload) for (const r of rows) { r.w = roundDown(r.w * 0.9, inc); r.r = r.lo; }
  return { kind: "heavy", addWeight: addWeight && !deload, fromMax, rows };
}

export function warmups(topW, inc) {
  if (!(topW > 0)) return [];
  return [[0.5, 8], [0.7, 4], [0.85, 2]].map(([p, r]) => ({ w: roundDown(topW * p, inc), r })).filter((x) => x.w > 0);
}

// Which plan items are active on a given day (respects the Sunday raise switch).
export function dayItems(dayCode, state) {
  const day = DAYS[dayCode];
  if (!day) return [];
  return day.groups.map((g) => ({ ...g, items: g.items.filter((it) => !(it.sundayRaise && state.skipSunRaises)) })).filter((g) => g.items.length);
}
