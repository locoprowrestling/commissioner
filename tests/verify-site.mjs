import { readFileSync, existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CARDS, CAST, ENDINGS, METERS } from "../cards.js";
import { newGame, drawCard, choose, TOTAL_DAYS, COUNTER_ENDINGS } from "../engine.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const errors = [];
const fail = (m) => errors.push(m);
const meterIds = new Set(METERS.map((m) => m.id));
const ids = new Set();

for (const c of CARDS) {
  if (ids.has(c.id)) fail(`duplicate card id ${c.id}`);
  ids.add(c.id);
  if (!CAST[c.who]) fail(`${c.id}: unknown who ${c.who}`);
  if (!c.text) fail(`${c.id}: no text`);
  for (const side of ["left", "right"]) {
    const o = c[side];
    if (!o || !o.label) { fail(`${c.id}.${side}: missing option or label`); continue; }
    if (o.label.length > 34) fail(`${c.id}.${side}: label too long (${o.label.length})`);
    for (const [m, v] of Object.entries(o.fx || {})) {
      if (!meterIds.has(m)) fail(`${c.id}.${side}: unknown meter ${m}`);
      if (!Number.isInteger(v) || Math.abs(v) > 25) fail(`${c.id}.${side}: bad fx ${m}=${v}`);
    }
    if (o.end && !ENDINGS[o.end]) fail(`${c.id}.${side}: unknown ending ${o.end}`);
    const nexts = o.next ? (Array.isArray(o.next) ? o.next : [o.next]) : [];
    for (const n of nexts) if (!CARDS.find((x) => x.id === n.id)) fail(`${c.id}.${side}: next ${n.id} missing`);
  }
}
for (const c of CARDS) if (c.deck === false && c.id !== "intro" && !CARDS.some((x) => ["left", "right"].some((s) => [].concat(x[s].next || []).some((n) => n.id === c.id)))) fail(`${c.id}: queued-only card is never queued`);
for (const [k, e] of Object.entries(ENDINGS)) {
  if (e.id !== k) fail(`ending ${k}: id mismatch`);
  if (!CAST[e.who]) fail(`ending ${k}: unknown who ${e.who}`);
}
for (const m of METERS) for (const x of ["low", "high"]) if (!ENDINGS[`${m.id}-${x}`]) fail(`missing meter ending ${m.id}-${x}`);
for (const [, [, id]] of Object.entries(COUNTER_ENDINGS)) if (!ENDINGS[id]) fail(`missing counter ending ${id}`);

for (const [slug, c] of Object.entries(CAST)) {
  if (!c.sprite) continue;
  for (const p of ["idle", "yes", "no", "shock", "point"]) if (!existsSync(join(root, "assets/sprites", `${slug}-${p}.png`))) fail(`missing sprite ${slug}-${p}`);
}

const DASH = /[–—]/;
for (const f of ["cards.js", "engine.js", "ui.js", "index.html", "styles.css"]) {
  const t = readFileSync(join(root, f), "utf8");
  if (DASH.test(t)) fail(`${f}: contains an en or em dash`);
}
const html = readFileSync(join(root, "index.html"), "utf8");
for (const m of html.matchAll(/(?:src|href)="([^"#:]+)"/g)) if (!existsSync(join(root, m[1]))) fail(`index.html references missing file ${m[1]}`);

function seeded(seed) {
  return () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
}
function play(seed, policy) {
  const s = newGame(seeded(seed));
  for (let i = 0; i < 400; i++) {
    if (s.aside) s.aside = null;
    const card = drawCard(s);
    if (!card) throw new Error("no card drawn");
    const side = policy(s, card);
    const r = choose(s, side);
    if (r.ending) return { ending: r.ending.id, day: s.day, turns: s.turn };
  }
  throw new Error(`seed ${seed}: game never ended`);
}
const random = (s) => (s.rng() < 0.5 ? "left" : "right");
const careful = (s, card) => {
  const score = (side) => {
    if (card[side].end) return 1e9;
    let worst = 0;
    for (const m of METERS) worst = Math.max(worst, Math.abs(s.meters[m.id] + ((card[side].fx || {})[m.id] || 0) - 50));
    return worst;
  };
  return score("left") <= score("right") ? "left" : "right";
};
const report = {};
for (const [name, policy] of [["random", random], ["careful", careful]]) {
  const tally = {};
  let days = 0;
  let turns = 0;
  const N = 4000;
  for (let i = 1; i <= N; i++) {
    const r = play(i * 7919, policy);
    tally[r.ending] = (tally[r.ending] || 0) + 1;
    days += r.day;
    turns += r.turns;
  }
  report[name] = { winRate: ((tally.consequences || 0) / N).toFixed(3), avgDays: (days / N).toFixed(1), avgTurns: (turns / N).toFixed(1), endingsSeen: Object.keys(tally).length, tally };
}
const allSeen = new Set([...Object.keys(report.random.tally), ...Object.keys(report.careful.tally)]);
const unreached = Object.keys(ENDINGS).filter((k) => !allSeen.has(k));

console.log(JSON.stringify({ cards: CARDS.length, endings: Object.keys(ENDINGS).length, totalDays: TOTAL_DAYS, unreachedBySim: unreached, random: { ...report.random, tally: undefined }, careful: { ...report.careful, tally: undefined }, randomTally: report.random.tally }, null, 1));
if (TOTAL_DAYS !== 145) fail(`expected 145 days from Sep 1 2026 to Jan 24 2027, got ${TOTAL_DAYS}`);
if (unreached.length) fail(`endings never reached in simulation: ${unreached.join(", ")}`);
if (errors.length) {
  console.error("FAIL\n" + errors.join("\n"));
  process.exit(1);
}
console.log("PASS");
