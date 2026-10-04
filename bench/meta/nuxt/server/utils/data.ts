export const products = Array.from({ length: 100 }, (_, i) => ({
  sku: `sku-${i}`,
  name: `Product ${i}`,
  price: 10 + (i % 37),
}))
export type Product = (typeof products)[number]
