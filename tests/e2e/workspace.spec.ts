import axe from "axe-core";
import { expect, test } from "@playwright/test";

const modules = [
  ["Dashboard", "/dashboard"], ["Populasi Ternak", "/populasi"],
  ["Pakan", "/pakan"], ["Produksi Telur", "/produksi-telur"],
  ["Kesehatan & Vaksin", "/kesehatan"], ["Keuangan", "/keuangan"],
  ["Reseller", "/reseller"], ["Laporan", "/laporan"], ["Pengaturan", "/pengaturan"],
];

for (const width of [320, 375, 768, 1440]) {
  test(`navigasi, tema, dan lebar halaman ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 840 });
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto("/");
    await expect(page).toHaveURL("/dashboard");
    await expect(page.getByRole("heading", { name: "Dashboard", exact: true })).toBeVisible();
    await expect(page.getByText("Modul sedang disiapkan")).toBeVisible();
    expect(await page.evaluate(async () => {
      await document.fonts.ready;
      return document.fonts.check(`600 16px ${getComputedStyle(document.body).fontFamily.split(",")[0]}`);
    })).toBe(true);

    const trigger = page.getByRole("button", { name: "Buka atau tutup navigasi" });
    if (width < 768) {
      await trigger.focus();
      await page.keyboard.press("Enter");
    }
    const nav = page.getByRole("navigation", { name: "Modul utama" });
    await expect(nav.getByRole("link")).toHaveCount(9);
    for (const [name, url] of modules) {
      await expect(nav.getByRole("link", { name, exact: true })).toHaveAttribute("href", url);
    }
    await nav.getByRole("link", { name: "Kesehatan & Vaksin" }).click();
    await expect(page.getByRole("heading", { name: "Kesehatan & Vaksin" })).toBeVisible();
    if (width < 768) {
      await expect(nav).toBeHidden();
      await trigger.click();
      await page.keyboard.press("Escape");
      await expect(nav).toBeHidden();
      await expect(trigger).toBeFocused();
    }

    for (const [, url] of modules) {
      await page.goto(url);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
      expect(overflow, url).toBe(false);
    }
    await page.getByRole("button", { name: "Ganti tema terang atau gelap" }).click();
    await expect(page.locator("html")).toHaveClass(/dark/);
    await page.reload();
    await expect(page.locator("html")).toHaveClass(/dark/);
    await page.getByRole("button", { name: "Ganti tema terang atau gelap" }).click();
    await expect(page.locator("html")).not.toHaveClass(/dark/);
  });
}

test("aksesibilitas warna dan struktur di tema terang dan gelap", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/dashboard");
  for (const theme of ["light", "dark"]) {
    await expect(page.locator("html")).toHaveClass(new RegExp(theme));
    await page.addScriptTag({ content: axe.source });
    const results = await page.evaluate(async () => {
      const engine = (window as Window & { axe?: typeof axe }).axe;
      if (!engine) throw new Error("Axe gagal dimuat");
      return engine.run({ runOnly: ["wcag2a", "wcag2aa", "wcag21aa"] });
    });
    expect(results.violations, theme).toEqual([]);
    await page.getByRole("button", { name: "Ganti tema terang atau gelap" }).click();
  }
});
