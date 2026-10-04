import { chromium } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import fs from "node:fs";
const out = ".impeccable/review/concert";
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({
  channel: "chrome",
  headless: true,
  args: ["--window-size=3840,900"],
});
const context = await browser.newContext({
  viewport: { width: 3840, height: 768 },
  recordVideo: { dir: out + "/video", size: { width: 1440, height: 288 } },
});
const page = await context.newPage(),
  operator = await context.newPage();
const report = { errors: [], layouts: [], accessibility: [], performance: [] };
page.on("pageerror", (e) => report.errors.push(e.message));
await operator.goto("http://localhost:5173/control");
await operator.getByRole("button", { name: "Play demo", exact: true }).click();
await operator.getByLabel("Caption text").fill("We’re brighter together.");
await operator.getByRole("button", { name: "Send caption" }).click();
await page.setViewportSize({ width: 3840, height: 768 });
await page.goto("http://localhost:5173/experience?performance=1");
await page.locator("[data-renderer]").waitFor();
for (const section of [
  "Quiet Section",
  "Chorus",
  "Guitar Solo",
  "Vocal Section",
  "Drum Breakdown",
]) {
  await operator.getByLabel("Musical section").selectOption(section);
  await page.bringToFront();
  await page.waitForTimeout(2600);
  const name = section.toLowerCase().replaceAll(" ", "-");
  for (let n = 0; n < 4; n++) {
    await page.screenshot({ path: `${out}/${name}-${n}.png` });
    await page.waitForTimeout(700);
  }
}
if (process.argv.includes("--motion-only")) {
  const video = page.video();
  await context.close();
  await video.saveAs(out + "/concert-motion.webm");
  await browser.close();
  process.exit(0);
}
await operator.getByLabel("Musical section").selectOption("Chorus");
for (const scene of [
  "Ensemble",
  "Vocal Focus",
  "Guitar Focus",
  "Percussion Focus",
  "Calm Mode",
]) {
  await operator.getByRole("button", { name: scene, exact: true }).click();
  await page.bringToFront();
  await page.waitForTimeout(2200);
  await page.screenshot({
    path: `${out}/${scene.toLowerCase().replaceAll(" ", "-")}.png`,
  });
}
await operator.getByRole("button", { name: "Ensemble", exact: true }).click();
await operator.getByLabel("Reduced motion").check();
await page.bringToFront();
await page.waitForTimeout(700);
await page.screenshot({ path: `${out}/reduced.png` });
await operator.getByLabel("Reduced motion").uncheck();
const gray = await page.addStyleTag({
  content: "canvas {filter:grayscale(1)}",
});
await page.screenshot({ path: `${out}/grayscale.png` });
await gray.evaluate((el) => el.remove());
for (const backend of ["webgl", "canvas"]) {
  await page.goto(
    `http://localhost:5173/experience?performance=1${backend === "canvas" ? "&renderer=canvas" : ""}`,
  );
  await page.bringToFront();
  await page.waitForTimeout(3000);
  const result = await page.evaluate(
    () =>
      new Promise((resolve) => {
        const start = performance.now();
        let last = start;
        const frames = [];
        const next = (now) => {
          frames.push(now - last);
          last = now;
          if (now - start < 12000) requestAnimationFrame(next);
          else {
            frames.sort((a, b) => a - b);
            resolve({
              duration: now - start,
              fps: (frames.length * 1000) / (now - start),
              p95: frames[Math.floor(frames.length * 0.95)],
              quality:
                document.querySelector(".score-renderer").dataset.quality,
            });
          }
        };
        requestAnimationFrame(next);
      }),
  );
  report.performance.push({ backend, ...result });
  await page.screenshot({ path: `${out}/${backend}-panoramic.png` });
}
await operator.close();
for (const width of [1440, 320]) {
  await page.setViewportSize({ width, height: width === 320 ? 800 : 1000 });
  for (const [route, name] of [
    ["/", "home"],
    ["/experience", "experience"],
    ["/tutorial", "tutorial"],
    ["/control", "control"],
    ["/follow", "follow"],
  ]) {
    await page.goto("http://localhost:5173" + route);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(500);
    const axe = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .analyze();
    report.accessibility.push({
      name,
      width,
      violations: axe.violations.map((v) => ({
        id: v.id,
        targets: v.nodes.map((n) => n.target),
      })),
    });
    report.layouts.push({
      name,
      width,
      overflow: await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
    });
    await page.screenshot({
      path: `${out}/${name}-${width}.png`,
      fullPage: true,
    });
  }
}
fs.writeFileSync(`${out}/report.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report));
const video = page.video();
await context.close();
await video.saveAs(out + "/concert-motion.webm");
await browser.close();
