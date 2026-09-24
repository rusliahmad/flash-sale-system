export type PurchaseResult = "OK" | "ALREADY_PURCHASED" | "SOLD_OUT" | "NOT_INITIALIZED";

export const PURCHASE_SCRIPT = `
local stock = redis.call('GET', KEYS[1])
if not stock then
  return 'NOT_INITIALIZED'
end
if redis.call('SISMEMBER', KEYS[2], ARGV[1]) == 1 then
  return 'ALREADY_PURCHASED'
end
if tonumber(stock) <= 0 then
  return 'SOLD_OUT'
end
redis.call('DECR', KEYS[1])
redis.call('SADD', KEYS[2], ARGV[1])
return 'OK'
`;
