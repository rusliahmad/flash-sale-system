export interface SaleStatus {
  saleId: string;
  name: string;
  startsAt: string;
  endsAt: string;
  stock: number;
  status: "upcoming" | "active" | "ended";
}

export async function fetchSaleStatus(): Promise<SaleStatus> {
  const res = await fetch("/api/sale");
  if (!res.ok) throw new Error(`GET /api/sale failed: ${res.status}`);
  return res.json();
}
