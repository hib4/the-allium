import { writeFile, mkdir } from "node:fs/promises";
import { chromium } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext();
const page = await context.newPage();
const report = [];
for (const width of [1440, 320]) {
  await page.setViewportSize({ width, height: 900 });
  await page.goto("http://127.0.0.1:8765/control");
  await page
    .getByText("Settings backup and troubleshooting", { exact: true })
    .click();
  report.push({
    width,
    overflow: await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    violations: (await new AxeBuilder({ page }).analyze()).violations.map(
      (v) => v.id,
    ),
  });
  await page.screenshot({
    path: `.impeccable/review/release-help-${width}.png`,
    fullPage: true,
  });
}
await mkdir("artifacts/verification",{recursive:true});
await writeFile("artifacts/verification/ui-qa.json",JSON.stringify(report,null,2));
console.log(JSON.stringify(report));
await browser.close();
if (report.some((r) => r.overflow || r.violations.length)) process.exitCode = 1;
