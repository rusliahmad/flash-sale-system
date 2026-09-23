export function saleKeys(saleId: string) {
  return {
    stock: `sale:${saleId}:stock`,
    buyers: `sale:${saleId}:buyers`,
  };
}
