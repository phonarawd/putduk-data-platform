// 원장 금액. 없는 값을 0원으로 바꾸지 않는다.

export function parseLedgerAmount(value) {
  if (value == null || value === '') return null;
  const amount = typeof value === 'number' ? value : Number(String(value).replace(/,/g, ''));
  return Number.isFinite(amount) ? amount : null;
}

export function formatLedgerAmount(value, missing = '확인 필요') {
  const amount = parseLedgerAmount(value);
  if (amount == null) return missing;
  return `${Math.round(amount).toLocaleString('ko-KR')}원`;
}

export function walletBucketMap(rows) {
  const list = Array.isArray(rows) ? rows : [];
  return Object.fromEntries(
    list
      .filter((row) => String(row?.currency || 'KRW').toUpperCase() === 'KRW')
      .map((row) => [String(row.bucket || ''), row])
  );
}

export function bucketField(row, field) {
  if (!row || typeof row !== 'object') return null;
  if (!Object.prototype.hasOwnProperty.call(row, field)) return null;
  return parseLedgerAmount(row[field]);
}

export function walletThreeFromBuckets(rows) {
  const buckets = walletBucketMap(rows);
  return {
    support: bucketField(buckets.support_grant, 'available_amount'),
    work: bucketField(buckets.work_balance, 'available_amount'),
    workHeld: bucketField(buckets.work_balance, 'held_amount'),
    available: bucketField(buckets.available, 'available_amount'),
    availableHeld: bucketField(buckets.available, 'held_amount')
  };
}
