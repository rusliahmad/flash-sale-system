export interface SaleStatus {
  saleId: string;
  name: string;
  startsAt: string;
  endsAt: string;
  stock: number;
  status: "upcoming" | "active" | "ended";
}

export type PurchaseErrorCode =
  | "INVALID_USER_ID"
  | "SALE_NOT_STARTED"
  | "SALE_ENDED"
  | "ALREADY_PURCHASED"
  | "SOLD_OUT"
  | "SALE_NOT_INITIALIZED";

export type PurchaseOutcome =
  | { ok: true }
  | { ok: false; code: PurchaseErrorCode | "NETWORK_ERROR" | "UNKNOWN" };

export async function fetchSaleStatus(): Promise<SaleStatus> {
  const res = await fetch("/api/sale");
  if (!res.ok) throw new Error(`GET /api/sale failed: ${res.status}`);
  return res.json();
}

export async function purchase(userId: string): Promise<PurchaseOutcome> {
  try {
    const res = await fetch("/api/purchase", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    if (res.status === 201) return { ok: true };
    const body = await res.json().catch(() => ({}));
    return { ok: false, code: (body.error as PurchaseErrorCode) ?? "UNKNOWN" };
  } catch {
    return { ok: false, code: "NETWORK_ERROR" };
  }
}
