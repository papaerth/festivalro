// Browser E2E (Playwright + Chromium): drives the studio UI end-to-end, including clipboard copy.
// Usage: BASE_URL=http://localhost:3100 node scripts/e2e-test.mjs
import { chromium } from "playwright";
import fs from "node:fs";

const BASE = process.env.BASE_URL || "http://localhost:3100";
const OUT = process.env.SHOT_DIR || "test-results";
fs.mkdirSync(OUT, { recursive: true });
let failures = 0;
const ok = (cond, msg) => { if (cond) console.log(`  ✓ ${msg}`); else { failures++; console.error(`  ✗ ${msg}`); } };

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const context = await browser.newContext({ viewport: { width: 1380, height: 920 }, permissions: ["clipboard-read", "clipboard-write"], locale: "ko-KR" });
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });

try {
  console.log(`LUMEROVIA e2e → ${BASE}`);
  await page.goto(BASE, { waitUntil: "networkidle" });
  ok(await page.locator("h1").first().isVisible(), "dashboard renders");
  await page.screenshot({ path: `${OUT}/01-dashboard.png`, fullPage: true });

  await page.getByTestId("new-project").click();
  await page.waitForURL(/\/studio\//, { timeout: 30000 });
  await page.waitForSelector('[data-testid="panel-1"]');
  ok(true, `studio opened: ${page.url()}`);

  // Step 1: reference lyrics + rights
  const ref = "[Verse 1]\nThe road still bends the way it did / when we were young\nI counted every step we hid / beneath the sun\n\n[Chorus]\nWhere the old road bends\nThat's where I find you still";
  await page.getByTestId("reference-lyrics").fill(ref);
  await page.getByTestId("rights-own").click();
  ok(await page.getByTestId("analysis").isVisible(), "live analysis panel visible");
  await page.waitForFunction(() => document.querySelector('[data-testid="autosave"]')?.getAttribute("data-status") === "saved", null, { timeout: 15000 });
  ok(true, "autosave indicator reached 'saved'");
  await page.screenshot({ path: `${OUT}/02-reference.png`, fullPage: true });

  // Step 2: titles
  await page.getByTestId("next-to-title").click();
  await page.getByTestId("emotion-love").click();
  await page.getByTestId("generate-titles").click();
  await page.waitForSelector('[data-testid="title-candidates"]', { timeout: 120000 });
  const cardCount = await page.locator('[data-testid="title-candidates"] > *').count();
  ok(cardCount >= 10, `title candidates rendered (${cardCount})`);
  await page.getByTestId("select-title-0").click();
  await page.waitForSelector('[data-testid="selected-title"]');
  const title = await page.getByTestId("project-title").inputValue();
  ok(title.length > 0, `title selected: "${title}"`);
  await page.screenshot({ path: `${OUT}/03-titles.png`, fullPage: true });

  // Step 3: lyrics + rewrite
  await page.getByTestId("next-to-lyrics").click();
  await page.getByTestId("generate-lyrics").click();
  await page.waitForFunction(() => (document.querySelector('[data-testid="lyrics-editor"]')?.value?.length ?? 0) > 200, null, { timeout: 180000 });
  const lyrics = await page.getByTestId("lyrics-editor").inputValue();
  ok(/\[Chorus\]/.test(lyrics), "lyrics generated with sections");
  // select first two sung lines and rewrite
  const lines = lyrics.split("\n");
  const firstSung = lines.findIndex((l) => l.trim() && !l.startsWith("["));
  const start = lines.slice(0, firstSung).join("\n").length + (firstSung ? 1 : 0);
  const end = start + lines[firstSung].length + 1 + lines[firstSung + 1].length;
  await page.getByTestId("lyrics-editor").evaluate((el, [s, e]) => { el.focus(); el.setSelectionRange(s, e); }, [start, end]);
  await page.keyboard.press("Shift");
  await page.getByTestId("rewrite-instruction").fill("더 따뜻하게");
  await page.getByTestId("rewrite-btn").click();
  await page.waitForSelector('[data-testid="rewrite-preview"]', { timeout: 120000 });
  await page.getByTestId("apply-rewrite").click();
  const lyrics2 = await page.getByTestId("lyrics-editor").inputValue();
  ok(lyrics2 !== lyrics && lyrics2.split("\n").length === lyrics.split("\n").length, "partial rewrite applied, line count unchanged");
  await page.getByTestId("tab-precision").click();
  ok(await page.getByTestId("precision-table").isVisible(), "precision edit comparison table visible (own rights)");
  await page.screenshot({ path: `${OUT}/04-lyrics.png`, fullPage: true });

  // Step 4: styles
  await page.getByTestId("next-to-style").click();
  await page.getByTestId("generate-styles").click();
  await page.waitForSelector('[data-testid="style-main"]', { timeout: 120000 });
  ok(await page.getByTestId("style-C").isVisible() && await page.getByTestId("style-A").isVisible() && await page.getByTestId("style-B").isVisible(), "C / A / B style cards rendered");
  ok(await page.getByTestId("style-C1").isVisible() && await page.getByTestId("style-C2").isVisible() && await page.getByTestId("style-C3").isVisible(), "C1 / C2 / C3 variants rendered");
  await page.getByTestId("choose-style-B").click();
  await page.getByTestId("choose-style-C").click();
  await page.screenshot({ path: `${OUT}/05-styles.png`, fullPage: true });

  // Step 5: export + clipboard
  await page.getByTestId("next-to-export").click();
  await page.waitForSelector('[data-testid="copy-title"]');
  for (const [tid, expectedFrom] of [["copy-title", "title"], ["copy-lyrics", "lyrics"], ["copy-style", "style"], ["copy-exclude", "exclude"]]) {
    await page.getByTestId(tid).click();
    const clip = await page.evaluate(() => navigator.clipboard.readText());
    const shown = await page.locator(`[data-testid="block-${expectedFrom}"] pre`).innerText();
    ok(clip.trim().length > 0 && clip.trim() === shown.trim(), `${tid} copies exactly the shown ${expectedFrom} (${clip.length} chars)`);
  }
  const clipTitle = await (async () => { await page.getByTestId("copy-title").click(); return page.evaluate(() => navigator.clipboard.readText()); })();
  ok(!/Song Title|Copy/.test(clipTitle), "copied title has no labels/explanations");
  await page.screenshot({ path: `${OUT}/06-export.png`, fullPage: true });

  // Versions drawer
  await page.getByTestId("open-versions").click();
  await page.waitForSelector('[data-testid="versions-drawer"]');
  await page.waitForSelector('[data-testid="version-item"]');
  const vcount = await page.locator('[data-testid="version-item"]').count();
  ok(vcount >= 3, `version history has entries (${vcount})`);
  await page.getByTestId("save-version").click();
  await page.waitForFunction((n) => document.querySelectorAll('[data-testid="version-item"]').length > n, vcount, { timeout: 15000 });
  ok(true, "manual version saved");
  await page.screenshot({ path: `${OUT}/07-versions.png`, fullPage: true });
  await page.keyboard.press("Escape");
  await page.mouse.click(10, 400);

  // Reload: state persisted?
  await page.reload({ waitUntil: "networkidle" });
  const reloadedTitle = await page.getByTestId("project-title").inputValue();
  ok(reloadedTitle === title, "project state persisted across reload");
  ok(await page.getByTestId("panel-5").isVisible(), "reopens on the last step");

  // Mobile viewport
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(page.url(), { waitUntil: "networkidle" });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  ok(overflow <= 2, `no horizontal overflow on mobile (${overflow}px)`);
  await page.screenshot({ path: `${OUT}/08-mobile.png`, fullPage: true });

  // Presets page
  await page.setViewportSize({ width: 1380, height: 920 });
  await page.goto(`${BASE}/presets`, { waitUntil: "networkidle" });
  ok(await page.getByTestId("preset-C").isVisible() && await page.getByTestId("add-preset").isVisible(), "presets page renders with C and add button");
  await page.screenshot({ path: `${OUT}/09-presets.png`, fullPage: true });

  const realErrors = errors.filter((e) => !/favicon|hydrat|Download the React DevTools|fonts\.g/i.test(e));
  ok(realErrors.length === 0, realErrors.length ? `console/page errors: ${realErrors.slice(0, 3).join(" | ")}` : "no console/page errors");
} catch (e) {
  failures++;
  console.error("  ✗ e2e crashed:", e);
  await page.screenshot({ path: `${OUT}/error.png`, fullPage: true }).catch(() => {});
} finally {
  await browser.close();
}
console.log(failures ? `\n${failures} FAILED` : "\nALL PASSED");
process.exit(failures ? 1 : 0);
