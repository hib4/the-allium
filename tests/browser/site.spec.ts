import { test, expect } from "@playwright/test";

test("Experience autoplays once, removes score titles, and preserves manual pause", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/experience");
  await expect(page.locator(".stage-status")).toContainText("DEMO PLAYING");
  await expect(page.locator(".stage-status")).toBeHidden();
  await expect(page.locator(".score-labels")).toHaveCount(0);
  await expect(page.locator(".score .sr-only")).toContainText("Visual score:");
  await page.screenshot({
    path: ".impeccable/review/experience-autoplay-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 320, height: 800 });
  await page.waitForTimeout(350);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: ".impeccable/review/experience-autoplay-mobile.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await page.waitForTimeout(750);
  await expect(page.locator(".stage-status")).toContainText("DEMO PAUSED");
  await page
    .getByRole("button", { name: "Performance view", exact: true })
    .click();
  await page.waitForTimeout(750);
  await expect(page.locator(".stage-status")).toContainText("DEMO PAUSED");
});

for (const mode of ["live", "standby"] as const) {
  test(`Experience autoplay preserves ${mode} mode`, async ({ page }) => {
    await page.goto("/");
    await page.evaluate(async (mode) => {
      const path = "/src/engine/session.ts";
      const { concert } = await import(path);
      concert.update({ mode, playing: false });
    }, mode);
    await page.getByRole("link", { name: "Experience", exact: true }).click();
    await page.waitForTimeout(750);
    const state = await page.evaluate(async () => {
      const path = "/src/engine/session.ts";
      const { concert } = await import(path);
      return { mode: concert.state.mode, playing: concert.state.playing };
    });
    expect(state).toEqual({ mode, playing: false });
  });
}

test("leaving Experience cancels pending autoplay", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Experience", exact: true }).click();
  await page
    .getByRole("link", { name: "Visual language", exact: true })
    .click();
  await page.waitForTimeout(750);
  const playing = await page.evaluate(async () => {
    const path = "/src/engine/session.ts";
    const { concert } = await import(path);
    return concert.state.playing;
  });
  expect(playing).toBe(false);
});

test("operator controls a display tab and sends readable Unicode captions", async ({
  context,
  page,
}) => {
  await page.goto("/control");
  const display = await context.newPage();
  await display.goto("/experience");
  await page.bringToFront();
  await expect(page.getByText("1 display connected")).toBeVisible();
  await display.waitForTimeout(750);
  await expect(display.locator(".stage-status")).toContainText("DEMO PAUSED");
  await page.getByRole("button", { name: "Play demo", exact: true }).click();
  await expect(display.locator(".stage-status")).toContainText("DEMO PLAYING");
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
  await expect(display.locator(".stage-status")).toContainText("DEMO PAUSED");
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
  await expect(page.locator(".stage-status")).toContainText("DEMO PLAYING");
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
  await expect(page.locator(".stage-status")).toContainText("DEMO PLAYING");
  await page.evaluate(() =>
    document
      .querySelector(".score-renderer canvas")!
      .dispatchEvent(new Event("webglcontextlost", { cancelable: true })),
  );
  await expect(page.locator(".score-renderer")).toHaveAttribute(
    "data-renderer",
    "canvas",
  );
  await expect(page.locator(".stage-status")).toContainText("DEMO PLAYING");
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

for (const backend of ["webgl", "canvas"] as const) {
  test(`saxophone previews stay local and render with ${backend}`, async ({
    page,
    context,
  }) => {
    if (backend === "canvas")
      await context.addInitScript(() => {
        const get = HTMLCanvasElement.prototype.getContext;
        HTMLCanvasElement.prototype.getContext = function (
          this: HTMLCanvasElement,
          type: string,
          options?: unknown,
        ) {
          if (type.includes("webgl")) return null;
          return Reflect.apply(get, this, [type, options]);
        } as typeof get;
      });
    await page.goto("/control");
    const mute = page.getByRole("button", {
      name: "Mute saxophone visualization",
      exact: true,
    });
    await expect(mute).toHaveAttribute("aria-pressed", "false");
    await mute.click();
    await page.getByRole("button", { name: "Play demo", exact: true }).click();
    const preview = await context.newPage();
    await preview.goto("/tutorial");
    await preview.getByRole("button", { name: /saxophone/i }).click();
    await expect(
      preview.getByRole("heading", { name: "Follow each breath." }),
    ).toBeVisible();
    await expect(preview.locator(".score-renderer")).toHaveAttribute(
      "data-renderer",
      backend,
    );
    await preview.waitForTimeout(1000);
    await preview.screenshot({
      path: `.impeccable/review/saxophone-${backend}-desktop.png`,
      fullPage: true,
    });
    await preview.setViewportSize({ width: 320, height: 800 });
    await preview.waitForTimeout(350);
    await preview.screenshot({
      path: `.impeccable/review/saxophone-${backend}-mobile.png`,
      fullPage: true,
    });
    expect(
      await preview.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await expect(mute).toHaveAttribute("aria-pressed", "true");
    await mute.click();
    await expect(mute).toHaveAttribute("aria-pressed", "false");
    const display = await context.newPage();
    await display.goto("/experience");
    await expect
      .poll(() =>
        display.evaluate(async () => {
          const path = "/src/engine/session.ts";
          const { concert } = await import(path);
          return concert.state.channels.saxophone.mute;
        }),
      )
      .toBe(false);
    await mute.click();
    await expect
      .poll(() =>
        display.evaluate(async () => {
          const path = "/src/engine/session.ts";
          const { concert } = await import(path);
          return concert.state.channels.saxophone.mute;
        }),
      )
      .toBe(true);
    await preview.goto("/");
    await preview
      .getByRole("button", { name: "saxophone", exact: true })
      .click();
    await expect(preview.locator(".score .sr-only")).toHaveText(
      "saxophone visual score",
    );
  });
}

test("all four demo pages render saxophone in ensembles and after individual selections", async ({
  page,
}) => {
  for (const route of ["/", "/experience", "/tutorial", "/follow"]) {
    await page.goto(`${route}?renderer=canvas`);
    if (route === "/experience")
      await expect(page.locator(".stage-status")).toContainText("DEMO PLAYING");
    if (route === "/tutorial")
      await page.getByRole("button", { name: "Together", exact: true }).click();
    const hasAmber = () =>
      page.locator(".score-renderer canvas").evaluate((canvas) => {
        const c = canvas as HTMLCanvasElement;
        const data = c
          .getContext("2d")!
          .getImageData(0, 0, c.width, c.height).data;
        let amber = 0;
        for (let i = 0; i < data.length; i += 4)
          if (
            data[i] > 40 &&
            data[i] > data[i + 1] * 1.3 &&
            data[i + 1] > data[i + 2] * 1.3
          )
            amber++;
        return amber;
      });
    await expect.poll(hasAmber).toBeGreaterThan(30);
    if (route !== "/experience") {
      await page.getByRole("button", { name: /saxophone/i }).click();
      await expect.poll(hasAmber).toBeGreaterThan(30);
      await page
        .getByRole("button", {
          name: route === "/tutorial" ? "Together" : "All instruments",
          exact: true,
        })
        .click();
      await expect.poll(hasAmber).toBeGreaterThan(30);
    }
  }
});
