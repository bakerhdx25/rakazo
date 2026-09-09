import { readFile } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { captureScreenshot } from "./helpers";

const computerRoot = path.resolve(import.meta.dirname, "../../../infra/sandboxes/computer");

test("touch users can open and dismiss the remote computer keyboard", async ({
  page,
}, testInfo) => {
  const assets = new Map([
    ["/embed.html", await readFile(path.join(computerRoot, "embed.html"), "utf8")],
    [
      "/clipboard-bridge.js",
      await readFile(path.join(computerRoot, "clipboard-bridge.js"), "utf8"),
    ],
    ["/mobile-keyboard.js", await readFile(path.join(computerRoot, "mobile-keyboard.js"), "utf8")],
    [
      "/core/rfb.js",
      `export default class RFB {
        constructor() { this.viewOnly = false; this.focusOnClick = true; }
        sendKey() {}
      }`,
    ],
    [
      "/core/input/keyboard.js",
      `export default class Keyboard {
        constructor() { this.onkeyevent = null; }
        grab() {}
        ungrab() {}
      }`,
    ],
    ["/core/input/keysym.js", "export default { XK_BackSpace: 0xff08 };"],
    ["/core/input/keysymdef.js", "export default { lookup: (codePoint) => codePoint };"],
  ]);

  await page.addInitScript(() => {
    Object.defineProperty(navigator, "maxTouchPoints", { configurable: true, value: 1 });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route("http://keyboard.test/**", async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    const body = assets.get(pathname);
    if (body == null) return route.fulfill({ status: 404, body: "Not found" });
    return route.fulfill({
      contentType: pathname.endsWith(".html") ? "text/html" : "text/javascript",
      body,
    });
  });

  await page.goto("http://keyboard.test/embed.html");
  const keyboardButton = page.getByRole("button", { name: "Show keyboard" });
  const keyboardInput = page.getByRole("textbox", { name: "Remote computer keyboard input" });
  await expect(keyboardButton).toBeVisible();

  await keyboardButton.click();
  await expect(page.getByRole("button", { name: "Hide keyboard" })).toBeVisible();
  await expect(keyboardInput).toBeFocused();
  await keyboardInput.pressSequentially("mobile typing");
  await captureScreenshot(page, testInfo, "mobile-computer-keyboard-open");

  await page.getByRole("button", { name: "Hide keyboard" }).click();
  await expect(keyboardButton).toBeVisible();
  await expect(keyboardInput).not.toBeFocused();
});
