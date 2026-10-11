import { newGame, drawCard, choose, preview, dateFor, TOTAL_DAYS, CAST, ENDINGS, METERS } from "./engine.js";

const $ = (id) => document.getElementById(id);
const STORE_KEY = "commissioner.v1";
const SITE_URL = "https://commissioner.locopro.pw/";
const ENDING_IDS = Object.keys(ENDINGS);
const DRAG_COMMIT = 90;
const PREVIEW_AT = 24;
const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

let store = loadStore();
let s = null;
let busy = false;
let lastEnding = null;

function loadStore() {
  const blank = { endings: {}, best: 0, reigns: 0, wins: 0, muted: false };
  try {
    const raw = localStorage.getItem(STORE_KEY);
    return raw ? { ...blank, ...JSON.parse(raw) } : blank;
  } catch {
    return blank;
  }
}

function saveStore() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(store));
  } catch {
    /* storage unavailable: progress is per-session only */
  }
}

/* ---------- sound ---------- */
let audio = null;
function ctx() {
  if (store.muted) return null;
  try {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === "suspended") audio.resume();
    return audio;
  } catch {
    return null;
  }
}
function tone(freq, start, dur, type = "square", gain = 0.06) {
  const a = ctx();
  if (!a) return;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.setValueAtTime(gain, a.currentTime + start);
  g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + start + dur);
  o.connect(g).connect(a.destination);
  o.start(a.currentTime + start);
  o.stop(a.currentTime + start + dur + 0.02);
}
const sfx = {
  swipe: () => { tone(320, 0, 0.07); tone(480, 0.05, 0.08); },
  up: () => { tone(660, 0, 0.08, "triangle", 0.08); },
  down: () => { tone(180, 0, 0.12, "sawtooth", 0.05); },
  bell: () => { for (let i = 0; i < 3; i++) tone(1320, i * 0.32, 0.6, "sine", 0.12), tone(1980, i * 0.32, 0.4, "sine", 0.04); },
  win: () => { [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.13, 0.3, "square", 0.07)); },
};

/* ---------- portraits ---------- */
function portraitNode(who, pose = "idle", cls = "") {
  const c = CAST[who];
  if (c && c.sprite) {
    const img = new Image();
    img.src = `assets/sprites/${who}-${pose}.png`;
    img.alt = `${c.name}, pixel art`;
    img.draggable = false;
    img.className = cls;
    return img;
  }
  if (c && c.redacted) {
    const d = document.createElement("div");
    d.className = "redacted";
    d.setAttribute("role", "img");
    d.setAttribute("aria-label", `${c.name}, identity redacted`);
    d.innerHTML = "<span>[REDACTED]</span>";
    return d;
  }
  const e = document.createElement("div");
  e.className = "emoji";
  e.setAttribute("role", "img");
  e.setAttribute("aria-label", c ? c.name : "Unknown");
  e.textContent = c ? c.emoji : "?";
  return e;
}

function preloadSprites() {
  const urls = [];
  for (const p of ["idle", "yes", "no"]) {
    for (const [slug, c] of Object.entries(CAST)) if (c.sprite) urls.push(`assets/sprites/${slug}-${p}.png`);
  }
  const next = () => {
    const url = urls.shift();
    if (!url) return;
    const img = new Image();
    img.onload = img.onerror = next;
    img.src = url;
  };
  for (let i = 0; i < 4; i++) next();
}

/* ---------- HUD ---------- */
function buildMeters() {
  const wrap = $("meters");
  wrap.innerHTML = "";
  for (const m of METERS) {
    const el = document.createElement("div");
    el.className = "meter";
    el.dataset.m = m.id;
    el.innerHTML = `<span class="pip"></span><div class="meter-tile" role="meter" aria-label="${m.label}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="50"><div class="meter-fill"></div><span class="meter-icon" aria-hidden="true">${m.icon}</span></div><span class="meter-label">${m.label}</span>`;
    wrap.appendChild(el);
  }
}

function renderMeters(bumps) {
  for (const m of METERS) {
    const el = document.querySelector(`.meter[data-m="${m.id}"]`);
    const v = s.meters[m.id];
    el.querySelector(".meter-fill").style.height = `${v}%`;
    el.querySelector(".meter-tile").setAttribute("aria-valuenow", String(v));
    el.classList.toggle("danger", v <= 20 || v >= 80);
    if (bumps && bumps[m.id]) {
      el.classList.remove("bump-up", "bump-down");
      void el.offsetWidth;
      el.classList.add(bumps[m.id] > 0 ? "bump-up" : "bump-down");
    }
  }
  const d = dateFor(s.day);
  $("date").textContent = `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
  $("days-left").textContent = String(Math.max(0, TOTAL_DAYS - s.day));
}

function setPips(fx) {
  for (const m of METERS) {
    const pip = document.querySelector(`.meter[data-m="${m.id}"] .pip`);
    const v = fx ? Math.abs(fx[m.id] || 0) : 0;
    pip.className = "pip" + (v === 0 ? "" : v >= 10 ? " big" : " small");
  }
}

/* ---------- card ---------- */
const card = () => $("card");
let current = null;

function showCard() {
  const isAside = Boolean(s.aside);
  current = isAside ? null : drawCard(s);
  const el = card();
  el.className = "card enter" + (isAside ? " back" : "");
  el.style.transform = "";
  const portrait = $("portrait");
  portrait.innerHTML = "";
  const text = $("card-text");
  if (isAside) {
    const logo = new Image();
    logo.src = "assets/logo-badge.png";
    logo.alt = "";
    logo.className = "card-logo";
    portrait.appendChild(logo);
    text.textContent = s.aside;
    text.classList.add("aside");
    $("np-name").textContent = "Meanwhile";
    $("np-tag").textContent = "Swipe either way";
    $("left-label").textContent = "Continue";
    $("right-label").textContent = "Continue";
  } else {
    portrait.appendChild(portraitNode(current.who, "idle"));
    text.textContent = current.text;
    text.classList.remove("aside");
    const c = CAST[current.who];
    $("np-name").textContent = c.name;
    $("np-tag").textContent = c.tag;
    $("left-label").textContent = current.left.label;
    $("right-label").textContent = current.right.label;
  }
  setPreview(null);
  busy = false;
}

let previewSide = null;
function setPreview(side) {
  if (side === previewSide) return;
  previewSide = side;
  const banner = $("choice-banner");
  if (!side) {
    banner.className = "choice-banner";
    setPips(null);
    swapPose("idle");
    return;
  }
  if (s.aside) {
    banner.textContent = "Continue";
    banner.className = `choice-banner show ${side}`;
    return;
  }
  banner.textContent = current[side].label;
  banner.className = `choice-banner show ${side}`;
  setPips(preview(current, side));
  swapPose(side === "right" ? "yes" : "no");
}

function swapPose(pose) {
  if (!current) return;
  const c = CAST[current.who];
  if (!c || !c.sprite) return;
  const img = $("portrait").querySelector("img");
  if (img) img.src = `assets/sprites/${current.who}-${pose}.png`;
}

function commit(side) {
  if (busy || !s || s.ending) return;
  busy = true;
  setPreview(side);
  sfx.swipe();
  const el = card();
  el.classList.remove("snap", "dragging", "enter");
  const dir = side === "right" ? 1 : -1;
  el.classList.add("fly");
  el.style.transform = `translate(${dir * 140}%, 10%) rotate(${dir * 24}deg)`;
  setTimeout(() => resolve(side), 300);
}

function resolve(side) {
  if (s.aside) {
    s.aside = null;
    showCard();
    return;
  }
  const res = choose(s, side);
  const bumps = {};
  let ups = 0;
  let downs = 0;
  for (const m of METERS) {
    const d = res.after[m.id] - res.before[m.id];
    if (d) bumps[m.id] = d;
    if (d > 0) ups++;
    if (d < 0) downs++;
  }
  setPips(null);
  renderMeters(bumps);
  if (ups >= downs && ups) sfx.up();
  else if (downs) sfx.down();
  if (res.ending) {
    setTimeout(() => showEnding(res.ending), 650);
  } else {
    showCard();
  }
}

/* ---------- drag ---------- */
function setupDrag() {
  const el = card();
  let startX = 0;
  let dx = 0;
  let active = false;
  let pid = null;

  el.addEventListener("pointerdown", (e) => {
    if (busy) return;
    active = true;
    pid = e.pointerId;
    startX = e.clientX;
    dx = 0;
    el.setPointerCapture(pid);
    el.classList.remove("snap", "enter");
    el.classList.add("dragging");
    ctx();
  });
  el.addEventListener("pointermove", (e) => {
    if (!active || e.pointerId !== pid) return;
    dx = e.clientX - startX;
    el.style.transform = `translateX(${dx}px) rotate(${dx / 18}deg)`;
    setPreview(Math.abs(dx) > PREVIEW_AT ? (dx > 0 ? "right" : "left") : null);
  });
  const end = (e) => {
    if (!active || e.pointerId !== pid) return;
    active = false;
    el.classList.remove("dragging");
    if (Math.abs(dx) > DRAG_COMMIT) {
      commit(dx > 0 ? "right" : "left");
    } else {
      el.classList.add("snap");
      el.style.transform = "";
      setPreview(null);
    }
  };
  el.addEventListener("pointerup", end);
  el.addEventListener("pointercancel", end);

  for (const [id, side] of [["left-button", "left"], ["right-button", "right"]]) {
    const b = $(id);
    b.addEventListener("click", () => commit(side));
    b.addEventListener("pointerenter", () => !busy && setPreview(side));
    b.addEventListener("pointerleave", () => !busy && setPreview(null));
    b.addEventListener("focus", () => !busy && setPreview(side));
    b.addEventListener("blur", () => !busy && setPreview(null));
  }

  document.addEventListener("keydown", (e) => {
    if ($("play-screen").hidden || busy) return;
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault();
      const side = e.key === "ArrowLeft" ? "left" : "right";
      setPreview(side);
      busy = true;
      setTimeout(() => { busy = false; commit(side); }, 220);
    }
  });
}

/* ---------- screens ---------- */
function show(screen) {
  for (const id of ["title-screen", "play-screen", "end-screen", "gallery-screen"]) $(id).hidden = id !== screen;
  $("hud").hidden = screen !== "play-screen";
  window.scrollTo(0, 0);
}

function startGame() {
  ctx();
  s = newGame();
  lastEnding = null;
  show("play-screen");
  renderMeters();
  showCard();
}

function showEnding(ending) {
  lastEnding = ending;
  const firstTime = !store.endings[ending.id];
  store.endings[ending.id] = (store.endings[ending.id] || 0) + 1;
  store.reigns += 1;
  if (ending.win) store.wins += 1;
  store.best = Math.max(store.best, s.day);
  saveStore();

  const end = $("end-screen");
  end.classList.toggle("win", Boolean(ending.win));
  $("end-kicker").textContent = ending.win ? "You survived" : "Your reign is over";
  $("end-title").textContent = ending.title;
  $("end-text").textContent = ending.text;
  const p = $("end-portrait");
  p.innerHTML = "";
  p.appendChild(portraitNode(ending.who, ending.win ? "yes" : ending.who === "adam-starling" ? "shock" : "point"));
  const found = Object.keys(store.endings).filter((k) => ENDINGS[k]).length;
  $("end-stats").innerHTML =
    `Reign #${store.reigns}: <b>${s.day}</b> of ${TOTAL_DAYS} days, ${s.turn} decisions<br>` +
    (firstTime ? `<b>New ending unlocked</b> (${found}/${ENDING_IDS.length})` : `Best reign: ${store.best} days`);
  $("share-status").textContent = "";
  updateCounts();
  show("end-screen");
  if (ending.win) sfx.win();
  else sfx.bell();
}

function updateCounts() {
  const found = Object.keys(store.endings).filter((k) => ENDINGS[k]).length;
  for (const id of ["ending-count-title", "ending-count-end"]) $(id).textContent = String(found);
  for (const el of document.querySelectorAll(".ending-total")) el.textContent = String(ENDING_IDS.length);
  $("records").innerHTML = store.reigns
    ? `Reigns: ${store.reigns} | Best: ${store.best} days${store.wins ? ` | Made it to Consequences: ${store.wins}x` : ""}`
    : "";
}

let galleryReturn = "title-screen";
function showGallery(from) {
  galleryReturn = from;
  const list = $("gallery");
  list.innerHTML = "";
  for (const id of ENDING_IDS) {
    const e = ENDINGS[id];
    const got = Boolean(store.endings[id]);
    const li = document.createElement("li");
    li.className = (got ? "" : "locked") + (e.win ? " win" : "");
    li.innerHTML = `<span class="g-icon" aria-hidden="true">${got ? (e.win ? "🏆" : "🔔") : "🔒"}</span><span><strong></strong><small></small></span>`;
    li.querySelector("strong").textContent = got ? e.title : "???";
    li.querySelector("small").textContent = got ? `Reached ${store.endings[id]}x` : "Not yet. Keep making bad decisions.";
    list.appendChild(li);
  }
  show("gallery-screen");
}

/* ---------- share ---------- */
function shareText() {
  if (!lastEnding) return `Can you survive as Commissioner of LoCo Pro Wrestling? ${SITE_URL}`;
  if (lastEnding.win) return `I survived ${TOTAL_DAYS} days as Commissioner of LoCo Pro Wrestling and made it to Consequences on Coffman Street. Can you? ${SITE_URL}`;
  return `I lasted ${s.day} days as Commissioner of LoCo Pro Wrestling. Ending: "${lastEnding.title}." Can you beat it? ${SITE_URL}`;
}

function loadImage(src) {
  return new Promise((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = rej;
    i.src = src;
  });
}

function wrap(ctx2, text, x, y, maxW, lh) {
  const words = text.split(" ");
  let line = "";
  for (const w of words) {
    const t = line ? `${line} ${w}` : w;
    if (ctx2.measureText(t).width > maxW && line) {
      ctx2.fillText(line, x, y);
      y += lh;
      line = w;
    } else line = t;
  }
  if (line) ctx2.fillText(line, x, y);
  return y + lh;
}

async function shareImage() {
  const W = 1080;
  const H = 1350;
  const cv = document.createElement("canvas");
  cv.width = W;
  cv.height = H;
  const g = cv.getContext("2d");
  try {
    await Promise.all([document.fonts.load('80px "Archivo Black"'), document.fonts.load('40px "Press Start 2P"'), document.fonts.load('700 44px "Barlow Condensed"')]);
  } catch {
    /* fall back to system fonts */
  }
  const bg = g.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, "#0d3a30");
  bg.addColorStop(0.55, "#080b0a");
  g.fillStyle = bg;
  g.fillRect(0, 0, W, H);
  g.fillStyle = "rgba(224,69,58,0.5)";
  for (let i = 0; i < 3; i++) g.fillRect(0, 590 + i * 62, W, 8);
  g.textAlign = "center";
  g.fillStyle = "#f3b51b";
  g.font = '28px "Press Start 2P", monospace';
  g.fillText("LOCO PRO WRESTLING", W / 2, 110);
  g.fillStyle = "#00866a";
  g.font = '112px "Archivo Black", Impact, sans-serif';
  g.fillText("COMMISSIONER", W / 2 + 8, 238);
  g.fillStyle = "#f4f0e5";
  g.fillText("COMMISSIONER", W / 2, 230);

  const who = lastEnding ? lastEnding.who : "adam-starling";
  if (CAST[who] && CAST[who].sprite) {
    try {
      const img = await loadImage(`assets/sprites/${who}-${lastEnding && lastEnding.win ? "yes" : "shock"}.png`);
      g.imageSmoothingEnabled = false;
      const h = 460;
      const w = Math.round((img.width / img.height) * h);
      g.drawImage(img, W / 2 - w / 2, 300, w, h);
    } catch {
      /* sprite missing: skip */
    }
  } else if (CAST[who]) {
    g.font = "300px serif";
    g.fillText(CAST[who].emoji || "?", W / 2, 680);
  }

  g.fillStyle = "#f4f0e5";
  g.font = '700 50px "Barlow Condensed", sans-serif';
  const line1 = lastEnding && lastEnding.win ? `I survived all ${TOTAL_DAYS} days` : `I lasted ${s ? s.day : 0} days`;
  g.fillText(line1, W / 2, 860);
  g.fillStyle = lastEnding && lastEnding.win ? "#f3b51b" : "#e0453a";
  g.font = '76px "Archivo Black", Impact, sans-serif';
  const title = (lastEnding ? lastEnding.title : "").toUpperCase();
  wrap(g, title, W / 2, 960, W - 120, 84);
  g.fillStyle = "#9aa39d";
  g.font = '700 40px "Barlow Condensed", sans-serif';
  g.fillText("Can you survive running LoCo Pro?", W / 2, 1180);
  g.fillStyle = "#f3b51b";
  g.font = '30px "Press Start 2P", monospace';
  g.fillText("commissioner.locopro.pw", W / 2, 1260);
  return new Promise((res) => cv.toBlob(res, "image/png"));
}

async function share() {
  const status = $("share-status");
  const text = shareText();
  status.textContent = "Making your card...";
  let blob = null;
  try {
    blob = await shareImage();
  } catch {
    blob = null;
  }
  const file = blob ? new File([blob], "commissioner-reign.png", { type: "image/png" }) : null;
  try {
    if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], text, title: "COMMISSIONER" });
      status.textContent = "Shared. The locker room is talking.";
      return;
    }
    if (navigator.share) {
      await navigator.share({ text, url: SITE_URL, title: "COMMISSIONER" });
      status.textContent = "Shared. The locker room is talking.";
      return;
    }
  } catch (err) {
    if (err && err.name === "AbortError") {
      status.textContent = "";
      return;
    }
  }
  if (file) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(file);
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }
  try {
    await navigator.clipboard.writeText(text);
    status.textContent = file ? "Image saved and brag copied. Paste it anywhere." : "Brag copied. Paste it anywhere.";
  } catch {
    status.textContent = file ? "Image saved. Post it with #LoCoPro." : text;
  }
}

/* ---------- boot ---------- */
function setMuteLabel() {
  const b = $("mute-button");
  b.innerHTML = store.muted ? "&#128263;" : "&#128266;";
  b.setAttribute("aria-pressed", String(store.muted));
  b.setAttribute("aria-label", store.muted ? "Unmute sound" : "Mute sound");
}

function boot() {
  buildMeters();
  setupDrag();
  updateCounts();
  setMuteLabel();
  preloadSprites();
  $("start-button").addEventListener("click", startGame);
  $("again-button").addEventListener("click", startGame);
  $("share-button").addEventListener("click", share);
  $("gallery-button-title").addEventListener("click", () => showGallery("title-screen"));
  $("gallery-button-end").addEventListener("click", () => showGallery("end-screen"));
  $("gallery-back").addEventListener("click", () => show(galleryReturn));
  $("mute-button").addEventListener("click", () => {
    store.muted = !store.muted;
    saveStore();
    setMuteLabel();
  });
  window.__commissioner = { get state() { return s; }, ENDINGS };
}

boot();
