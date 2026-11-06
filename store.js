// Every save goes to localStorage AND IndexedDB. On load, the fresher copy wins
// and heals the other. Keys are unique to this app so the old Anchor app's data is untouched. (Internal keys keep the "anchor7"
// prefix so logs saved before the rename carry over.)

const LS_KEY = "anchor7.data";
const DB_NAME = "anchor7";
const DB_STORE = "kv";

export function emptyState() {
  return { v: 1, theme: "auto", startDate: null, deloadWeeks: [], skipSunRaises: false, barKg: 20, sound: true, sessions: {}, body: [], lastExport: null, savedAt: 0 };
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;
// Drop anything malformed so one bad record can never break the app.
function cleanSessions(x) {
  const out = {};
  if (!x || typeof x !== "object") return out;
  for (const [id, s] of Object.entries(x)) {
    if (!s || typeof s !== "object" || !ISO.test(s.date || "") || typeof s.day !== "string" || typeof s.key !== "string") continue;
    const sets = {};
    for (const [ex, arr] of Object.entries(s.sets && typeof s.sets === "object" ? s.sets : {})) {
      if (!Array.isArray(arr)) continue;
      sets[ex] = arr.map((v) => (v && Number.isFinite(v.w) && Number.isFinite(v.r) ? { ...v, mini: Array.isArray(v.mini) ? v.mini.filter(Number.isFinite) : [] } : null));
    }
    out[id] = { ...s, id, sets, deload: !!s.deload, q: Number.isFinite(s.q) ? s.q : 1, cw: Number.isFinite(s.cw) ? s.cw : 0, block: ["base", "build", "peak", "test"].includes(s.block) ? s.block : "base" };
  }
  return out;
}

function normalize(s) {
  const base = emptyState();
  if (!s || typeof s !== "object") return base;
  return {
    ...base, ...s,
    deloadWeeks: Array.isArray(s.deloadWeeks) ? s.deloadWeeks.filter(Number.isFinite) : [],
    sessions: cleanSessions(s.sessions),
    body: Array.isArray(s.body) ? s.body.filter((b) => b && typeof b.date === "string") : [],
    barKg: Number.isFinite(s.barKg) ? s.barKg : base.barKg,
  };
}

function readLS() {
  try { const raw = localStorage.getItem(LS_KEY); return raw ? JSON.parse(raw) : null; } catch { return null; }
}

function openDB() {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(DB_STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch { resolve(null); }
  });
}
let dbPromise = null;
const db = () => (dbPromise ||= openDB());

async function readIDB() {
  const d = await db();
  if (!d) return null;
  return new Promise((resolve) => {
    try {
      const req = d.transaction(DB_STORE, "readonly").objectStore(DB_STORE).get("state");
      req.onsuccess = () => { const v = req.result; try { resolve(typeof v === "string" ? JSON.parse(v) : v || null); } catch { resolve(null); } };
      req.onerror = () => resolve(null);
    } catch { resolve(null); }
  });
}
async function writeIDB(state) {
  const d = await db();
  if (!d) return false;
  return new Promise((resolve) => {
    try {
      const tx = d.transaction(DB_STORE, "readwrite");
      tx.objectStore(DB_STORE).put(state, "state");
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    } catch { resolve(false); }
  });
}

export async function load() {
  const a = readLS(), b = await readIDB();
  let healed = false, state;
  if (a && b) state = (a.savedAt || 0) >= (b.savedAt || 0) ? a : b;
  else state = a || b;
  if ((a && !b) || (!a && b) || (a && b && a.savedAt !== b.savedAt)) healed = true;
  state = normalize(state);
  if (healed) { const text = JSON.stringify(state); try { localStorage.setItem(LS_KEY, text); } catch {} await writeIDB(text); }
  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch {}
  return { state, restored: !a && !!b };
}

// Only the newest copy ever waits for IndexedDB, however fast the taps come.
let queued = null, writing = false;
async function flushIDB() {
  if (writing) return;
  writing = true;
  while (queued) { const next = queued; queued = null; await writeIDB(next); }
  writing = false;
}
export function save(state) {
  state.savedAt = Date.now();
  let text;
  try { text = JSON.stringify(state); } catch { return false; }
  let okLS = true;
  try { localStorage.setItem(LS_KEY, text); } catch { okLS = false; }
  queued = text;
  flushIDB();
  return okLS;
}

export function importState(text) {
  const parsed = JSON.parse(text);
  if (!parsed || typeof parsed !== "object" || !parsed.sessions || typeof parsed.sessions !== "object") throw new Error("This file is not a Plateload backup.");
  return normalize(parsed);
}
