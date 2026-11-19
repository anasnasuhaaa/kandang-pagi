import ImageKit, { toFile } from "@imagekit/nodejs";
import { posix } from "node:path";
import { z } from "zod";
import type { ReceiptMime } from "../../lib/receipts";
import { ServiceError } from "./errors";

const folderSchema = z.string().regex(/^\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]+$/);
export type ReceiptProvider = {
  upload: (path: string, bytes: Buffer, mime: ReceiptMime) => Promise<{ id: string; path: string }>;
  remove: (id: string) => Promise<void>;
  find: (path: string) => Promise<string | null>;
  signed: (path: string) => string;
};

export function receiptFolder() {
  return folderSchema.parse(process.env.IMAGEKIT_RECEIPT_FOLDER || "/kandang-pagi/receipts");
}

export function imageKitProvider(): ReceiptProvider {
  const endpoint = process.env.NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT;
  const privateKey = process.env.IMAGEKIT_PRIVATE_KEY;
  if (!privateKey || !endpoint || !endpoint.startsWith("https://")) {
    throw new ServiceError("invalid", "Penyimpanan bukti transaksi belum dikonfigurasi.");
  }
  const client = new ImageKit({ privateKey, timeout: 15_000, maxRetries: 0 });
  return {
    async upload(path, bytes, mime) {
      const fileName = posix.basename(path);
      const result = await client.files.upload({
        file: await toFile(bytes, fileName, { type: mime }), fileName, folder: posix.dirname(path),
        isPrivateFile: true, useUniqueFileName: false, overwriteFile: false, responseFields: ["isPrivateFile"],
      });
      if (!result.fileId || !result.filePath) throw new Error("ImageKit response missing file identity");
      return { id: result.fileId, path: result.filePath };
    },
    async remove(id) {
      try { await client.files.delete(id); } catch (error) {
        if (!(error instanceof ImageKit.NotFoundError)) throw error;
      }
    },
    async find(path) {
      const name = posix.basename(path);
      const assets = await client.assets.list({ path: posix.dirname(path), searchQuery: `name = "${name}"`, limit: 10 });
      const match = assets.find((item) => "filePath" in item && item.filePath === path);
      return match && "fileId" in match && typeof match.fileId === "string" ? match.fileId : null;
    },
    signed(path) {
      return client.helper.buildSrc({ urlEndpoint: endpoint, src: path, signed: true, expiresIn: 120 });
    },
  };
}
