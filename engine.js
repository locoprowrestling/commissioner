import { CAST, CARDS, ENDINGS, METERS } from "./cards.js";

export const START_DATE = new Date(2026, 8, 1);
export const SHOW_DATE = new Date(2027, 0, 24);
export const TOTAL_DAYS = Math.round((SHOW_DATE - START_DATE) / 86400000);
export const COUNTER_ENDINGS = { lies: [3, "sorry-zeak"], turnback: [3, "superkicked"], invoice: [3, "all-business"] };
const DEFAULT_COOLDOWN = 16;

const byId = new Map(CARDS.map((c) => [c.id, c]));

export function cardById(id) {
  return byId.get(id);
}

export function newGame(rng = Math.random) {
  const meters = {};
  for (const m of METERS) meters[m.id] = 50;
  return {
    rng,
    meters,
    day: 0,
    turn: 0,
    flags: new Set(),
    counters: {},
    seen: {},
    queue: [{ id: "intro", at: 0 }],
    lastWho: null,
    card: null,
    aside: null,
    ending: null,
  };
}

function reqOk(s, req) {
  if (!req) return true;
  if (req.flags && !req.flags.every((f) => s.flags.has(f))) return false;
  if (req.not && req.not.some((f) => s.flags.has(f))) return false;
  if (req.count) {
    for (const [k, v] of Object.entries(req.count)) if ((s.counters[k] || 0) < v) return false;
  }
  if (req.minTurn != null && s.turn < req.minTurn) return false;
  if (req.minDay != null && s.day < req.minDay) return false;
  return true;
}

function eligible(s, card) {
  if (card.deck === false) return false;
  const last = s.seen[card.id];
  if (last != null) {
    if (card.once) return false;
    if (s.turn - last < (card.cooldown ?? DEFAULT_COOLDOWN)) return false;
  }
  return reqOk(s, card.req);
}

export function drawCard(s) {
  const qi = s.queue.findIndex((q) => q.at <= s.turn && reqOk(s, byId.get(q.id).req));
  if (qi !== -1) {
    const [q] = s.queue.splice(qi, 1);
    s.card = byId.get(q.id);
  } else {
    let pool = CARDS.filter((c) => eligible(s, c) && c.who !== s.lastWho);
    if (!pool.length) pool = CARDS.filter((c) => c.deck !== false && !c.once && reqOk(s, c.req));
    const total = pool.reduce((a, c) => a + (c.weight ?? 1), 0);
    let r = s.rng() * total;
    s.card = pool[pool.length - 1];
    for (const c of pool) {
      r -= c.weight ?? 1;
      if (r <= 0) {
        s.card = c;
        break;
      }
    }
  }
  s.seen[s.card.id] = s.turn;
  s.lastWho = s.card.who;
  return s.card;
}

export function preview(card, side) {
  return card[side].fx || {};
}

export function choose(s, side) {
  const card = s.card;
  const opt = card[side];
  const before = { ...s.meters };
  for (const [m, v] of Object.entries(opt.fx || {})) s.meters[m] += v;
  for (const f of opt.set || []) s.flags.add(f);
  for (const f of opt.unset || []) s.flags.delete(f);
  for (const [k, v] of Object.entries(opt.count || {})) s.counters[k] = (s.counters[k] || 0) + v;
  for (const k of opt.reset || []) s.counters[k] = 0;
  if (opt.next) {
    const nexts = Array.isArray(opt.next) ? opt.next : [opt.next];
    for (const n of nexts) s.queue.push({ id: n.id, at: s.turn + 1 + (n.delay || 0) });
  }
  s.turn += 1;

  let ending = opt.end || null;
  if (!ending) {
    for (const [k, [limit, id]] of Object.entries(COUNTER_ENDINGS)) {
      if ((s.counters[k] || 0) >= limit) {
        ending = id;
        break;
      }
    }
  }
  if (!ending) {
    for (const m of METERS) {
      if (s.meters[m.id] <= 0) ending = `${m.id}-low`;
      else if (s.meters[m.id] >= 100) ending = `${m.id}-high`;
      if (ending) break;
    }
  }
  if (!ending && !card.noTime) {
    s.day += 2 + Math.floor(s.rng() * 4);
    if (s.day >= TOTAL_DAYS) {
      s.day = TOTAL_DAYS;
      ending = "consequences";
    }
  }
  for (const m of METERS) s.meters[m.id] = Math.max(0, Math.min(100, s.meters[m.id]));
  s.aside = opt.say && !ending ? opt.say : null;
  s.ending = ending ? ENDINGS[ending] : null;
  return { before, after: { ...s.meters }, ending: s.ending, aside: s.aside };
}

export function dateFor(day) {
  const d = new Date(START_DATE);
  d.setDate(d.getDate() + day);
  return d;
}

export { CAST, CARDS, ENDINGS, METERS };
