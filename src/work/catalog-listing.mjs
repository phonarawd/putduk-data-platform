// 카탈로그 근무 1장. 상품명·가격·옵션·배송을 직접 입력한다.

export const CATALOG_PRODUCTS = [
  '무선 이어폰 실리콘 케이스',
  '캠핑 접이식 테이블',
  '유아 스트라이프 내의',
  '스테인리스 텀블러 500ml'
];

export const CATALOG_PRICES = ['12900', '35900', '18900', '24900'];
export const CATALOG_OPTIONS = ['블랙 / 1개', '우드 / 2인용', '90호 / 아이보리', '실버 / 손잡이형'];
export const CATALOG_SHIPPING = ['무료배송 · 오늘출발', '3,000원 · 2-3일', '무료배송 · 해외직구 10일', '조건부무료 · 3만원 이상'];

export function catalogSeedFromRunId(runId) {
  const hex = String(runId || '')
    .replace(/-/g, '')
    .toLowerCase()
    .replace(/[^0-9a-f]/g, '')
    .slice(0, 8)
    .padEnd(8, '0');
  return parseInt(hex, 16) >>> 0;
}

export function isCatalogWork(node) {
  const motion = String(node?.motion || node?.motion_profile || node?.motionProfile || '');
  return motion.includes('catalog');
}

export function normalizeCatalogText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

export function normalizeCatalogPrice(value) {
  return String(value || '').replace(/\D/g, '');
}

export function catalogListingForRun(runId) {
  const seed = catalogSeedFromRunId(runId);
  return {
    productName: CATALOG_PRODUCTS[seed % CATALOG_PRODUCTS.length],
    price: CATALOG_PRICES[(seed >>> 3) % CATALOG_PRICES.length],
    option: CATALOG_OPTIONS[(seed >>> 5) % CATALOG_OPTIONS.length],
    shipping: CATALOG_SHIPPING[(seed >>> 7) % CATALOG_SHIPPING.length]
  };
}

export function readCatalogListing(raw) {
  const row = raw && typeof raw === 'object' ? raw : {};
  return {
    productName: normalizeCatalogText(row.productName || row.product_name),
    price: normalizeCatalogPrice(row.price),
    option: normalizeCatalogText(row.option),
    shipping: normalizeCatalogText(row.shipping)
  };
}

export function catalogListingComplete(listing) {
  const row = readCatalogListing(listing);
  return Boolean(row.productName && row.price && row.option && row.shipping);
}

export function gradeCatalogListing(runId, listing) {
  const expected = catalogListingForRun(runId);
  const got = readCatalogListing(listing);
  if (!catalogListingComplete(got)) {
    return { ok: false, reason: 'empty', expected, got };
  }
  if (
    got.productName !== expected.productName
    || got.price !== expected.price
    || got.option !== expected.option
    || got.shipping !== expected.shipping
  ) {
    return { ok: false, reason: 'mismatch', expected, got };
  }
  return { ok: true, expected, got };
}
