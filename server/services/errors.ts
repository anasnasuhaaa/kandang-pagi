export class ServiceError extends Error {
  constructor(public readonly code: "unauthenticated" | "forbidden" | "invalid" | "conflict" | "not-found" | "rate-limit", message: string) {
    super(message);
    this.name = "ServiceError";
  }
}

export function safeError(error: unknown) {
  return error instanceof ServiceError ? error.message : "Terjadi gangguan. Coba lagi dalam beberapa saat.";
}
