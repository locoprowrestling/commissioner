import { chromium } from "/Users/gecko/locoprowrestling/LoCoProGenFactory/animations/node_modules/playwright/index.mjs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdirSync } from "node:fs";

const base = process.argv[2] || "http://localhost:8765/";
const out = process.argv[3] || join(dirname(fileURLToPath(import.meta.url)), "..", "output");
mkdirSync(out, { recursive: true });
const problems = [];
const b = await chromium.launch({ channel: "chrome" });
const page = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: false });
await page.addInitScript(() => {
  Object.defineProperty(navigator, "share", { value: undefined, configurable: true });
  Object.defineProperty(navigator, "canShare", { value: undefined, configurable: true });
});
page.on("console", (m) => { if (m.type() === "error") problems.push(`console: ${m.text()}`); });
page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
page.on("requestfailed", (r) => problems.push(`requestfailed: ${r.url()}`));
page.on("response", (r) => { if (r.status() >= 400) problems.push(`HTTP ${r.status()}: ${r.url()}`); });

await page.goto(base, { waitUntil: "networkidle" });
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: join(out, "01-title.png") });
await page.click("#start-button");
await page.waitForTimeout(500);
await page.screenshot({ path: join(out, "02-first-card.png") });

const box = await page.locator("#card").boundingBox();
const cx = box.x + box.width / 2;
const cy = box.y + box.height / 2;
await page.mouse.move(cx, cy);
await page.mouse.down();
for (let i = 1; i <= 8; i++) await page.mouse.move(cx + i * 9, cy, { steps: 2 });
await page.waitForTimeout(150);
await page.screenshot({ path: join(out, "03-drag-preview.png") });
for (let i = 9; i <= 18; i++) await page.mouse.move(cx + i * 9, cy, { steps: 2 });
await page.mouse.up();
await page.waitForTimeout(700);

const live = (pg) => pg.evaluate(() => { const st = window.__commissioner && window.__commissioner.state; return !document.getElementById("play-screen").hidden && !(st && st.ending); });
const results = [];
for (let game = 0; game < 4; game++) {
  if (game > 0) { await page.click("#again-button"); await page.waitForTimeout(450); }
  let guard = 0;
  let shotMid = false;
  while ((await live(page)) && guard < 120) {
    guard++;
    const side = Math.random() < 0.5 ? "#left-button" : "#right-button";
    await page.click(side);
    await page.waitForTimeout(380);
    if (!shotMid && game === 0 && guard === 6) { await page.screenshot({ path: join(out, "04-mid-game.png") }); shotMid = true; }
  }
  await page.waitForSelector("#end-screen:not([hidden])", { timeout: 4000 });
  await page.waitForTimeout(300);
  const title = await page.textContent("#end-title");
  const stats = await page.textContent("#end-stats");
  results.push({ title, stats, decisions: guard });
  if (game === 0) await page.screenshot({ path: join(out, "05-ending.png"), fullPage: true });
}

await page.evaluate(() => { const s = window.__commissioner.state; s.day = 143; });
await page.click("#again-button");
await page.waitForTimeout(400);
await page.evaluate(() => { const s = window.__commissioner.state; s.day = 144; for (const k in s.meters) s.meters[k] = 50; s.queue = []; });
let g2 = 0;
while ((await live(page)) && g2 < 10) {
  g2++;
  await page.click("#right-button");
  await page.waitForTimeout(380);
}
await page.waitForSelector("#end-screen:not([hidden])", { timeout: 4000 });
await page.waitForTimeout(300);
const winTitle = await page.textContent("#end-title");
await page.screenshot({ path: join(out, "06-win.png"), fullPage: true });

await page.click("#gallery-button-end");
await page.waitForTimeout(200);
await page.screenshot({ path: join(out, "07-gallery.png"), fullPage: true });
const unlocked = await page.locator("#gallery li:not(.locked)").count();
await page.click("#gallery-back");

const dl = page.waitForEvent("download", { timeout: 5000 }).catch(() => null);
await page.click("#share-button");
const download = await dl;
if (download) await download.saveAs(join(out, "08-share-card.png"));
await page.waitForTimeout(600);
const shareStatus = await page.textContent("#share-status");

const links = await page.$$eval(".real-show a", (as) => as.map((a) => a.href));
const page2 = await b.newPage({ viewport: { width: 390, height: 844 } });
await page2.addInitScript(() => {
  navigator.canShare = (d) => Boolean(d && d.files);
  navigator.share = async (d) => { window.__shared = { bytes: d.files[0].size, type: d.files[0].type, text: d.text }; };
});
await page2.goto(base, { waitUntil: "networkidle" });
await page2.click("#start-button");
for (let i = 0; i < 150 && (await live(page2)); i++) { await page2.click("#left-button"); await page2.waitForTimeout(360); }
await page2.waitForSelector("#end-screen:not([hidden])");
await page2.click("#share-button");
await page2.waitForFunction(() => window.__shared, null, { timeout: 8000 });
const nativeShare = await page2.evaluate(() => window.__shared);
const nativeStatus = await page2.textContent("#share-status");
await b.close();
console.log(JSON.stringify({ results, winTitle, unlocked, shareStatus, shareDownloaded: Boolean(download), nativeShare, nativeStatus, links, problems }, null, 1));
if (problems.length || winTitle !== "Consequences" || !download || !nativeShare || nativeShare.bytes < 20000) process.exit(1);
