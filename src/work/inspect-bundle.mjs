// 근무 5건 대조. 런 UUID 앞 8자리로 송장·실물 불일치를 서버와 같이 만든다.

export const INSPECT_TOTAL = 5;

export function inspectSeedFromRunId(runId) {
  const hex = String(runId || '')
    .replace(/-/g, '')
    .toLowerCase()
    .replace(/[^0-9a-f]/g, '')
    .slice(0, 8)
    .padEnd(8, '0');
  return parseInt(hex, 16) >>> 0;
}

export function normalizeInspectChoice(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (['a', '1', 'yes', 'choice_a', 'choice-a'].includes(raw)) return 'yes';
  if (['b', '2', 'no', 'choice_b', 'choice-b'].includes(raw)) return 'no';
  return '';
}

export function normalizeTypedLabel(value) {
  const raw = String(value || '').trim().toUpperCase().replace(/\s+/g, '');
  if (!raw) return '';
  const digits = raw.replace(/\D/g, '');
  if (digits.length >= 4) return `PDK-${digits.slice(-4)}`;
  if (/^PDK-\d{4}$/.test(raw)) return raw;
  return raw;
}

export function answersLookLikeLabels(answers) {
  return Array.isArray(answers) && answers.some((item) => {
    const raw = String(item || '').trim();
    return /^PDK-?\d{4}$/i.test(raw) || /^\d{4}$/.test(raw);
  });
}

export function inspectItem(runId, index) {
  const seed = inspectSeedFromRunId(runId);
  const invoiceNum = 1000 + ((seed + index * 137) % 9000);
  const mismatchA = seed % 5;
  const mismatchB = (seed + 2) % 5;
  const mismatch = index === mismatchA || index === mismatchB;
  const targetNum = mismatch ? 1000 + ((invoiceNum - 1000 + 17) % 9000) : invoiceNum;
  return {
    index: index + 1,
    invoiceCode: `PDK-${String(invoiceNum).padStart(4, '0')}`,
    targetCode: `PDK-${String(targetNum).padStart(4, '0')}`,
    match: !mismatch,
    expectedChoice: mismatch ? 'no' : 'yes'
  };
}

export function inspectBundleItems(runId) {
  return Array.from({ length: INSPECT_TOTAL }, (_, index) => inspectItem(runId, index));
}

export function gradeInspectAnswers(runId, answers) {
  const items = inspectBundleItems(runId);
  if (!Array.isArray(answers) || answers.length !== INSPECT_TOTAL) {
    return { ok: false, reason: 'count', items };
  }
  if (answersLookLikeLabels(answers)) {
    for (let i = 0; i < INSPECT_TOTAL; i += 1) {
      if (normalizeTypedLabel(answers[i]) !== normalizeTypedLabel(items[i].targetCode)) {
        return { ok: false, reason: 'mismatch', index: i, items };
      }
    }
    return { ok: true, items };
  }
  for (let i = 0; i < INSPECT_TOTAL; i += 1) {
    const choice = normalizeInspectChoice(answers[i]);
    if (choice !== items[i].expectedChoice) {
      return { ok: false, reason: 'mismatch', index: i, items };
    }
  }
  return { ok: true, items };
}
