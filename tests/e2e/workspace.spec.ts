import { randomBytes, randomUUID } from "node:crypto";
import axe from "axe-core";
import { PDFDocument } from "pdf-lib";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { connectDatabase } from "../../db";
import { rateLimit, resellerSpaces } from "../../db/schema";
import { businessDate } from "../../lib/format";
import { createAuth } from "../../server/auth/config";
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
  await page.getByRole("row").filter({ hasText: operatorEmail }).getByRole("button", { name: "Tautan reset" }).click();
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
  await page.getByRole("button", { name: "Tinjau permintaan" }).click();
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

  await page.goto("/keuangan?tab=pemasukan");
  await page.getByRole("button", { name: "Tambah pemasukan" }).click();
  const cash = page.getByRole("dialog", { name: "Tambah pemasukan" });
  await cash.getByLabel("Kategori").fill("Pemasukan kas uji");
  await cash.getByLabel("Jumlah (Rp)").fill("50.000");
  await cash.getByRole("button", { name: "Periksa dan lanjutkan" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Konfirmasi dan simpan" }).click();
  await expect(page.getByRole("cell", { name: "Pemasukan kas uji", exact: true })).toBeVisible();
  await expect(page.getByRole("row").filter({ hasText: "Pemasukan kas uji" }).getByRole("button", { name: "Tambah bukti" })).toBeVisible();
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

  await page.getByRole("tab", { name: "Satuan", exact: true }).click();
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
    await page.getByRole("tab", { name: sale ? "Penjualan" : "Stok masuk", exact: true }).click();
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
