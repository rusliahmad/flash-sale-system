import "dotenv/config";

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

export const env = {
  port: Number(process.env.PORT ?? 4000),
  redisUrl: required("REDIS_URL", "redis://localhost:6379"),
  sale: {
    id: required("SALE_ID", "flash-sale-1"),
    name: required("SALE_NAME", "Flash Sale"),
    stock: Number(process.env.SALE_STOCK ?? 100),
    startsAt: required("SALE_STARTS_AT", new Date(Date.now() - 60_000).toISOString()),
    endsAt: required("SALE_ENDS_AT", new Date(Date.now() + 24 * 60 * 60_000).toISOString()),
  },
};
