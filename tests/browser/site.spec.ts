import { test, expect } from "@playwright/test";
test("operator controls a display tab and sends readable Unicode captions", async ({
  context,
  page,
}) => {
  await page.goto("/control");
  const display = await context.newPage();
  await display.goto("/experience");
  await page.bringToFront();
  await expect(page.getByText("1 display connected")).toBeVisible();
  await page.getByRole("button", { name: "Play demo", exact: true }).click();
  await expect(display.getByText("DEMO PLAYING")).toBeVisible();
  await page.getByRole("button", { name: "Guitar Focus", exact: true }).click();
  await expect(
    display.getByRole("button", { name: "Guitar Focus", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page
    .getByLabel("Caption text")
    .fill("Selamat datang — we’re brighter together.");
  await page.getByRole("button", { name: "Send caption" }).click();
  await expect(
    display.getByText("“Selamat datang — we’re brighter together.”"),
  ).toBeVisible();
  await page.getByRole("button", { name: "Clear", exact: true }).click();
  await expect(
    display.getByText("A little space between the words."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await expect(display.getByText("DEMO PAUSED")).toBeVisible();
});
test("routes reflow at 320px and every control has a useful state", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 800 });
  for (const route of [
    "/",
    "/experience",
    "/tutorial",
    "/control",
    "/follow",
  ]) {
    await page.goto(route);
    await expect(page.locator("main")).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await page.getByRole("button", { name: "guitar", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "guitar", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByLabel("High contrast").check();
  await expect(page.locator(".follow-page")).toHaveClass(/high-contrast/);
  await page.getByLabel("Reduced motion").check();
  await page.reload();
  await expect(page.getByLabel("Reduced motion")).toBeChecked();
});
test("panoramic performance view keeps captions and hides website chrome", async ({
  page,
}) => {
  await page.setViewportSize({ width: 3840, height: 768 });
  await page.goto("/experience?performance=1");
  await expect(page.locator(".site-header")).toHaveCount(0);
  await expect(page.locator(".captions")).toBeVisible();
  await expect(page.locator("canvas")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollHeight <= innerHeight,
    ),
  ).toBe(true);
  await page.keyboard.press("Escape");
  await expect(page.locator(".site-header")).toBeVisible();
});
test("respects reduced motion and keyboard focus", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/experience");
  await expect(page.getByLabel("Reduced motion")).toBeChecked();
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("link", { name: "Skip to content" }),
  ).toBeFocused();
});

test("operator ownership transfers after a controller closes", async ({
  context,
  page,
}) => {
  await page.goto("/control");
  const second = await context.newPage();
  await second.goto("/control");
  await expect(
    second.getByText(
      "Another operator tab holds control. Close that tab to take over.",
    ),
  ).toBeVisible();
  await expect(
    second.getByRole("button", { name: "Play demo", exact: true }),
  ).toBeDisabled();
  await page.close();
  await expect(
    second.getByRole("button", { name: "Play demo", exact: true }),
  ).toBeEnabled({ timeout: 6000 });
});

test("Canvas failure leaves readable captions and functional controls", async ({
  page,
}) => {
  await page.addInitScript(() => {
    HTMLCanvasElement.prototype.getContext = (() =>
      null) as typeof HTMLCanvasElement.prototype.getContext;
  });
  await page.goto("/experience");
  await expect(
    page.getByText(
      "Animated score unavailable. Captions and controls remain available.",
    ),
  ).toBeVisible();
  await page.getByRole("button", { name: "Play demo", exact: true }).click();
  await expect(page.getByText("DEMO PLAYING")).toBeVisible();
  await expect(
    page.getByText("This space belongs to all of us."),
  ).toBeVisible();
});

test("runtime assets load without any public internet requests", async ({
  page,
}) => {
  const external: string[] = [];
  await page.route("**/*", (route) => {
    const u = new URL(route.request().url());
    if (u.hostname !== "localhost") {
      external.push(u.hostname);
      void route.abort();
    } else void route.continue();
  });
  await page.goto("/follow");
  await expect(page.locator("canvas")).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  expect(external).toEqual([]);
});

test("maximum focus intensity uses valid Canvas opacity and long Unicode cues fit", async ({
  context,
  page,
}) => {
  await context.addInitScript(() => {
    const descriptor = Object.getOwnPropertyDescriptor(
      CanvasRenderingContext2D.prototype,
      "globalAlpha",
    )!;
    (window as unknown as { invalidAlpha: number[] }).invalidAlpha = [];
    Object.defineProperty(CanvasRenderingContext2D.prototype, "globalAlpha", {
      ...descriptor,
      set(value: number) {
        if (value < 0 || value > 1)
          (window as unknown as { invalidAlpha: number[] }).invalidAlpha.push(
            value,
          );
        descriptor.set!.call(this, value);
      },
    });
  });
  await page.goto("/control");
  const display = await context.newPage();
  await display.setViewportSize({ width: 3840, height: 768 });
  await display.goto("/experience?performance=1");
  await page.getByLabel("Overall intensity").fill("100");
  await page.getByLabel("Musical section").selectOption("Chorus");
  await page.getByRole("button", { name: "Play demo", exact: true }).click();
  for (const scene of ["Vocal Focus", "Guitar Focus", "Percussion Focus"]) {
    await page.getByRole("button", { name: scene, exact: true }).click();
    await display.waitForTimeout(1000);
    await display.screenshot({
      path: `.impeccable/review/fix-${scene.toLowerCase().replaceAll(" ", "-")}.png`,
    });
  }
  await page.getByLabel("Caption text").fill("音".repeat(180));
  await page.getByRole("button", { name: "Send caption" }).click();
  await expect(display.locator(".captions p")).toContainText("音".repeat(180));
  await display.screenshot({
    path: ".impeccable/review/fix-caption-panoramic.png",
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole("heading", { name: "Operator desk" }).click();
  await page.waitForTimeout(250);
  await page.screenshot({
    path: ".impeccable/review/control-1440.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 320, height: 800 });
  await page.waitForTimeout(250);
  await page.screenshot({
    path: ".impeccable/review/control-320.png",
    fullPage: true,
  });
  expect(
    await display.evaluate(
      () => document.documentElement.scrollHeight <= innerHeight,
    ),
  ).toBe(true);
  expect(
    (await display.locator(".score").boundingBox())!.height,
  ).toBeGreaterThan(300);
  expect(
    await display.evaluate(
      () => (window as unknown as { invalidAlpha: number[] }).invalidAlpha,
    ),
  ).toEqual([]);
  for (const [width, height] of [
    [320, 800],
    [1440, 900],
  ]) {
    await display.setViewportSize({ width, height });
    await display.bringToFront();
    await display.waitForTimeout(350);
    await display.screenshot({
      path: `.impeccable/review/fix-caption-${width}.png`,
    });
    expect(
      await display.evaluate(
        () => document.documentElement.scrollHeight <= innerHeight,
      ),
    ).toBe(true);
  }
});

test("GPU context loss replaces the canvas without losing demo or captions", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/experience");
  await expect(page.locator(".score-renderer")).toHaveAttribute(
    "data-renderer",
    "webgl",
  );
  await page.getByRole("button", { name: "Play demo", exact: true }).click();
  await page.evaluate(() =>
    document
      .querySelector(".score-renderer canvas")!
      .dispatchEvent(new Event("webglcontextlost", { cancelable: true })),
  );
  await expect(page.locator(".score-renderer")).toHaveAttribute(
    "data-renderer",
    "canvas",
  );
  await expect(page.getByText("DEMO PLAYING")).toBeVisible();
  await expect(page.locator(".captions")).toBeVisible();
  await page.waitForTimeout(500);
  expect(errors).toEqual([]);
});
test("Canvas backend works when WebGL is unavailable and repeated route changes clean up initialization", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() => {
    const get = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (
      this: HTMLCanvasElement,
      type: string,
      options?: unknown,
    ) {
      if (String(type).startsWith("webgl") || type === "experimental-webgl")
        return null;
      return Reflect.apply(get, this, [type, options]);
    } as typeof get;
  });
  await page.goto("/experience");
  await expect(page.locator(".score-renderer")).toHaveAttribute(
    "data-renderer",
    "canvas",
  );
  for (let n = 0; n < 3; n++) {
    await page
      .getByRole("link", { name: "Visual language", exact: true })
      .click();
    await page.getByRole("link", { name: "Experience", exact: true }).click();
  }
  await expect(page.locator(".score-renderer")).toHaveAttribute(
    "data-renderer",
    "canvas",
  );
  expect(errors).toEqual([]);
});
