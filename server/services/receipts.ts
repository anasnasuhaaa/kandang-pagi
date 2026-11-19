import { createHash } from "node:crypto";
import { and, desc, eq, inArray, lt } from "drizzle-orm";
import sharp from "sharp";
import { database } from "../../db";
import { farmCash, farmEvents, transactionReceipts } from "../../db/schema";
import { receiptExtensions, receiptFileError, receiptMime, type ReceiptMime } from "../../lib/receipts";
import { uuidSchema } from "../../lib/validation";
import { requireRole } from "../auth/permissions";
import { ServiceError } from "./errors";
import { farmWrite, isEffective, parseInput, type Store } from "./farm";
import { financeReaders } from "./finance";
import { imageKitProvider, receiptFolder, type ReceiptProvider } from "./imagekit";
import { writeAudit } from "./transactions";

const cleanupDelay = 5 * 60_000;
const formats = { "image/jpeg": "jpeg", "image/png": "png", "image/webp": "webp" } as const;

export async function validateReceipt(bytes: Buffer, mime: string): Promise<ReceiptMime> {
  const validation = receiptFileError(mime, bytes.length);
  if (validation) throw new ServiceError("invalid", validation);
  const parsed = receiptMime.parse(mime);
  try {
    const image = sharp(bytes, { limitInputPixels: 12_000_000, failOn: "warning" });
    const metadata = await image.metadata();
    if (metadata.format !== formats[parsed] || (metadata.pages ?? 1) > 1) throw new Error("Invalid format");
    await image.resize(1, 1).raw().toBuffer();
  } catch {
    throw new ServiceError("invalid", "Isi gambar tidak valid atau dimensinya terlalu besar.");
  }
  return parsed;
}

async function availableCash(store: Store, id: string, effective = false) {
  const [cash] = await store.select({ id: farmCash.id }).from(farmCash).innerJoin(farmEvents, eq(farmEvents.id, farmCash.id))
    .where(and(eq(farmCash.id, id), effective ? isEffective(store) : undefined, inArray(farmCash.direction, ["opening", "income", "expense"])));
  if (!cash) throw new ServiceError("not-found", "Transaksi kas tidak ditemukan.");
  return cash.id;
}

export async function uploadReceipt(
  headers: Headers, input: { cashId: string; requestId: string; bytes: Buffer; mime: string },
  db = database(), provider?: ReceiptProvider,
) {
  await requireRole(headers, ["administrator"], db);
  const cashId = parseInput(uuidSchema, input.cashId);
  const id = parseInput(uuidSchema, input.requestId);
  const mime = await validateReceipt(input.bytes, input.mime);
  const digest = createHash("sha256").update(input.bytes).digest("hex");
  const path = `${receiptFolder()}/${id}.${receiptExtensions[mime]}`;
  const service = provider ?? imageKitProvider();

  const reserved = await farmWrite(headers, ["administrator"], db, async (tx, actor) => {
    await availableCash(tx, cashId, true);
    const [previous] = await tx.select().from(transactionReceipts).where(eq(transactionReceipts.id, id));
    if (previous) {
      if (previous.cashId === cashId && previous.uploadedBy === actor.id && previous.digest === digest
          && (previous.status === "active" || previous.status === "replaced")) return false;
      throw new ServiceError("conflict", "Unggahan ini masih diproses atau identitasnya sudah dipakai. Pilih ulang gambar untuk mencoba lagi.");
    }
    const [newReceipt] = await tx.insert(transactionReceipts).values({
      id, cashId, filePath: path, digest, mime, sizeBytes: input.bytes.length, status: "pending", uploadedBy: actor.id,
    }).onConflictDoNothing().returning({ id: transactionReceipts.id });
    if (!newReceipt) throw new ServiceError("conflict", "Masih ada unggahan untuk transaksi ini.");
    return true;
  });
  if (!reserved) return { id, replay: true };

  let uploaded: { id: string; path: string } | undefined;
  try {
    uploaded = await service.upload(path, input.bytes, mime);
    if (uploaded.path !== path) throw new Error("Unexpected image path");
    const remoteId = uploaded.id;
    await farmWrite(headers, ["administrator"], db, async (tx, actor) => {
      await availableCash(tx, cashId, true);
      const [pending] = await tx.select().from(transactionReceipts).where(and(eq(transactionReceipts.id, id), eq(transactionReceipts.status, "pending")));
      if (!pending || pending.uploadedBy !== actor.id) throw new ServiceError("conflict", "Unggahan sudah tidak dapat diselesaikan.");
      const [old] = await tx.update(transactionReceipts).set({ status: "replaced", replacedBy: id })
        .where(and(eq(transactionReceipts.cashId, cashId), eq(transactionReceipts.status, "active")))
        .returning({ id: transactionReceipts.id });
      await tx.update(transactionReceipts).set({ status: "active", fileId: remoteId }).where(eq(transactionReceipts.id, id));
      await writeAudit(tx, {
        actorId: actor.id, actorRole: actor.role, entity: "receipt", entityId: id, action: old ? "receipt_replaced" : "receipt_added",
        after: { cashId, mime, bytes: input.bytes.length, previous: old?.id ?? null },
      });
    });
    return { id, replay: false };
  } catch {
    // If the client lost the commit response, preserve any receipt that is already active.
    const state = await db.select({ status: transactionReceipts.status }).from(transactionReceipts)
      .where(eq(transactionReceipts.id, id)).catch(() => null);
    if (state?.[0]?.status === "active" || state?.[0]?.status === "replaced") return { id, replay: true };
    if (state) {
      const [marked] = await db.update(transactionReceipts).set({ status: "cleanup_pending", fileId: uploaded?.id })
        .where(and(eq(transactionReceipts.id, id), eq(transactionReceipts.status, "pending")))
        .returning({ id: transactionReceipts.id }).catch(() => []);
      if (marked && uploaded) {
        try {
          await service.remove(uploaded.id);
          await db.update(transactionReceipts).set({ status: "deleted" }).where(eq(transactionReceipts.id, id));
        } catch {
          // The deterministic reservation remains available for reconciliation.
        }
      }
    }
    throw new ServiceError("conflict", "Bukti gagal disimpan. Transaksi kas tetap tercatat. Pilih ulang gambar untuk mencoba lagi.");
  }
}

export async function receiptDelivery(headers: Headers, raw: { cashId: string; receiptId?: string }, db = database(), provider?: ReceiptProvider) {
  await requireRole(headers, financeReaders, db);
  const cashId = parseInput(uuidSchema, raw.cashId);
  const id = raw.receiptId ? parseInput(uuidSchema, raw.receiptId) : undefined;
  await availableCash(db, cashId);
  const [row] = await db.select({ path: transactionReceipts.filePath }).from(transactionReceipts).where(and(
    eq(transactionReceipts.cashId, cashId),
    id ? and(eq(transactionReceipts.id, id), inArray(transactionReceipts.status, ["active", "replaced"])) : eq(transactionReceipts.status, "active"),
  ));
  if (!row) throw new ServiceError("not-found", "Bukti transaksi tidak ditemukan.");
  return (provider ?? imageKitProvider()).signed(row.path);
}

export async function receiptHistory(headers: Headers, cashId: string, db = database()) {
  await requireRole(headers, financeReaders, db);
  await availableCash(db, parseInput(uuidSchema, cashId));
  return db.select({ id: transactionReceipts.id, status: transactionReceipts.status, at: transactionReceipts.recordedAt })
    .from(transactionReceipts).where(and(eq(transactionReceipts.cashId, cashId), inArray(transactionReceipts.status, ["active", "replaced"])))
    .orderBy(desc(transactionReceipts.recordedAt));
}

export async function reconcileReceipts(headers: Headers, db = database(), provider?: ReceiptProvider) {
  await requireRole(headers, ["administrator"], db);
  const service = provider ?? imageKitProvider();
  const threshold = new Date(Date.now() - cleanupDelay);
  const queued = await db.select().from(transactionReceipts).where(and(
    inArray(transactionReceipts.status, ["pending", "cleanup_pending"]), lt(transactionReceipts.recordedAt, threshold),
  )).limit(20);
  let cleared = 0;
  for (const candidate of queued) {
    const claimed = await farmWrite(headers, ["administrator"], db, async (tx) => {
      const [row] = await tx.update(transactionReceipts).set({ status: "cleanup_pending" })
        .where(and(eq(transactionReceipts.id, candidate.id), inArray(transactionReceipts.status, ["pending", "cleanup_pending"]))).returning();
      return row;
    });
    if (!claimed) continue;
    try {
      const remoteId = claimed.fileId ?? await service.find(claimed.filePath);
      if (remoteId) await service.remove(remoteId);
      await farmWrite(headers, ["administrator"], db, async (tx, actor) => {
        const [row] = await tx.update(transactionReceipts).set({ status: "deleted" })
          .where(and(eq(transactionReceipts.id, claimed.id), eq(transactionReceipts.status, "cleanup_pending")))
          .returning({ id: transactionReceipts.id });
        if (!row) return;
        await writeAudit(tx, { actorId: actor.id, actorRole: actor.role, entity: "receipt", entityId: row.id, action: "orphan_cleaned" });
        cleared++;
      });
    } catch {
      // A later cleanup can retry the same deterministic path.
    }
  }
  return { cleared, inspected: queued.length };
}
