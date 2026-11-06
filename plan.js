// The whole program. Logs are keyed by exercise id, so names can change safely.
// kind: "heavy" = reverse pyramid driven by the block; "straight" = double progression;
// "rounds" = check-off only (no weight, no reps).
// rp: rest-pause on the last set. drop: drop set on the last set.
// bar: "smith" (log plates only) or "barbell" (log total incl. bar). Shows plates per side.

export const PLAN_VERSION = "v7";

export const EX = {
  smith_incline: { name: "Smith incline press (30°)", inc: 5, bar: "smith", cues: ["Bench at 30°, catches set", "Elbows ~45°", "Bar to upper chest, controlled"] },
  smith_ohp: { name: "Smith seated overhead press", inc: 5, bar: "smith", cues: ["Upright seat, catches set", "Press without shrugging", "Bar just in front of the face"] },
  barbell_row: { name: "Barbell row", inc: 5, bar: "barbell", cues: ["Torso ~45°", "Row to lower ribs", "No body swing"] },
  lat_pulldown: { name: "Lat pulldown, medium overhand", inc: 5, cues: ["Chest tall, slight lean", "Elbows down and back", "Full stretch at the top"] },
  smith_flat: { name: "Smith flat bench", inc: 5, bar: "smith", cues: ["Shoulder blades back", "Bar to lower chest", "Catches set"] },
  machine_shoulder_press: { name: "Machine shoulder press", inc: 5, cues: ["Handles at shoulder height", "No shrug", "Stop short of lockout"] },
  close_row: { name: "Close-grip seated row", inc: 5, cues: ["Chest tall", "Row to the belly", "Squeeze shoulder blades"] },
  cable_lateral: { name: "Cable lateral raise", inc: 2.5, cues: ["Single arm, cable behind you", "Lead with the elbow", "Stop at shoulder height"] },
  db_lateral: { name: "DB lateral raise", inc: 2.5, cues: ["Slight forward lean", "Lead with the elbows", "Stop at shoulder height"] },
  rev_pec_deck: { name: "Reverse pec deck", inc: 5, cues: ["Neutral grip, palms facing", "Sweep back, slight elbow bend", "Light and strict"] },
  face_pull: { name: "Cable face pull", inc: 2.5, cues: ["High elbows", "Pull to the forehead", "Rotate out at the end"] },
  low_high_fly: { name: "Low-to-high cable fly", inc: 2.5, cues: ["Start low and wide", "Sweep up to eye level", "Squeeze the upper chest"] },
  pec_deck_fly: { name: "Pec deck fly", inc: 5, cues: ["Slight elbow bend, hold it", "Squeeze from the elbows", "Control the stretch"] },
  oh_cable_tri: { name: "Overhead cable triceps extension", inc: 2.5, cues: ["Elbows high and still", "Full lockout", "Feel the long-head stretch"] },
  ez_skull: { name: "EZ bar skullcrusher", inc: 2.5, cues: ["Lower behind the head", "Only forearms move", "Elbows in"] },
  rope_pushdown: { name: "Cable rope pushdown", inc: 2.5, cues: ["Elbows pinned", "Spread the rope at the bottom", "Control back up"] },
  incline_db_curl: { name: "Incline DB curl", inc: 2.5, cues: ["Arms hang back", "Elbows still", "Full stretch at the bottom"] },
  ez_curl: { name: "EZ bar curl", inc: 2.5, cues: ["Elbows pinned", "No swinging", "Squeeze at the top"] },
  hammer_curl: { name: "DB hammer curl", inc: 2.5, cues: ["Neutral grip", "Elbows pinned", "No swinging"] },
  cable_pullover: { name: "Cable pullover", inc: 2.5, cues: ["Arms nearly straight", "Let the lats stretch overhead", "Pull with the lats"] },
  cable_crunch: { name: "Cable crunch", inc: 5, cues: ["Round the spine, hips fixed", "Crunch with the abs", "Exhale hard"] },
  abs_circuit: { name: "Abs circuit", inc: 0, cues: ["7 leg raises, 7 toes to heaven, 7 s dragon flag hold", "Ribs down, lower back flat", "Back arches: stop"] },
  leg_extension: { name: "Leg extension", inc: 5, cues: ["Pause at the top", "Control the lowering", "Quad maintenance"] },
  barbell_rdl: { name: "Barbell RDL", inc: 5, bar: "barbell", cues: ["Hinge at the hips", "Bar close to the legs", "2–3 reps short, flat back"] },
  smith_calf: { name: "Smith calf raise", inc: 5, bar: "smith", cues: ["Full stretch at the bottom", "Pause at the top", "No bouncing"] },
  smith_glute_bridge: { name: "Smith glute bridge", inc: 5, bar: "smith", cues: ["Pad the bar", "Drive through the heels", "Squeeze at the top"] },
};

export const BENCHMARKS = ["smith_incline", "smith_ohp", "barbell_row", "lat_pulldown"];

// Heavy-day reverse pyramid by block (top set, then back-offs at -10%).
export const BLOCKS = {
  base: { name: "Base", top: [6, 8], back: [8, 10], backSets: 2, rir: "2–3 reps short" },
  build: { name: "Build", top: [4, 6], back: [6, 8], backSets: 2, rir: "2 reps short" },
  peak: { name: "Peak", top: [3, 5], back: [5, 7], backSets: 2, rir: "1–2 reps short" },
  test: { name: "Test", top: [3, 6], back: null, backSets: 0, rir: "Stop at the first slow rep" },
};

// Groups: "single" (one exercise) or "pair" (superset A then B).
// rest: seconds after a set (pairs: 30 s after A, `rest` after B).
const s = (id, sets, lo, hi, extra = {}) => ({ id, kind: "straight", sets, lo, hi, ...extra });
const h = (id) => ({ id, kind: "heavy" });

export const DAYS = {
  TUE: { key: "push_a", type: "push", title: "Push A", sub: "Incline strength", groups: [
    { rest: 120, items: [h("smith_incline")] },
    { rest: 120, items: [s("smith_ohp", 3, 8, 10)] },
    { rest: 90, items: [s("cable_lateral", 3, 12, 15, { rp: true }), s("rev_pec_deck", 3, 15, 20)] },
    { rest: 90, items: [s("oh_cable_tri", 4, 10, 15, { rp: true }), s("leg_extension", 2, 12, 15)] },
  ]},
  WED: { key: "pull_a", type: "pull", title: "Pull A", sub: "Row strength", groups: [
    { rest: 120, items: [h("barbell_row")] },
    { rest: 120, items: [s("lat_pulldown", 3, 8, 10)] },
    { rest: 90, items: [s("db_lateral", 3, 12, 20, { rp: true }), s("incline_db_curl", 4, 8, 12)] },
    { rest: 90, items: [s("face_pull", 3, 15, 20), s("cable_crunch", 3, 10, 15)] },
  ]},
  THU: { key: "push_b", type: "push", title: "Push B", sub: "Overhead strength", groups: [
    { rest: 120, items: [h("smith_ohp")] },
    { rest: 120, items: [s("smith_incline", 3, 8, 10)] },
    { rest: 90, items: [s("cable_lateral", 3, 12, 15, { rp: true }), s("low_high_fly", 3, 12, 15, { rp: true })] },
    { rest: 90, items: [s("ez_skull", 4, 8, 12), s("barbell_rdl", 2, 8, 10)] },
  ]},
  FRI: { key: "pull_b", type: "pull", title: "Pull B", sub: "Pulldown strength", groups: [
    { rest: 120, items: [h("lat_pulldown")] },
    { rest: 120, items: [s("close_row", 3, 8, 12, { rp: true })] },
    { rest: 90, items: [s("db_lateral", 3, 12, 20, { rp: true }), s("ez_curl", 4, 6, 10)] },
    { rest: 90, items: [s("rev_pec_deck", 3, 15, 20, { rp: true }), { id: "abs_circuit", kind: "rounds", sets: 3, lo: 1, hi: 1 }] },
  ]},
  SAT: { key: "push_c", type: "push", title: "Push C", sub: "Chest and delt volume", groups: [
    { rest: 150, items: [s("smith_flat", 3, 6, 10)] },
    { rest: 120, items: [s("machine_shoulder_press", 3, 10, 12, { rp: true })] },
    { rest: 90, items: [s("pec_deck_fly", 3, 12, 15, { rp: true }), s("cable_lateral", 3, 15, 20, { drop: true })] },
    { rest: 90, items: [s("rope_pushdown", 4, 10, 15), s("leg_extension", 2, 15, 20)] },
  ]},
  SUN: { key: "pull_c", type: "pull", title: "Pull C", sub: "Back and arms", groups: [
    { rest: 120, items: [s("barbell_row", 3, 8, 10)] },
    { rest: 90, items: [s("cable_pullover", 3, 12, 15, { rp: true }), s("smith_calf", 3, 12, 20)] },
    { rest: 90, items: [s("hammer_curl", 4, 10, 12), s("face_pull", 2, 15, 20)] },
    { rest: 90, items: [s("db_lateral", 2, 15, 20, { rp: true, sundayRaise: true }), s("smith_glute_bridge", 2, 10, 15)] },
  ]},
};

export const WEEK_ORDER = ["TUE", "WED", "THU", "FRI", "SAT", "SUN", "MON"];
