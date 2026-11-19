import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import sharp from "sharp";
import { connectDatabase } from "../db";
import { businessDate } from "../lib/format";
import { postCash } from "../server/services/finance";
import { imageKitProvider } from "../server/services/imagekit";
import { receiptDelivery, receiptHistory, uploadReceipt } from "../server/services/receipts";
import { fixtureActor } from "../tests/integration/fixtures";
import { testDatabaseUrl } from "../tests/integration/test-database";
import { loadLocalEnvironment } from "./database-target";

async function smoke() {
  loadLocalEnvironment();
  const { client, db } = connectDatabase(testDatabaseUrl());
  process.env.IMAGEKIT_RECEIPT_FOLDER = `/kandang-pagi/verification/${randomUUID()}`;
  const source = imageKitProvider();
  const created = new Set<string>();
  const provider = {
    ...source,
    async upload(...args: Parameters<typeof source.upload>) {
      const asset = await source.upload(...args);
      created.add(asset.id);
      return asset;
    },
  };
  try {
    await migrate(db, { migrationsFolder: "./db/migrations" });
    const admin = await fixtureActor(db, "administrator");
    const owner = await fixtureActor(db, "pemilik");
    const event = await postCash(admin.headers, {
      requestKey: randomUUID(), businessDate: businessDate(), category: "Uji integrasi ImageKit", amount: "1000", direction: "income",
    }, db);
    for (const color of ["#dc2626", "#4455aa"]) {
      const bytes = await sharp({ create: { width: 24, height: 24, channels: 3, background: color } }).png().toBuffer();
      await uploadReceipt(admin.headers, { cashId: event.id, requestId: randomUUID(), bytes, mime: "image/png" }, db, provider);
    }
    const versions = await receiptHistory(owner.headers, event.id, db);
    assert.deepEqual(versions.map(({ status }) => status), ["active", "replaced"]);
    const signed = await receiptDelivery(owner.headers, { cashId: event.id, receiptId: versions[0].id }, db, provider);
    const unsigned = new URL(signed);
    unsigned.search = "";
    const [allowed, blocked] = await Promise.all([
      fetch(signed, { signal: AbortSignal.timeout(12_000) }),
      fetch(unsigned, { signal: AbortSignal.timeout(12_000) }),
    ]);
    assert.equal(allowed.status, 200);
    assert.equal(blocked.status, 403);
    assert.equal((await sharp(Buffer.from(await allowed.arrayBuffer())).metadata()).format, "png");
    console.log("Bukti privat: 2 versi, 1 aktif, akses bertanda tangan HTTP 200, akses tanpa tanda tangan HTTP 403.");
  } finally {
    const removed = await Promise.allSettled([...created].map((id) => source.remove(id)));
    await client.end({ timeout: 2 });
    const failures = removed.filter(({ status }) => status !== "fulfilled").length;
    if (failures) throw new Error("ImageKit cleanup failed");
    console.log(`Berkas uji dibersihkan: ${removed.length}.`);
  }
}

smoke().catch(() => {
  console.error("Uji integrasi ImageKit gagal. Periksa koneksi, konfigurasi, dan folder verifikasi.");
  process.exitCode = 1;
});
