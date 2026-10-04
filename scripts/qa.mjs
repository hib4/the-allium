import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";
import fs from "node:fs";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext();
const page = await context.newPage();
const report = {
  accessibility: [],
  layouts: [],
  performance: null,
  errors: [],
};
page.on("pageerror", (e) => report.errors.push(e.message));
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
    await page.waitForTimeout(700);
    report.layouts.push({
      name,
      width,
      overflow: await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
    });
    const axe = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .analyze();
    report.accessibility.push({
      name,
      width,
      violations: axe.violations.map((v) => ({
        id: v.id,
        impact: v.impact,
        nodes: v.nodes.map((n) => ({
          target: n.target,
          summary: n.failureSummary,
        })),
      })),
    });
    await page.screenshot({
      path: `.impeccable/review/${name}-${width}.png`,
      fullPage: true,
    });
  }
}
await page.setViewportSize({ width: 3840, height: 768 });
await page.goto("http://localhost:5173/experience?performance=1");
const operator = await context.newPage();
await operator.goto("http://localhost:5173/control");
await operator.getByRole("button", { name: "Play demo", exact: true }).click();
await operator.getByLabel("Musical section").selectOption("Chorus");
await operator.getByLabel("Caption text").fill("We’re brighter together.");
await operator.getByRole("button", { name: "Send caption" }).click();
await page.bringToFront();
await page.waitForTimeout(3000);
await page.screenshot({ path: ".impeccable/review/panoramic-chorus.png" });
await page.addStyleTag({ content: "canvas {filter:grayscale(1)}" });
await page.screenshot({ path: ".impeccable/review/panoramic-grayscale.png" });
report.performance = await page.evaluate(
  () =>
    new Promise((resolve) => {
      let start = performance.now(),
        last = start,
        frames = [];
      function frame(now) {
        frames.push(now - last);
        last = now;
        if (now - start < 20000) requestAnimationFrame(frame);
        else {
          frames.sort((a, b) => a - b);
          resolve({
            durationMs: now - start,
            frames: frames.length,
            meanFrameMs: frames.reduce((a, b) => a + b, 0) / frames.length,
            p95FrameMs: frames[Math.floor(frames.length * 0.95)],
          });
        }
      }
      requestAnimationFrame(frame);
    }),
);
fs.writeFileSync(".impeccable/review/qa.json", JSON.stringify(report, null, 2));
console.log(JSON.stringify(report));
await browser.close();
