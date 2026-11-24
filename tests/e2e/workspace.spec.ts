import { randomBytes, randomUUID } from "node:crypto";
import axe from "axe-core";
import { PDFDocument } from "pdf-lib";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { connectDatabase } from "../../db";
import { rateLimit, resellerSpaces } from "../../db/schema";
import { businessDate, formatDate, formatIDR, shiftBusinessDate } from "../../lib/format";
import { createAuth } from "../../server/auth/config";
import { buyFeed, createFeedProduct } from "../../server/services/feed";
import { postCash } from "../../server/services/finance";
import { addMovement, createBarn, createFlock } from "../../server/services/population";
import { testDatabaseUrl } from "../integration/test-database";
const adminEmail = process.env.KANDANG_E2E_ADMIN_EMAIL!;
const adminPassword = process.env.KANDANG_E2E_ADMIN_PASSWORD!;

test.beforeEach(async () => {
  // Each browser scenario starts with an independent rate-limit window in the disposable database.
  const { client, db } = connectDatabase(testDatabaseUrl());
  try { await db.delete(rateLimit); } finally { await client.end(); }
});

async function signIn(page: Page, email = adminEmail, password = adminPassword, destination = "/dashboard") {
  await page.goto("/masuk");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Kata sandi", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Masuk", exact: true }).click();
  await expect(page).toHaveURL(destination);
  await expect(page.getByRole("heading", { name: destination === "/reseller" ? "Reseller" : "Dashboard", exact: true })).toBeVisible();
}

async function openModuleTab(page: Page, label: string) {
  const mobile = page.getByRole("combobox", { name: "Bagian modul" });
  if ((page.viewportSize()?.width ?? 1440) < 768) {
    await mobile.click();
    await page.getByRole("option", { name: label, exact: true }).click();
    await expect(mobile.locator("[data-slot=select-value]")).toHaveText(label);
  } else {
    await page.getByRole("tab", { name: label, exact: true }).click();
  }
}

async function checkPasswordVisibility(fields: Locator[], values: string[]) {
  for (const [index, field] of fields.entries()) {
    await expect(field).toHaveAttribute("type", "password");
    await field.fill(values[index]);
  }
  for (const [index, field] of fields.entries()) {
    const toggle = field.locator("..").getByRole("button", { name: "Tampilkan kata sandi" });
    await expect(toggle).toHaveAttribute("type", "button");
    await field.press("Tab");
    await expect(toggle).toBeFocused();
    await toggle.press("Enter");
    await expect(field).toHaveAttribute("type", "text");
    await expect(field).toHaveValue(values[index]);
    for (const other of fields.filter((candidate) => candidate !== field)) {
      await expect(other).toHaveAttribute("type", "password");
    }
    await field.locator("..").getByRole("button", { name: "Sembunyikan kata sandi" }).press("Space");
    await expect(field).toHaveAttribute("type", "password");
    await expect(field).toHaveValue(values[index]);
  }
}

const modules = [
  ["Dashboard", "/dashboard"], ["Populasi Ternak", "/populasi"],
  ["Stok Pakan", "/pakan"], ["Produksi Telur", "/produksi-telur"],
  ["Kesehatan & Vaksin", "/kesehatan"], ["Keuangan", "/keuangan"],
  ["Laporan", "/laporan"], ["Pengaturan", "/pengaturan"],
];

for (const width of [320, 360, 375, 390, 430, 768, 1024, 1280, 1440]) {
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
    await expect(nav.getByRole("link")).toHaveCount(7);
    for (const [name, url] of modules.filter(([, url]) => url !== "/pakan")) {
      await expect(nav.getByRole("link", { name, exact: true })).toHaveAttribute("href", url);
    }
    const feedNav = nav.getByRole("button", { name: "Pakan", exact: true });
    await expect(feedNav).toHaveAttribute("aria-expanded", "false");
    await feedNav.press("Enter");
    await expect(feedNav).toHaveAttribute("aria-expanded", "true");
    await expect(nav.getByRole("link")).toHaveCount(10);
    for (const [name, href] of [
      ["Stok Pakan", "/pakan"], ["Aktivitas Pakan", "/pakan?tab=aktivitas"], ["Jenis Pakan", "/pakan?tab=jenis"],
    ]) {
      await expect(nav.getByRole("link", { name, exact: true })).toHaveAttribute("href", href);
    }
    await nav.getByRole("link", { name: "Aktivitas Pakan", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Aktivitas Pakan", exact: true })).toBeVisible();
    if (width < 768) {
      await expect(nav).toBeHidden();
      await trigger.click();
    }
    await expect(nav.getByRole("link", { name: "Aktivitas Pakan", exact: true })).toHaveAttribute("aria-current", "page");
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

test("akun baru, aktivasi, reset, izin ABK, dan keluar", async ({ page, browser, request }) => {
  test.setTimeout(60_000);
  const crossSite = await request.post("/api/auth/sign-in/email", {
    headers: { origin: "https://external.example.test" },
    data: { email: "cross-site@example.test", password: randomBytes(20).toString("base64url") },
  });
  expect(crossSite.status()).toBe(403);
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
  const secret = randomBytes(6).toString("base64url");
  await checkPasswordVisibility([operator.getByLabel("Kata sandi baru", { exact: true }), operator.getByLabel("Ulangi kata sandi")], [secret, secret]);
  await expect(operator.getByText("Kata sandi berhasil disimpan.")).toHaveCount(0);
  await operator.getByRole("button", { name: "Simpan kata sandi" }).click();
  await expect(operator).toHaveURL("/masuk");
  await signIn(operator, operatorEmail, secret);
  await expect(operator.getByRole("link", { name: "Keuangan" })).toHaveCount(0);
  expect((await recipient.request.get(`/api/bukti/${randomUUID()}`)).status()).toBe(403);
  expect((await recipient.request.get("/api/laporan/pdf?jenis=keuangan")).status()).toBe(403);
  await operator.goto("/keuangan");
  await expect(operator).toHaveURL("/dashboard");
  await operator.goto("/pengaturan?tab=akun");
  await expect(operator.getByRole("tab", { name: "Akun pengguna" })).toHaveCount(0);
  await expect(operator.getByRole("heading", { name: "Profil dan tampilan" })).toBeVisible();

  await page.reload();
  const accountRow = page.getByRole("row").filter({ hasText: operatorEmail });
  const accountTrigger = accountRow.getByRole("button", { name: "Buka tindakan" });
  await expect(page.getByRole("row").filter({ hasText: adminEmail }).getByRole("button", { name: "Buka tindakan" })).toHaveCount(0);
  await accountTrigger.press("Enter");
  await page.getByRole("menuitem", { name: "Ubah peran" }).press("Enter");
  await expect(page.getByRole("dialog", { name: "Ubah peran" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Ubah peran" })).toBeHidden();
  await expect(accountTrigger).toBeFocused();
  await accountTrigger.click();
  await page.getByRole("menuitem", { name: "Tautan reset" }).click();
  const reset = page.getByRole("dialog", { name: "Tautan reset" });
  await reset.getByRole("button", { name: "Buat tautan baru" }).click();
  const resetLink = await reset.getByLabel("Tautan akses akun").inputValue();
  const resetPage = await recipient.newPage();
  await resetPage.goto(resetLink);
  const newSecret = randomBytes(6).toString("base64url");
  await checkPasswordVisibility([resetPage.getByLabel("Kata sandi baru", { exact: true }), resetPage.getByLabel("Ulangi kata sandi")], [newSecret.slice(1), newSecret.slice(1)]);
  await resetPage.getByRole("button", { name: "Simpan kata sandi" }).click();
  await expect(resetPage.getByText("Gunakan minimal 8 karakter.")).toBeVisible();
  await resetPage.getByLabel("Kata sandi baru", { exact: true }).fill(newSecret);
  await resetPage.getByLabel("Ulangi kata sandi").fill(newSecret);
  await resetPage.getByRole("button", { name: "Simpan kata sandi" }).click();
  await expect(resetPage).toHaveURL("/masuk");
  await operator.goto("/dashboard");
  await expect(operator).toHaveURL("/masuk");
  await operator.getByLabel("Email", { exact: true }).fill(operatorEmail);
  await checkPasswordVisibility([operator.getByLabel("Kata sandi", { exact: true })], [newSecret]);
  await expect(operator).toHaveURL("/masuk");
  await operator.getByRole("button", { name: "Masuk", exact: true }).click();
  await expect(operator).toHaveURL("/dashboard");
  await operator.goto("/pengaturan");
  const changed = randomBytes(6).toString("base64url");
  await checkPasswordVisibility([
    operator.getByLabel("Kata sandi saat ini", { exact: true }),
    operator.getByLabel("Kata sandi baru", { exact: true }),
    operator.getByLabel("Ulangi kata sandi baru", { exact: true }),
  ], [newSecret, changed, changed]);
  await expect(operator).toHaveURL("/pengaturan");
  await operator.getByRole("button", { name: "Ubah kata sandi", exact: true }).click();
  await expect(operator).toHaveURL("/masuk");
  await signIn(operator, operatorEmail, changed);
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

  await openModuleTab(page, "Kelompok ternak");
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

  await openModuleTab(page, "Mutasi");
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

test("jenis pakan, pembelian, pengiriman, sisa harian, dan produksi telur pada 320px", async ({ page }) => {
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
    await page.locator('[data-slot="select-content"][data-open]').getByRole("option", { name: option }).click({ timeout: 10_000 });
  }
  async function confirm(dialog: ReturnType<Page["getByRole"]>) {
    await dialog.getByRole("button", { name: "Periksa dan lanjutkan" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Konfirmasi dan simpan" }).click();
    await expect(dialog).toBeHidden();
  }

  await page.goto("/pakan?tab=masuk");
  await expect(page.getByRole("heading", { name: "Aktivitas Pakan" })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Jenis aktivitas" })).toContainText("Pakan Masuk");
  await page.getByRole("link", { name: "Buka Jenis Pakan" }).click();
  await expect(page.getByRole("heading", { name: "Jenis Pakan", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /Dari tanggal/ })).toHaveCount(0);
  await page.getByRole("button", { name: "Tambah jenis pakan" }).click();
  const product = page.getByRole("dialog", { name: "Tambah jenis pakan" });
  await product.getByLabel("Kode pakan").fill("P-UJI");
  await product.getByLabel("Nama pakan").fill("Pakan Uji");
  await choose(product, "Jenis", "Pakan siap pakai");
  await product.getByRole("button", { name: "Simpan pencatatan" }).click();
  await expect(product).toBeHidden();
  await expect(page.getByRole("table", { name: "Daftar jenis pakan" }).getByRole("cell", { name: "Pakan Uji" })).toBeVisible();
  await page.goto("/pakan?tab=aktivitas");
  await page.getByRole("button", { name: "Catat pembelian pakan" }).click();
  const receipt = page.getByRole("dialog", { name: "Catat pembelian pakan" });
  await choose(receipt, "Pakan", "P-UJI · Pakan Uji");
  await receipt.getByLabel("Pemasok").fill("Pemasok Uji");
  await receipt.getByLabel("Berat (kg)").fill("120");
  await receipt.getByLabel("Total dibayar (Rp)").fill("120.000");
  await confirm(receipt);
  const activity = page.getByRole("table", { name: "Riwayat aktivitas pakan" });
  await expect(activity.getByRole("cell", { name: "Pemasok Uji" })).toBeVisible();
  await page.getByRole("button", { name: "Kirim ke kandang", exact: true }).click();
  const issue = page.getByRole("dialog", { name: "Kirim ke kandang" });
  await choose(issue, "Pakan", /P-UJI · Pakan Uji/);
  await choose(issue, "Kandang tujuan", "Kandang Produksi Uji");
  await issue.getByLabel("Berat (kg)").fill("20");
  await confirm(issue);
  await expect(activity.getByRole("cell", { name: "Kirim ke Kandang" })).toBeVisible();
  const filters = page.getByRole("form", { name: "Filter catatan" });
  await choose(filters, "Jenis aktivitas", "Kirim ke Kandang");
  await choose(filters, "Pakan", "P-UJI · Pakan Uji");
  await filters.getByRole("button", { name: "Terapkan filter" }).click();
  await expect(page).toHaveURL(({ searchParams }) => searchParams.get("jenis") === "keluar" && Boolean(searchParams.get("filter")));
  await expect(activity.getByRole("cell", { name: "Pakan Masuk" })).toHaveCount(0);
  await expect(activity.getByRole("cell", { name: "Kandang Produksi Uji" })).toBeVisible();

  await page.goto("/pakan");
  const stock = page.getByRole("table", { name: "Posisi stok" });
  const barnRow = stock.getByRole("row").filter({ hasText: "Kandang Produksi Uji" });
  await expect(barnRow.getByText("Belum diukur")).toBeVisible();
  const measure = barnRow.getByRole("button", { name: "Buka tindakan" });
  await measure.scrollIntoViewIfNeeded();
  const bounds = await measure.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(320);
  await measure.click();
  await page.getByRole("menuitem", { name: "Catat sisa harian" }).click();
  const close = page.getByRole("dialog", { name: "Catat sisa harian" });
  await expect(close.getByRole("combobox", { name: "Pakan", exact: true })).toContainText("P-UJI · Pakan Uji");
  await expect(close.getByRole("combobox", { name: "Kandang", exact: true })).toContainText("Kandang Produksi Uji");
  await close.getByLabel("Sisa terukur (kg)").fill("4");
  await close.getByRole("button", { name: "Simpan pencatatan" }).click();
  await expect(close).toBeHidden();
  await expect(barnRow.getByText("Sudah diukur")).toBeVisible();
  await expect(measure).toHaveCount(0);
  await expect(barnRow.getByRole("cell", { name: "4 kg", exact: true })).toBeVisible();
  await expect(stock.getByRole("row").filter({ hasText: "Gudang" }).getByRole("cell", { name: "100 kg", exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Ringkasan stok pakan" }).getByText("16 kg", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Riwayat sisa harian", exact: true }).click();
  await expect(page.getByRole("table", { name: "Riwayat sisa harian" }).getByRole("cell", { name: "16 kg" })).toBeVisible();
  await page.getByRole("link", { name: "Saldo awal dan penyesuaian", exact: true }).click();
  await expect(page.getByRole("button", { name: "Catat saldo awal pakan" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sesuaikan stok pakan" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);

  const mixFixture = connectDatabase(testDatabaseUrl());
  try {
    const ingredient = await createFeedProduct(authHeaders, {
      requestKey: randomUUID(), code: "P-BHN-UJI", name: "Bahan Uji", kind: "ingredient",
    }, mixFixture.db);
    await createFeedProduct(authHeaders, {
      requestKey: randomUUID(), code: "P-MIX-UJI", name: "Campuran Uji", kind: "mixed",
    }, mixFixture.db);
    await buyFeed(authHeaders, {
      requestKey: randomUUID(), businessDate: businessDate(), productId: ingredient.id, supplier: "Pemasok bahan", grams: "30", total: "30000",
    }, mixFixture.db);
  } finally {
    await mixFixture.client.end();
  }
  await page.goto("/pakan?tab=aktivitas&jenis=campuran");
  await page.getByRole("button", { name: "Buat campuran pakan" }).click();
  const mix = page.getByRole("dialog", { name: "Buat campuran pakan" });
  await choose(mix, "Pakan hasil campuran", "P-MIX-UJI · Campuran Uji");
  await mix.getByLabel("Berat hasil (kg)").fill("9");
  for (const [number, name] of [[1, /P-UJI · Pakan Uji/], [2, /P-BHN-UJI · Bahan Uji/]] as const) {
    const ingredient = mix.getByRole("group", { name: `Bahan ${number}`, exact: true });
    await choose(ingredient, "Bahan pakan", name);
    await ingredient.getByLabel("Berat bahan (kg)").fill("5");
  }
  await confirm(mix);
  const mixRow = activity.getByRole("row").filter({ hasText: "Campuran Uji" });
  await expect(mixRow.getByRole("cell", { name: "9 kg", exact: true })).toBeVisible();
  await expect(mixRow.getByRole("cell", { name: "Susut 1 kg", exact: true })).toBeVisible();

  await page.goto("/produksi-telur");
  await page.getByRole("button", { name: "Catat panen telur" }).click();
  const harvest = page.getByRole("dialog", { name: "Catat panen telur" });
  await choose(harvest, "Kandang", "Kandang Produksi Uji");
  await choose(harvest, "Kelompok ternak", "KLP-PAKAN · Kelompok Produksi Uji");
  await harvest.getByLabel("Jumlah panen (butir)").fill("100");
  await harvest.getByLabel("Berat aktual (kg)").fill("5");
  await harvest.getByRole("button", { name: "Simpan pencatatan" }).click();
  await expect(harvest).toBeHidden();

  await openModuleTab(page, "Sortir");
  await page.getByRole("button", { name: "Catat sortir telur" }).click();
  const grade = page.getByRole("dialog", { name: "Catat sortir telur" });
  await choose(grade, "Lot panen belum disortir", /Kandang Produksi Uji/);
  await grade.getByLabel("Coklat (butir)").fill("70");
  await grade.getByLabel("Putih (butir)").fill("20");
  await grade.getByLabel("Cacat (butir)").fill("10");
  await confirm(grade);

  await openModuleTab(page, "Penjualan");
  await page.getByRole("button", { name: "Catat penjualan lunas" }).click();
  const sale = page.getByRole("dialog", { name: "Catat penjualan lunas" });
  await choose(sale, "Kategori", /Coklat/);
  await sale.getByLabel("Jumlah (butir)").fill("25");
  await sale.getByLabel("Harga per butir (Rp)").fill("1.000");
  await sale.getByLabel("Pembayaran diterima (Rp)").fill("25.000");
  await expect(sale.getByText(/Total penjualan: Rp/)).toBeVisible();
  await confirm(sale);
  const sold = page.getByRole("table", { name: "Penjualan" }).getByRole("row").filter({ hasText: "25 butir" });
  await expect(sold.getByText("Coklat", { exact: true })).toBeVisible();
  await expect(page.getByText(/Coklat 45 · Putih 20 · Cacat 10/)).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
});

test("kesehatan, kas, dan persetujuan koreksi", async ({ page, browser }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 320, height: 840 });
  await signIn(page);
  const cookies = (await page.context().cookies()).map(({ name, value }) => `${name}=${value}`).join("; ");
  const admin = new Headers({ cookie: cookies });
  const { client, db } = connectDatabase(testDatabaseUrl());
  const email = `petugas-${randomUUID().slice(0, 8)}@example.test`;
  const secret = randomBytes(20).toString("base64url");
  try {
    const auth = createAuth(db);
    await auth.api.createUser({ body: { name: "Petugas Koreksi", email, password: secret, role: "abk", data: { status: "active" } } });
    const response = await auth.api.signInEmail({ body: { email, password: secret }, asResponse: true });
    const operator = new Headers({ cookie: response.headers.getSetCookie().map((value) => value.split(";")[0]).join("; ") });
    const barn = await createBarn(admin, { requestKey: randomUUID(), code: "HF-TEST", name: "Kandang Koreksi Uji", location: "" }, db);
    const flock = await createFlock(operator, {
      requestKey: randomUUID(), code: "HF-KLP", name: "Kelompok Koreksi Uji", barnId: barn.id,
      kind: "arrival", businessDate: businessDate(), count: "80", age: "90", origin: "Peternakan Uji", reason: "Kedatangan kelompok",
    }, db);
    await addMovement(operator, { requestKey: randomUUID(), flockId: flock.id, kind: "death", count: "8", businessDate: businessDate(), reason: "Penghitungan uji awal" }, db);
  } finally {
    await client.end();
  }
  const roleContext = await browser.newContext();
  const operatorPage = await roleContext.newPage();
  await signIn(operatorPage, email, secret);
  await operatorPage.goto("/pengaturan?tab=koreksi");
  await operatorPage.getByRole("button", { name: "Ajukan koreksi" }).click();
  const correction = operatorPage.getByRole("dialog", { name: "Ajukan koreksi" });
  await correction.getByRole("combobox", { name: "Catatan yang dikoreksi" }).click();
  await operatorPage.getByRole("option", { name: /Penghitungan uji awal/ }).click();
  await correction.getByRole("combobox", { name: "Bentuk koreksi" }).click();
  await operatorPage.getByRole("option", { name: "Ganti jumlah mutasi" }).click();
  await correction.getByLabel("Jumlah pengganti (ekor)").fill("6");
  await correction.getByLabel("Alasan koreksi").fill("Jumlah dihitung ulang");
  await correction.getByRole("button", { name: "Simpan pencatatan" }).click();
  await expect(correction).toBeHidden();
  await expect(operatorPage.getByRole("cell", { name: "Menunggu", exact: true })).toBeVisible();

  await page.goto("/pengaturan?tab=koreksi");
  await expect(operatorPage.getByRole("table", { name: "Permintaan koreksi" }).getByRole("button", { name: "Buka tindakan" })).toHaveCount(0);
  await page.getByRole("row").filter({ hasText: "Jumlah dihitung ulang" }).getByRole("button", { name: "Buka tindakan" }).click();
  await page.getByRole("menuitem", { name: "Tinjau permintaan" }).click();
  const review = page.getByRole("dialog", { name: "Tinjau permintaan" });
  await review.getByRole("combobox", { name: "Keputusan" }).click();
  await page.getByRole("option", { name: "Setujui", exact: true }).click();
  await review.getByLabel("Alasan keputusan").fill("Catatan sudah diperiksa");
  await review.getByRole("button", { name: "Periksa dan lanjutkan" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Konfirmasi dan simpan" }).click();
  await expect(page.getByRole("cell", { name: "Disetujui", exact: true })).toBeVisible();
  await operatorPage.reload();
  await expect(operatorPage.getByRole("cell", { name: "Disetujui", exact: true })).toBeVisible();
  await roleContext.close();

  await page.goto("/kesehatan");
  await page.getByRole("button", { name: "Catat kejadian kesehatan" }).click();
  const incident = page.getByRole("dialog", { name: "Catat kejadian kesehatan" });
  await incident.getByRole("combobox", { name: "Kandang" }).click();
  await page.getByRole("option", { name: "Kandang Koreksi Uji", exact: true }).click();
  await incident.getByLabel("Jenis kejadian").fill("Pengamatan kandang");
  await incident.getByLabel("Gejala atau pengamatan").fill("Kondisi kelompok diamati");
  await incident.getByRole("button", { name: "Simpan pencatatan" }).click();
  await expect(page.getByRole("cell", { name: "Pengamatan kandang", exact: true })).toBeVisible();

  await page.goto("/kesehatan?tab=jadwal");
  await page.getByRole("button", { name: "Buat jadwal vaksin" }).click();
  const vaccine = page.getByRole("dialog", { name: "Buat jadwal vaksin" });
  await vaccine.getByRole("combobox", { name: "Kandang" }).click();
  await page.getByRole("option", { name: "Kandang Koreksi Uji", exact: true }).click();
  await vaccine.getByLabel("Nama vaksin").fill("Jadwal vaksin uji");
  const today = businessDate();
  const future = shiftBusinessDate(today, 1);
  await vaccine.getByRole("button", { name: /^Tanggal jadwal \(WIB\)/ }).press("Enter");
  const planCalendar = page.getByRole("dialog", { name: "Kalender Tanggal jadwal (WIB)" });
  await expect(calendarDay(planCalendar, today)).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(calendarDay(planCalendar, future)).toBeFocused();
  await page.keyboard.press("Enter");
  await vaccine.getByRole("button", { name: "Simpan pencatatan" }).click();
  await expect(page.getByRole("row").filter({ hasText: "Jadwal vaksin uji" })
    .getByRole("cell", { name: formatDate(future), exact: true })).toBeVisible();

  await page.goto("/keuangan?tab=pemasukan");
  await page.getByRole("button", { name: "Tambah pemasukan" }).click();
  const cash = page.getByRole("dialog", { name: "Tambah pemasukan" });
  await cash.getByLabel("Kategori").fill("Pemasukan kas uji");
  await cash.getByLabel("Jumlah (Rp)").fill("50.000");
  await cash.getByRole("button", { name: "Periksa dan lanjutkan" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Konfirmasi dan simpan" }).click();
  await expect(page.getByRole("cell", { name: "Pemasukan kas uji", exact: true })).toBeVisible();
  await page.getByRole("row").filter({ hasText: "Pemasukan kas uji" }).getByRole("button", { name: "Buka tindakan" }).click();
  await page.getByRole("menuitem", { name: "Tambah bukti" }).click();
  const receipt = page.getByRole("dialog", { name: "Tambah bukti" });
  await expect(receipt.getByLabel("Pilih foto bukti")).toBeVisible();
  await expect(receipt.getByRole("button", { name: "Simpan bukti" })).toBeDisabled();
  await receipt.getByRole("button", { name: "Tutup", exact: true }).click();
  await page.goto("/laporan?jenis=keuangan&transaksi=income&cari=Pemasukan%20kas%20uji");
  await expect(page.getByRole("heading", { name: "Laporan Keuangan farm" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "Pemasukan kas uji", exact: true })).toBeVisible();
  const pdfPath = (await page.getByRole("link", { name: "Unduh PDF" }).getAttribute("href"))!;
  const pdf = await page.request.get(pdfPath);
  expect(pdf.status()).toBe(200);
  expect(pdf.headers()["cache-control"]).toContain("no-store");
  expect((await PDFDocument.load(await pdf.body())).getTitle()).toContain("Keuangan farm");
});

test("reseller mencatat kemasan, stok, penjualan, dan mengunduh laporan privat", async ({ page, request }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 320, height: 840 });
  const { client, db } = connectDatabase(testDatabaseUrl());
  const email = `reseller-${randomUUID().slice(0, 8)}@example.test`;
  const secret = randomBytes(20).toString("base64url");
  try {
    const auth = createAuth(db);
    const { user } = await auth.api.createUser({ body: {
      name: "Reseller Uji", email, password: secret, role: "reseller", data: { status: "active" },
    } });
    await db.insert(resellerSpaces).values({ userId: user.id });
  } finally {
    await client.end();
  }

  expect((await request.get("/api/laporan/pdf")).status()).toBe(401);
  await signIn(page, email, secret, "/reseller");
  await page.getByRole("button", { name: "Buka atau tutup navigasi" }).click();
  const nav = page.getByRole("navigation", { name: "Modul utama" });
  await expect(nav.getByRole("link")).toHaveCount(3);
  await expect(nav.getByRole("link", { name: "Dashboard" })).toHaveCount(0);
  await page.keyboard.press("Escape");

  await openModuleTab(page, "Satuan");
  await page.getByRole("button", { name: "Tambah satuan kemasan" }).click();
  const unit = page.getByRole("dialog", { name: "Tambah satuan kemasan" });
  await unit.getByLabel("Kode satuan").fill("wadah");
  await unit.getByLabel("Nama satuan").fill("Kotak reseller");
  await unit.getByLabel("Butir per kemasan").fill("24");
  await unit.getByRole("button", { name: "Simpan pencatatan" }).click();
  await expect(page.getByRole("cell", { name: "Kotak reseller", exact: true })).toBeVisible();

  async function choose(dialog: ReturnType<Page["getByRole"]>, label: string, option: string | RegExp) {
    await dialog.getByRole("combobox", { name: label, exact: true }).click();
    await page.getByRole("option", { name: option }).click();
  }
  async function trade(sale: boolean) {
    await openModuleTab(page, sale ? "Penjualan" : "Stok masuk");
    const name = sale ? "Catat penjualan reseller" : "Catat stok masuk";
    await page.getByRole("button", { name }).click();
    const dialog = page.getByRole("dialog", { name });
    await choose(dialog, "Kategori telur", "Campuran");
    await choose(dialog, "Satuan pencatatan", "Kemasan");
    await choose(dialog, "Kemasan", /Kotak reseller/);
    await dialog.getByLabel("Jumlah kemasan").fill(sale ? "1" : "2");
    await dialog.getByLabel(sale ? "Pembayaran penuh diterima (Rp)" : "Biaya yang dibayar (Rp)").fill(sale ? "25.000" : "12.000");
    await dialog.getByRole("button", { name: "Periksa dan lanjutkan" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Konfirmasi dan simpan" }).click();
    await expect(dialog).toBeHidden();
  }
  await trade(false);
  await trade(true);

  await page.goto("/laporan");
  await expect(page.getByRole("heading", { name: "Laporan Usaha reseller", exact: true })).toBeVisible();
  await expect(page.getByRole("table", { name: "Saldo stok reseller" }).getByRole("cell", { name: "24", exact: true })).toBeVisible();
  await expect(page.getByText(/Rp.?13\.000/)).toBeVisible();
  const path = (await page.getByRole("link", { name: "Unduh PDF" }).getAttribute("href"))!;
  expect(path).toContain("jenis=reseller");
  const response = await page.request.get(path);
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toContain("application/pdf");
  expect(response.headers()["content-disposition"]).toMatch(/^attachment/);
  expect((await PDFDocument.load(await response.body())).getPageCount()).toBeGreaterThan(0);
  const [download] = await Promise.all([
    page.waitForEvent("download"), page.getByRole("link", { name: "Unduh PDF" }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^laporan-reseller-.*\.pdf$/);
  expect((await page.request.get("/api/laporan/pdf?jenis=operasional")).status()).toBe(403);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
});

function calendarDay(popup: Locator, day: string) {
  return popup.locator(`[role="gridcell"][data-day="${day}"]`).getByRole("button");
}

for (const { timezoneId, width, colorScheme } of [
  { timezoneId: "Asia/Jakarta", width: 320, colorScheme: "light" },
  { timezoneId: "America/Los_Angeles", width: 1440, colorScheme: "dark" },
] as const) {
  test.describe(`Pemilih tanggal — ${timezoneId}`, () => {
    test.use({ timezoneId, viewport: { width, height: 840 }, colorScheme });

    test("tanggal transaksi wajib dan periode laporan opsional", async ({ page }) => {
      const today = businessDate();
      const yesterday = shiftBusinessDate(today, -1);
      const tomorrow = shiftBusinessDate(today, 1);
      await signIn(page);
      await page.goto("/keuangan?tab=pemasukan");
      const add = page.getByRole("button", { name: "Tambah pemasukan" });
      await expect(add).toBeVisible();
      const html = page.locator("html");
      if (!(await html.evaluate((element, theme) => element.classList.contains(theme), colorScheme))) {
        await page.getByRole("button", { name: "Ganti tema terang atau gelap" }).click();
      }
      await expect(html).toContainClass(colorScheme);
      await add.click();
      const cash = page.getByRole("dialog", { name: "Tambah pemasukan" });
      const date = cash.getByRole("button", { name: /^Tanggal \(WIB\)/ });
      const popup = page.getByRole("dialog", { name: "Kalender Tanggal (WIB)" });
      await expect(date).toHaveAccessibleName(`Tanggal (WIB) ${formatDate(today)}`);
      await date.press("Enter");
      await expect(calendarDay(popup, today)).toBeFocused();
      await expect(popup.getByRole("button", { name: "Bulan berikutnya" })).toBeDisabled();
      if (tomorrow.slice(0, 7) === today.slice(0, 7)) {
        await expect(calendarDay(popup, tomorrow)).toBeDisabled();
      }
      const bounds = await popup.boundingBox();
      expect(bounds).not.toBeNull();
      expect(bounds!.x).toBeGreaterThanOrEqual(0);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      await page.keyboard.press("Escape");
      await expect(popup).toBeHidden();
      await expect(cash).toBeVisible();
      await expect(date).toBeFocused();

      await date.click();
      await popup.getByRole("button", { name: "Kosongkan tanggal" }).click();
      await expect(date).toHaveAccessibleName("Tanggal (WIB) Pilih tanggal");
      const category = `Uji kalender ${timezoneId}`;
      await cash.getByLabel("Kategori").fill(category);
      await cash.getByLabel("Jumlah (Rp)").fill("5000");
      await cash.getByRole("button", { name: "Periksa dan lanjutkan" }).click();
      await expect(cash.getByText("Masukkan tanggal yang valid.")).toBeVisible();
      await expect(date).toHaveAttribute("aria-invalid", "true");
      await date.evaluate((button) => button.closest("form")!.reset());
      await expect(date).toHaveAccessibleName(`Tanggal (WIB) ${formatDate(today)}`);
      await cash.getByLabel("Kategori").fill(category);
      await cash.getByLabel("Jumlah (Rp)").fill("5000");
      await date.press("Enter");
      await expect(calendarDay(popup, today)).toBeFocused();
      await page.keyboard.press("ArrowLeft");
      await expect(calendarDay(popup, yesterday)).toBeFocused();
      await page.keyboard.press("Enter");
      await expect(popup).toBeHidden();
      await expect(date).toBeFocused();
      await expect(date).toHaveAccessibleName(`Tanggal (WIB) ${formatDate(yesterday)}`);
      await cash.getByRole("button", { name: "Periksa dan lanjutkan" }).click();
      await page.getByRole("alertdialog").getByRole("button", { name: "Konfirmasi dan simpan" }).click();
      await expect(page.getByRole("row").filter({ hasText: category })
        .getByRole("cell", { name: formatDate(yesterday), exact: true })).toBeVisible();

      await page.goto("/laporan?jenis=keuangan");
      const start = page.getByRole("button", { name: /^Mulai \(WIB\)/ });
      const end = page.getByRole("button", { name: /^Akhir \(WIB\)/ });
      const initialStart = shiftBusinessDate(today, -29);
      const from = shiftBusinessDate(initialStart, 1);
      await expect(start).toHaveAccessibleName(`Mulai (WIB) ${formatDate(initialStart)}`);
      await expect(end).toHaveAccessibleName(`Akhir (WIB) ${formatDate(today)}`);
      await start.press("Enter");
      await expect(calendarDay(page.getByRole("dialog", { name: "Kalender Mulai (WIB)" }), initialStart)).toBeFocused();
      await page.keyboard.press("ArrowRight");
      await page.keyboard.press("Enter");
      await end.press("Enter");
      await expect(calendarDay(page.getByRole("dialog", { name: "Kalender Akhir (WIB)" }), today)).toBeFocused();
      await page.keyboard.press("ArrowLeft");
      await page.keyboard.press("Enter");
      const apply = page.getByRole("button", { name: "Terapkan filter" });
      await apply.click();
      await expect(page).toHaveURL(({ searchParams }) => searchParams.get("mulai") === from && searchParams.get("akhir") === yesterday);
      await expect(page.getByRole("link", { name: "Unduh PDF" })).toHaveAttribute("href", new RegExp(`mulai=${from}&akhir=${yesterday}`));
      await start.click();
      await page.getByRole("dialog", { name: "Kalender Mulai (WIB)" }).getByRole("button", { name: "Kosongkan tanggal" }).click();
      await expect(start).toHaveAccessibleName("Mulai (WIB) Pilih tanggal");
      await apply.click();
      await expect(page).toHaveURL(({ searchParams }) => !searchParams.has("mulai") && searchParams.get("akhir") === yesterday);
      await expect(start).toHaveAccessibleName(`Mulai (WIB) ${formatDate(shiftBusinessDate(yesterday, -29))}`);

      for (const { path, tab, label } of [
        { path: "/keuangan", tab: "pemasukan", label: "Hingga tanggal (WIB)" },
        { path: "/dashboard", tab: null, label: "Tanggal akhir (WIB)" },
        { path: "/populasi", tab: "mutasi", label: "Tanggal akhir (WIB)" },
      ]) {
        await page.goto(tab ? `${path}?tab=${tab}` : path);
        const filters = page.getByRole("form", { name: "Filter catatan" });
        await filters.getByRole("button", { name: `${label} ${formatDate(today)}`, exact: true }).click();
        await calendarDay(page.getByRole("dialog", { name: `Kalender ${label}` }), yesterday).click();
        await filters.getByRole("button", { name: "Terapkan filter" }).click();
        await expect(page).toHaveURL(({ pathname, searchParams }) =>
          pathname === path && searchParams.get("akhir") === yesterday && searchParams.get("tab") === tab,
        );
      }
    });
  });
}

test("ledger and report sorting work across filtered pages and preserve PDF scope", async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 390, height: 840 });
  await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "light" });
  await signIn(page);
  const cookie = (await page.context().cookies()).map(({ name, value }) => `${name}=${value}`).join("; ");
  const { client, db } = connectDatabase(testDatabaseUrl());
  const amounts = [100000, 20000, 5000, 1, 900000, 70, 9000, 3000, 500, 15000, 50000, 75000, 8, 120000, 6000, 40000, 32000];
  try {
    for (const [index, amount] of amounts.entries()) {
      await postCash(new Headers({ cookie }), {
        requestKey: randomUUID(), businessDate: shiftBusinessDate(businessDate(), -(index % 3)), amount: String(amount),
        direction: "income", category: "Regresi urutan", note: "Catatan dengan uraian ".repeat(10),
      }, db);
    }
  } finally {
    await client.end();
  }
  const ascending = amounts.toSorted((a, b) => a - b);
  const idr = (index: number) => formatIDR(BigInt(ascending[index]));
  await page.goto("/keuangan?tab=pemasukan&cari=Regresi+urutan&halaman=2");
  const table = page.getByRole("table", { name: "Buku kas farm" });
  const first = table.locator("tbody tr").first();
  await expect(first.getByRole("cell").first()).toHaveText("13");
  await table.getByLabel("Urutkan naik: Jumlah").click();
  await expect(page).toHaveURL(({ searchParams }) => searchParams.get("urut") === "amount"
    && searchParams.get("cari") === "Regresi urutan" && !searchParams.has("halaman"));
  await expect(table.locator('th[data-column="amount"]')).toHaveAttribute("aria-sort", "ascending");
  await expect(first.getByRole("cell").first()).toHaveText("1");
  await expect(first.getByRole("cell", { name: idr(0), exact: true })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Paginasi" })).toContainText("17 hasil");
  await page.getByRole("link", { name: "Berikutnya" }).click();
  await expect(first.getByRole("cell").first()).toHaveText("13");
  await expect(first.getByRole("cell", { name: idr(12), exact: true })).toBeVisible();
  await table.getByLabel("Urutkan turun: Jumlah").click();
  await expect(table.locator('th[data-column="amount"]')).toHaveAttribute("aria-sort", "descending");
  await expect(first.getByRole("cell", { name: idr(16), exact: true })).toBeVisible();
  const filters = page.getByRole("form", { name: "Filter catatan" });
  await filters.getByLabel("Cari catatan").fill("Tidak ada hasil yang cocok");
  await filters.getByRole("button", { name: "Terapkan filter" }).click();
  await expect(page.getByRole("navigation", { name: "Paginasi" })).toContainText("0 hasil");
  await expect(table.locator('th[data-column="amount"]')).toHaveAttribute("aria-sort", "descending");
  await table.getByLabel("Kembalikan urutan awal: Jumlah").click();
  await expect(table.locator("th[aria-sort]")).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);

  await page.goto("/laporan?jenis=keuangan&cari=Regresi+urutan");
  const report = page.getByRole("table", { name: "Buku kas farm" });
  const pdfLink = page.getByRole("link", { name: "Unduh PDF" });
  const href = await pdfLink.getAttribute("href");
  await report.getByLabel("Urutkan naik: Jumlah").click();
  await expect(report.locator('th[data-column="amount"]')).toHaveAttribute("aria-sort", "ascending");
  await expect(report.locator("tbody tr").first().getByRole("cell", { name: idr(0), exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Berikutnya" }).click();
  await expect(report.locator("tbody tr").first().getByRole("cell").first()).toHaveText("16");
  await expect(report.locator("tbody tr").first().getByRole("cell", { name: idr(15), exact: true })).toBeVisible();
  expect(await pdfLink.getAttribute("href")).toBe(href);
  expect((await page.request.get(href!)).status()).toBe(200);
});

test("all module table variants render their shared header and stay within the viewport", async ({ page, browser }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 430, height: 840 });
  await signIn(page);
  const variants = {
    "/populasi": ["kandang", "kelompok", "mutasi", "riwayat"],
    "/pakan": ["stok", "aktivitas", "jenis", "sisa", "penyesuaian"],
    "/produksi-telur": ["panen", "sortir", "stok", "penjualan", "riwayat"],
    "/kesehatan": ["kejadian", "jadwal", "pelaksanaan", "karantina"],
    "/keuangan": ["ringkasan", "pemasukan", "pengeluaran", "riwayat"],
    "/pengaturan": ["akun", "audit", "koreksi"],
  };
  async function checkTables(screen: Page, route: string) {
    await screen.goto(route);
    const tables = screen.getByRole("table");
    await expect(tables.first()).toBeVisible();
    for (const table of await tables.all()) {
      await expect(table.getByRole("columnheader").first()).toHaveText("#");
      const dataHeaders = table.locator("th[data-column]:not([data-column=actions])");
      expect(await dataHeaders.count()).toBeGreaterThan(0);
      await expect(dataHeaders.locator('[aria-label^="Urutkan naik"]')).toHaveCount(await dataHeaders.count());
    }
    const stats = await screen.evaluate(() => ({
      page: document.documentElement.scrollWidth,
      width: innerWidth,
      nested: document.querySelectorAll("[data-slot=table-container] [data-slot=table-container]").length,
    }));
    expect(stats.page, route).toBe(stats.width);
    expect(stats.nested, route).toBe(0);
  }
  for (const [route, tabs] of Object.entries(variants)) {
    for (const tab of tabs) await checkTables(page, `${route}?tab=${tab}`);
  }
  await checkTables(page, "/laporan?jenis=operasional");
  await checkTables(page, "/laporan?jenis=keuangan");
  await page.goto("/pengaturan");
  await expect(page.getByRole("heading", { name: "Profil dan tampilan" })).toBeVisible();
  await page.goto("/laporan?mulai=2020-01-01");
  await expect(page.getByRole("heading", { name: "Laporan tidak dapat dibuka" })).toBeVisible();
  await page.goto("/tidak-ada");
  await expect(page.getByRole("heading", { name: "Halaman tidak ditemukan" })).toBeVisible();

  const { client, db } = connectDatabase(testDatabaseUrl());
  const accounts = [];
  try {
    const auth = createAuth(db);
    for (const role of ["pemilik", "abk", "reseller"] as const) {
      const email = `audit-${randomUUID()}@example.test`;
      const password = randomBytes(20).toString("base64url");
      const { user } = await auth.api.createUser({ body: { name: "Akun audit UI", email, password, role, data: { status: "active" } } });
      if (role === "reseller") await db.insert(resellerSpaces).values({ userId: user.id });
      accounts.push({ role, email, password });
    }
  } finally {
    await client.end();
  }
  for (const { role, email, password } of accounts) {
    const context = await browser.newContext({ viewport: { width: 430, height: 840 } });
    try {
      const screen = await context.newPage();
      await signIn(screen, email, password, role === "reseller" ? "/reseller" : "/dashboard");
      if (role === "reseller") {
        for (const tab of ["stok", "masuk", "penjualan", "kas", "satuan"]) await checkTables(screen, `/reseller?tab=${tab}`);
        await checkTables(screen, "/laporan?jenis=reseller");
      } else {
        for (const [route, tabs] of Object.entries(variants)) {
          if (route === "/pengaturan" || (route === "/keuangan" && role === "abk")) continue;
          for (const tab of tabs) {
            await checkTables(screen, `${route}?tab=${tab}`);
            if (role === "pemilik" && route !== "/keuangan") {
              await expect(screen.getByRole("button", { name: "Buka tindakan" })).toHaveCount(0);
            }
          }
        }
        await checkTables(screen, "/laporan?jenis=operasional");
        if (role === "abk") {
          await checkTables(screen, "/pengaturan?tab=koreksi");
          await expect(screen.getByRole("button", { name: "Buka tindakan" })).toHaveCount(0);
          await screen.goto("/keuangan");
          await expect(screen).toHaveURL("/dashboard");
        }
        await screen.goto("/pengaturan?tab=akun");
        await expect(screen.getByRole("heading", { name: "Profil dan tampilan" })).toBeVisible();
        await expect(screen.getByRole("table", { name: "Akun pengguna" })).toHaveCount(0);
      }
    } finally {
      await context.close();
    }
  }
});
