import { randomBytes, randomUUID } from "node:crypto";
import axe from "axe-core";
import { expect, test, type Page } from "@playwright/test";
import { connectDatabase } from "../../db";
import { businessDate } from "../../lib/format";
import { createBarn, createFlock } from "../../server/services/population";
import { testDatabaseUrl } from "../integration/test-database";
const adminEmail = process.env.KANDANG_E2E_ADMIN_EMAIL!;
const adminPassword = process.env.KANDANG_E2E_ADMIN_PASSWORD!;

async function signIn(page: Page, email = adminEmail, password = adminPassword) {
  await page.goto("/masuk");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Kata sandi", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Masuk", exact: true }).click();
  await expect(page).toHaveURL("/dashboard");
  await expect(page.getByRole("heading", { name: "Dashboard", exact: true })).toBeVisible();
}

const modules = [
  ["Dashboard", "/dashboard"], ["Populasi Ternak", "/populasi"],
  ["Pakan", "/pakan"], ["Produksi Telur", "/produksi-telur"],
  ["Kesehatan & Vaksin", "/kesehatan"], ["Keuangan", "/keuangan"],
  ["Laporan", "/laporan"], ["Pengaturan", "/pengaturan"],
];

for (const width of [320, 375, 768, 1440]) {
  test(`navigasi, tema, dan lebar halaman ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 840 });
    await page.emulateMedia({ colorScheme: "light" });
    await signIn(page);
    await expect(page.getByRole("heading", { name: "Dashboard", exact: true })).toBeVisible();
    await expect(page.getByText("Belum ada riwayat populasi")).toBeVisible();
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
    await expect(nav.getByRole("link")).toHaveCount(8);
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

    for (const [name, url] of modules) {
      await page.goto(url);
      await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
      expect(overflow, url).toBe(false);
    }
    await expect(page.locator("html")).not.toHaveClass(/dark/);
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
  await signIn(page);
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

test("akun baru, aktivasi manual, izin ABK dan keluar", async ({ page, browser, request }) => {
  const rejected = await request.post("/api/auth/sign-up/email", { data: { email: "public@example.test", name: "Public" } });
  expect(rejected.status()).toBe(404);
  await page.goto("/keuangan");
  await expect(page).toHaveURL("/masuk");
  await signIn(page);
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto("/pengaturan?tab=akun");
  await page.getByRole("button", { name: "Tambah akun" }).click();
  const dialog = page.getByRole("dialog", { name: "Tambah akun" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Buat akun" }).click();
  await expect(dialog.getByText("Masukkan minimal 2 karakter.")).toBeVisible();
  const operatorEmail = `operator-${randomUUID().slice(0, 8)}@example.test`;
  await dialog.getByLabel("Nama pengguna").fill("Petugas uji");
  await dialog.getByLabel("Email pengguna").fill(operatorEmail);
  await dialog.getByRole("combobox", { name: "Peran" }).click();
  await page.getByRole("option", { name: "ABK", exact: true }).click();
  await dialog.getByRole("button", { name: "Buat akun" }).click();
  const link = await dialog.getByLabel("Tautan akses akun").inputValue();
  expect(new URL(link).pathname).toBe("/akses");
  await dialog.getByRole("button", { name: "Tutup", exact: true }).click();
  await expect(page.getByText("Menunggu aktivasi")).toBeVisible();

  const recipient = await browser.newContext();
  const operator = await recipient.newPage();
  const preview = await recipient.request.get(new URL(link).origin + "/akses");
  expect(preview.headers()["referrer-policy"]).toBe("no-referrer");
  await operator.goto(link);
  const secret = randomBytes(20).toString("base64url");
  await operator.getByLabel("Kata sandi baru", { exact: true }).fill(secret);
  await operator.getByLabel("Ulangi kata sandi").fill(secret);
  await operator.getByRole("button", { name: "Simpan kata sandi" }).click();
  await expect(operator).toHaveURL("/masuk");
  await signIn(operator, operatorEmail, secret);
  await expect(operator.getByRole("link", { name: "Keuangan" })).toHaveCount(0);
  await operator.goto("/keuangan");
  await expect(operator).toHaveURL("/dashboard");
  await operator.goto("/pengaturan?tab=akun");
  await expect(operator.getByRole("tab", { name: "Akun pengguna" })).toHaveCount(0);
  await expect(operator.getByRole("heading", { name: "Profil dan tampilan" })).toBeVisible();
  await operator.getByRole("button", { name: "Menu akun" }).click();
  await operator.getByRole("menuitem", { name: "Keluar" }).click();
  await expect(operator).toHaveURL("/masuk");
  await operator.goto("/dashboard");
  await expect(operator).toHaveURL("/masuk");
  await recipient.close();
});

test("pencatatan kandang, kelompok, dan kematian dari ponsel", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 840 });
  await signIn(page);
  await page.goto("/populasi");

  await page.getByRole("button", { name: "Tambah kandang" }).click();
  const barn = page.getByRole("dialog", { name: "Tambah kandang" });
  await barn.getByLabel("Kode kandang").fill("UJI-01");
  await barn.getByLabel("Nama kandang").fill("Kandang Uji");
  await barn.getByRole("button", { name: "Simpan kandang" }).click();
  await expect(barn).toBeHidden();
  await expect(page.getByRole("cell", { name: "Kandang Uji", exact: true })).toBeVisible();

  await page.getByRole("tab", { name: "Kelompok ternak" }).click();
  await page.getByRole("button", { name: "Tambah kelompok" }).click();
  const flock = page.getByRole("dialog", { name: "Tambah kelompok" });
  await flock.getByLabel("Kode kelompok").fill("KLP-1");
  await flock.getByLabel("Nama kelompok").fill("Kelompok Uji");
  await flock.getByRole("combobox", { name: "Kandang penempatan" }).click();
  await page.getByRole("option", { name: "UJI-01 · Kandang Uji" }).click();
  await flock.getByLabel("Asal ternak").fill("Pemasok Uji");
  await flock.getByLabel("Jumlah awal (ekor)").fill("75");
  await flock.getByLabel("Umur awal (hari)").fill("100");
  await flock.getByLabel("Alasan penempatan").fill("Penerimaan kelompok baru");
  await flock.getByRole("button", { name: "Simpan kelompok" }).click();
  await expect(flock).toBeHidden();
  await expect(page.getByText("75 ekor")).toBeVisible();

  await page.getByRole("tab", { name: "Mutasi", exact: true }).click();
  await page.getByRole("button", { name: "Catat mutasi" }).click();
  const move = page.getByRole("dialog", { name: "Catat mutasi" });
  await move.getByRole("combobox", { name: "Kelompok ternak" }).click();
  await page.getByRole("option", { name: "KLP-1 · Kelompok Uji" }).click();
  await move.getByLabel("Jumlah (ekor)").fill("5");
  await move.getByLabel("Alasan mutasi").fill("Kematian tercatat pagi ini");
  await move.getByRole("button", { name: "Simpan mutasi" }).click();
  await expect(move).toBeHidden();
  await expect(page.getByText("70 ekor", { exact: true })).toBeVisible();
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: "Tren populasi" })).toBeVisible();
  await expect(page.getByText("70 ekor", { exact: true })).toBeVisible();
});

test("pakan masuk, panen, sortir, dan penjualan lunas pada 320px", async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 320, height: 840 });
  await signIn(page);
  const cookies = (await page.context().cookies()).map(({ name, value }) => `${name}=${value}`).join("; ");
  const authHeaders = new Headers({ cookie: cookies });
  const { client, db } = connectDatabase(testDatabaseUrl());
  try {
    const barn = await createBarn(authHeaders, { requestKey: randomUUID(), code: "UJI-PAKAN", name: "Kandang Produksi Uji", location: "" }, db);
    await createFlock(authHeaders, {
      requestKey: randomUUID(), code: "KLP-PAKAN", name: "Kelompok Produksi Uji", barnId: barn.id,
      kind: "opening", businessDate: businessDate(), count: "100", age: "90", origin: "Peternakan Uji", reason: "Saldo awal uji",
    }, db);
  } finally {
    await client.end();
  }

  async function choose(dialog: ReturnType<Page["getByRole"]>, label: string, option: string | RegExp) {
    await dialog.getByRole("combobox", { name: label, exact: true }).click();
    await page.getByRole("option", { name: option }).click();
  }
  async function confirm(dialog: ReturnType<Page["getByRole"]>) {
    await dialog.getByRole("button", { name: "Periksa dan lanjutkan" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Konfirmasi dan simpan" }).click();
    await expect(dialog).toBeHidden();
  }

  await page.goto("/pakan");
  await page.getByRole("button", { name: "Tambah jenis pakan" }).click();
  const product = page.getByRole("dialog", { name: "Tambah jenis pakan" });
  await product.getByLabel("Kode pakan").fill("P-UJI");
  await product.getByLabel("Nama pakan").fill("Pakan Uji");
  await choose(product, "Jenis", "Pakan siap pakai");
  await product.getByRole("button", { name: "Simpan pencatatan" }).click();
  await expect(product).toBeHidden();
  await page.getByRole("tab", { name: "Pakan masuk" }).click();
  await page.getByRole("button", { name: "Tambah pakan masuk" }).click();
  const receipt = page.getByRole("dialog", { name: "Tambah pakan masuk" });
  await choose(receipt, "Pakan", "P-UJI · Pakan Uji");
  await receipt.getByLabel("Pemasok").fill("Pemasok Uji");
  await receipt.getByLabel("Berat (kg)").fill("120");
  await receipt.getByLabel("Total dibayar (Rp)").fill("120.000");
  await confirm(receipt);
  await expect(page.getByRole("cell", { name: "Pemasok Uji" })).toBeVisible();

  await page.goto("/produksi-telur");
  await page.getByRole("button", { name: "Catat panen telur" }).click();
  const harvest = page.getByRole("dialog", { name: "Catat panen telur" });
  await choose(harvest, "Kandang", "Kandang Produksi Uji");
  await choose(harvest, "Kelompok ternak", "KLP-PAKAN · Kelompok Produksi Uji");
  await harvest.getByLabel("Jumlah panen (butir)").fill("100");
  await harvest.getByLabel("Berat aktual (kg)").fill("5");
  await harvest.getByRole("button", { name: "Simpan pencatatan" }).click();
  await expect(harvest).toBeHidden();

  await page.getByRole("tab", { name: "Sortir" }).click();
  await page.getByRole("button", { name: "Catat sortir telur" }).click();
  const grade = page.getByRole("dialog", { name: "Catat sortir telur" });
  await choose(grade, "Lot panen belum disortir", /Kandang Produksi Uji/);
  await grade.getByLabel("Coklat (butir)").fill("70");
  await grade.getByLabel("Putih (butir)").fill("20");
  await grade.getByLabel("Cacat (butir)").fill("10");
  await confirm(grade);

  await page.getByRole("tab", { name: "Penjualan" }).click();
  await page.getByRole("button", { name: "Catat penjualan lunas" }).click();
  const sale = page.getByRole("dialog", { name: "Catat penjualan lunas" });
  await choose(sale, "Kategori", /Coklat/);
  await sale.getByLabel("Jumlah (butir)").fill("25");
  await sale.getByLabel("Harga per butir (Rp)").fill("1.000");
  await sale.getByLabel("Pembayaran diterima (Rp)").fill("25.000");
  await expect(sale.getByText(/Total penjualan: Rp/)).toBeVisible();
  await confirm(sale);
  await expect(page.getByRole("cell", { name: "Coklat 25 butir" })).toBeVisible();
  await expect(page.getByText(/Coklat 45 · Putih 20 · Cacat 10/)).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
});
