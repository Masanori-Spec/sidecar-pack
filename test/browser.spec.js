import { test, expect } from "@playwright/test";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const row = (page, filename) =>
  page.locator(".file-row").filter({
    has: page.locator(".file-name", {
      hasText: new RegExp(
        `^${filename.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`,
      ),
    }),
  });
const source = (name, size = 128) => ({
  name,
  mimeType: "application/octet-stream",
  buffer: Buffer.alloc(size, 65),
});
async function loadPair(page) {
  await page
    .locator("#file-input")
    .setInputFiles([source("photo.raw", 512), source("photo.raw.xmp", 64)]);
  await expect(page.locator(".file-row")).toHaveCount(2);
}
async function planPair(page) {
  await loadPair(page);
  await page.locator("#review-confirm").check();
  await page.locator("#plan-button").click();
  await expect(page.locator("#plan-content")).toBeVisible();
}
async function choose(page, filename, target) {
  await row(page, filename).locator(".edit-group").click();
  await expect(page.locator("#assignment-dialog")).toBeVisible();
  if (target === "alone") await page.locator("#group-singleton").click();
  else if (target === "exclude") await page.locator("#group-exclude").click();
  else {
    await page.locator("#group-anchor").selectOption(target);
    await page.locator("#group-save").click();
  }
  await expect(page.locator("#assignment-dialog")).not.toBeVisible();
}
async function resolveDemo(page) {
  await page.locator("#load-demo").click();
  await expect(page.locator('[data-assignment="unresolved"]')).toHaveCount(2);
  await choose(page, "demo/scene-002.xmp", "demo/scene-002.jpg");
  await choose(page, "demo/scene-002_01.xmp", "alone");
  await page.locator("#review-confirm").check();
  await page.locator("#plan-button").click();
}
async function delayWorkerReads(page, delay = 800) {
  await page.route("**/web/worker.js", async (route) => {
    const response = await route.fetch();
    const original = await response.text();
    await route.fulfill({
      response,
      body: `const originalArrayBuffer = File.prototype.arrayBuffer; File.prototype.arrayBuffer = async function () { await new Promise(resolve => setTimeout(resolve, ${delay})); return originalArrayBuffer.call(this); };\n${original}`,
    });
  });
}
async function trackURLs(page) {
  await page.addInitScript(() => {
    window.__urls = { created: [], revoked: [] };
    const create = URL.createObjectURL.bind(URL),
      revoke = URL.revokeObjectURL.bind(URL);
    URL.createObjectURL = (blob) => {
      const value = create(blob);
      window.__urls.created.push(value);
      return value;
    };
    URL.revokeObjectURL = (value) => {
      window.__urls.revoked.push(value);
      revoke(value);
    };
  });
}
async function screenshot(page, testInfo, name) {
  const destination = process.env.UI_ARTIFACT_DIR
    ? path.join(process.env.UI_ARTIFACT_DIR, name)
    : testInfo.outputPath(name);
  await mkdir(path.dirname(destination), { recursive: true });
  await page.screenshot({ path: destination, fullPage: true });
  await testInfo.attach(name, { path: destination, contentType: "image/png" });
}

test.beforeEach(async ({ page }) => {
  await page.goto("/web/index.html");
});

test("Japanese-first accessible controls, English switch, no horizontal overflow or external requests", async ({
  page,
}, testInfo) => {
  const remote = [];
  page.on("request", (request) => {
    if (
      !request.url().startsWith("http://127.0.0.1:4173") &&
      !request.url().startsWith("blob:")
    )
      remote.push(request.url());
  });
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("lang", "ja");
  await expect(page.locator("#plan-button")).toBeDisabled();
  await expect(page.locator("#cap-exact")).toHaveText("20,971,520 bytes");
  await expect(page.locator("#select-folder")).toBeInViewport();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await screenshot(page, testInfo, "desktop-ja.png");
  await page.locator("#language-toggle").click();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.locator("#review-title")).toHaveText(
    "Review what stays together",
  );
  await expect(page.locator("#select-files")).toHaveText("Choose files");
  await page.locator("#language-toggle").click();
  await expect(page.locator("#select-files")).toHaveText("ファイルを選ぶ");
  expect(remote).toEqual([]);
});

test("synthetic demo needs explicit review, generates exact ZIPs and an integrity receipt", async ({
  page,
}, testInfo) => {
  await resolveDemo(page);
  await expect(page.locator("#part-list .part-item")).toHaveCount(2);
  await expect(page.locator("#selection-summary")).toContainText("8,074");
  await expect(page.locator("#cap-exact")).toHaveText("6,000 bytes");
  await page.locator("#generate-button").click();
  await expect(page.locator("#download-content")).toBeVisible();
  await expect(page.locator("#download-list a")).toHaveCount(2);
  const verified = await page.evaluate(async () => {
    const receipt = await (
      await fetch(document.querySelector("#receipt-download").href)
    ).json();
    const result = [];
    for (const link of document.querySelectorAll("#download-list a")) {
      const bytes = new Uint8Array(
        await (await fetch(link.href)).arrayBuffer(),
      );
      const hash = [
        ...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
      ]
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");
      result.push({
        name: link.download,
        size: bytes.length,
        hash,
        signature: [...bytes.slice(0, 4)],
      });
    }
    return { receipt, result };
  });
  expect(verified.receipt.files).toHaveLength(6);
  for (const archive of verified.result) {
    expect(archive.size).toBeLessThanOrEqual(6000);
    expect(archive.signature).toEqual([80, 75, 3, 4]);
    expect(
      verified.receipt.archives.find((item) => item.name === archive.name),
    ).toMatchObject({ size: archive.size, sha256: archive.hash });
  }
  const original = verified.receipt.files.find(
    (item) => item.path === "demo/scene-001.jpg",
  );
  const sidecar = verified.receipt.files.find(
    (item) => item.path === "demo/scene-001.jpg.xmp",
  );
  expect(original.part).toBe(sidecar.part);
  const downloadEvent = page.waitForEvent("download");
  await page.locator("#download-list a").first().click();
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toBe("part-001.zip");
  expect((await readFile(await download.path())).length).toBe(
    verified.result[0].size,
  );
  await screenshot(page, testInfo, "desktop-complete.png");
});

test("ambiguous basename and numbered XMP never silently pair; exclude and singleton are explicit", async ({
  page,
}) => {
  await page
    .locator("#file-input")
    .setInputFiles([source("a.raw"), source("a.xmp"), source("a_01.xmp")]);
  await expect(page.locator('[data-assignment="unresolved"]')).toHaveCount(2);
  await expect(page.locator("#review-confirm")).toBeDisabled();
  await expect(page.locator("#plan-button")).toBeDisabled();
  await choose(page, "a.xmp", "exclude");
  await choose(page, "a_01.xmp", "alone");
  await expect(row(page, "a.xmp")).toHaveAttribute(
    "data-assignment",
    "excluded",
  );
  await expect(row(page, "a_01.xmp")).toHaveAttribute(
    "data-assignment",
    "a_01.xmp",
  );
  await expect(page.locator("#plan-button")).toBeDisabled();
  await page.locator("#review-confirm").check();
  await page.locator("#plan-button").click();
  await page.locator("#generate-button").click();
  await expect(page.locator("#receipt-download")).toHaveAttribute(
    "href",
    /^blob:/,
  );
  const receipt = await page.evaluate(async () =>
    (await fetch(document.querySelector("#receipt-download").href)).json(),
  );
  expect(receipt.excluded).toEqual(["a.xmp"]);
  expect(receipt.files.map((file) => file.path)).toEqual(["a.raw", "a_01.xmp"]);
});

test("moving an anchor unresolves dependents and invalidates the previous plan", async ({
  page,
}) => {
  await planPair(page);
  await choose(page, "photo.raw", "exclude");
  await expect(row(page, "photo.raw.xmp")).toHaveAttribute(
    "data-assignment",
    "unresolved",
  );
  await expect(page.locator("#review-confirm")).not.toBeChecked();
  await expect(page.locator("#review-confirm")).toBeDisabled();
  await expect(page.locator("#plan-content")).toBeHidden();
  await expect(page.locator("#plan-button")).toBeDisabled();
});

test("MB and MiB are explicit, fractional-byte and impossible caps fail, exact cap succeeds", async ({
  page,
}) => {
  await loadPair(page);
  await page.locator("#cap-value").fill("1");
  await page.locator("#cap-unit").selectOption("MB");
  await expect(page.locator("#cap-exact")).toHaveText("1,000,000 bytes");
  await page.locator("#cap-unit").selectOption("MiB");
  await expect(page.locator("#cap-exact")).toHaveText("1,048,576 bytes");
  await page.locator("#cap-value").fill("0.1");
  await expect(page.locator("#cap-value")).toHaveAttribute(
    "aria-invalid",
    "true",
  );
  await page.locator("#cap-value").fill("64.01");
  await expect(page.locator("#plan-button")).toBeDisabled();
  await page.locator("#cap-value").fill("1 MB");
  await expect(page.locator("#cap-value")).toHaveAttribute(
    "aria-invalid",
    "true",
  );
  await page.locator("#cap-value").fill("1");
  await page.locator("#review-confirm").check();
  await page.locator("#plan-button").click();
  const size = Number(
    await page.locator(".part-item").first().getAttribute("data-part-size"),
  );
  await page.locator("#cap-unit").selectOption("B");
  await page.locator("#cap-value").fill(String(size - 1));
  await page.locator("#plan-button").click();
  await expect(page.locator("#error-message")).toContainText(
    "Groups cannot be split",
  );
  await expect(page.locator("#error-message")).toBeFocused();
  await expect(page.locator("#plan-content")).toBeHidden();
  await page.locator("#cap-value").fill(String(size));
  await page.locator("#plan-button").click();
  await expect(page.locator(".part-item")).toHaveAttribute(
    "data-part-size",
    String(size),
  );
});

test("all cap/group/file edits revoke downloads and reset or reselect safely", async ({
  page,
}) => {
  await trackURLs(page);
  await page.reload();
  await planPair(page);
  await page.locator("#generate-button").click();
  await expect(page.locator("#download-content")).toBeVisible();
  await page.locator("#cap-value").fill("19");
  await expect(page.locator("#download-content")).toBeHidden();
  await expect(page.locator("#receipt-download")).not.toHaveAttribute(
    "href",
    /./,
  );
  let urls = await page.evaluate(() => window.__urls);
  expect(urls.revoked.sort()).toEqual(urls.created.sort());
  await page.locator("#plan-button").click();
  await page.locator("#generate-button").click();
  await expect(page.locator("#download-content")).toBeVisible();
  await choose(page, "photo.raw.xmp", "alone");
  await expect(page.locator("#download-content")).toBeHidden();
  await expect(page.locator("#review-confirm")).not.toBeChecked();
  await page.locator("#file-input").setInputFiles(source("replacement.txt"));
  await expect(page.locator(".file-row")).toHaveCount(1);
  await expect(page.locator(".file-name")).toHaveText("replacement.txt");
  await page.locator("#reset-button").click();
  await expect(page.locator(".file-row")).toHaveCount(0);
  await expect(page.locator("#plan-button")).toBeDisabled();
  await expect(page.locator("#cap-exact")).toHaveText("20,971,520 bytes");
  urls = await page.evaluate(() => window.__urls);
  expect(urls.revoked.sort()).toEqual(urls.created.sort());
  await page.locator("#file-input").setInputFiles(source("replacement.txt"));
  await expect(page.locator(".file-row")).toHaveCount(1);
});

test("cancel terminates a delayed worker and a fresh generation can succeed", async ({
  page,
}) => {
  await delayWorkerReads(page);
  await planPair(page);
  await page.locator("#generate-button").click();
  await expect(page.locator("#cancel-button")).toBeVisible();
  await page.locator("#cancel-button").click();
  await expect(page.locator("#generation-progress")).toBeHidden();
  await expect(page.locator("#generate-button")).toBeEnabled();
  await page.waitForTimeout(1800);
  await expect(page.locator("#download-content")).toBeHidden();
  await page.unroute("**/web/worker.js");
  await page.locator("#generate-button").click();
  await expect(page.locator("#download-content")).toBeVisible();
});

test("editing the cap while running discards stale output even after the original job could finish", async ({
  page,
}) => {
  await delayWorkerReads(page);
  await planPair(page);
  await page.locator("#generate-button").click();
  await page.locator("#cap-value").fill("18");
  await expect(page.locator("#plan-content")).toBeHidden();
  await expect(page.locator("#cancel-button")).toBeHidden();
  await page.waitForTimeout(1800);
  await expect(page.locator("#download-content")).toBeHidden();
  await page.unroute("**/web/worker.js");
  await page.locator("#plan-button").click();
  await page.locator("#generate-button").click();
  await expect(page.locator("#download-content")).toBeVisible();
  const receipt = await page.evaluate(async () =>
    (await fetch(document.querySelector("#receipt-download").href)).json(),
  );
  expect(receipt.capBytes).toBe(18 * 1024 * 1024);
});

test("read failures expose a recoverable error and never leave partial download links", async ({
  page,
}) => {
  await page.route("**/web/worker.js", async (route) => {
    const response = await route.fetch();
    await route.fulfill({
      response,
      body: `File.prototype.arrayBuffer = async function () { throw new Error('Synthetic read failure'); };\n${await response.text()}`,
    });
  });
  await planPair(page);
  await page.locator("#generate-button").click();
  await expect(page.locator("#error-message")).toContainText(
    "File could not be read",
  );
  await expect(page.locator("#download-list a")).toHaveCount(0);
  await expect(page.locator("#cancel-button")).toBeHidden();
  await expect(page.locator("#generate-button")).toBeEnabled();
  await page.unroute("**/web/worker.js");
  await loadPair(page);
  await page.locator("#review-confirm").check();
  await page.locator("#plan-button").click();
  await page.locator("#generate-button").click();
  await expect(page.locator("#download-content")).toBeVisible();
});

test("folder-relative paths omit the selected root and preserve subfolders", async ({
  page,
}, testInfo) => {
  const directory = testInfo.outputPath("source-folder");
  await mkdir(path.join(directory, "nested"), { recursive: true });
  await writeFile(path.join(directory, "nested", "photo.raw"), "original");
  await writeFile(path.join(directory, "nested", "photo.raw.xmp"), "sidecar");
  await page.locator("#folder-input").setInputFiles(directory);
  await expect(page.locator(".file-name")).toHaveText([
    "nested/photo.raw",
    "nested/photo.raw.xmp",
  ]);
  await expect(row(page, "nested/photo.raw.xmp")).toHaveAttribute(
    "data-assignment",
    "nested/photo.raw",
  );
});

test("unsafe or conflicting selection is rejected; safe unusual filenames stay inert", async ({
  page,
}) => {
  await loadPair(page);
  await page
    .locator("#file-input")
    .setInputFiles([source("A.txt"), source("a.txt")]);
  await expect(page.locator("#error-message")).toContainText("Duplicate");
  await expect(page.locator(".file-row")).toHaveCount(0);
  await expect(page.locator("#plan-button")).toBeDisabled();
  await page
    .locator("#file-input")
    .setInputFiles(source("<img src=x onerror=alert(1)>.txt"));
  await expect(page.locator("#error-message")).toContainText(
    "Unsafe portable path",
  );
  await expect(page.locator("#file-list img")).toHaveCount(0);
  await page
    .locator("#file-input")
    .setInputFiles([source("__proto__"), source("日本語 & notes.txt")]);
  await expect(page.locator(".file-name")).toHaveText([
    "__proto__",
    "日本語 & notes.txt",
  ]);
  await page.locator("#review-confirm").check();
  await page.locator("#plan-button").click();
  await expect(page.locator("#plan-content")).toBeVisible();
});

test("dialog supports Escape and keyboard focus; file filtering does not modify a reviewed plan", async ({
  page,
}) => {
  await planPair(page);
  const edit = row(page, "photo.raw.xmp").locator(".edit-group");
  await edit.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#assignment-dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator("#assignment-dialog")).toBeHidden();
  await expect(edit).toBeFocused();
  await page.locator("#file-filter").fill(".xmp");
  await expect(page.locator(".file-row")).toHaveCount(1);
  await expect(page.locator("#review-confirm")).toBeChecked();
  await expect(page.locator("#plan-content")).toBeVisible();
  await page.locator("#file-filter").fill("no-match");
  await expect(page.locator("#filter-empty")).toBeVisible();
  await expect(page.locator("#generate-button")).toBeEnabled();
});

test("back navigation after interrupted generation restores usable controls", async ({
  page,
}) => {
  await delayWorkerReads(page, 1500);
  await planPair(page);
  await page.locator("#generate-button").click();
  await page.goto("/web/icon.svg");
  await page.goBack();
  await expect(page.locator("#select-files")).toBeVisible();
  await expect(page.locator("#cancel-button")).toBeHidden();
  await expect(page.locator("#download-content")).toBeHidden();
  // Chromium may reload instead of using bfcache under automation. Both paths must remain usable.
  if (await page.locator("#plan-content").isVisible())
    await expect(page.locator("#generate-button")).toBeEnabled();
  else {
    await loadPair(page);
    await page.locator("#review-confirm").check();
    await expect(page.locator("#plan-button")).toBeEnabled();
  }
});

test("mobile layout completes review and generation without overflow", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await screenshot(page, testInfo, "mobile-ja.png");
  await resolveDemo(page);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.locator("#generate-button").click();
  await expect(page.locator("#download-content")).toBeVisible();
  await page.locator("#language-toggle").click();
  await expect(page.locator("#download-content")).toContainText(
    "Ready to take with you",
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await screenshot(page, testInfo, "mobile-en-complete.png");
});
