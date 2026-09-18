// 라인 찾기 노출. 운영자 배정 칸은 사다리·초고액 숨김을 건너뛴다.

export const STAKE_LADDER = [30000, 50000, 70000, 100000, 300000, 500000, 1000000, 3000000, 5000000, 10000000, 30000000, 100000000];
export const ULTRA_STAKE = 30000000;

export function assignedNodeIdSet(assignments) {
  return new Set(
    (assignments || [])
      .map((row) => String(row?.node_id || row?.nodeId || ''))
      .filter(Boolean)
  );
}

export function isAssignedNode(node, assignedIds = new Set()) {
  if (!node) return false;
  if (node.assigned) return true;
  return assignedIds.has(String(node.id || ''));
}

export function isUltraCatalogNode(node, stake = 0) {
  return Boolean(node?.requiresAssign || node?.tierBand === '초고액' || Number(stake) >= ULTRA_STAKE);
}

export function memberCatalogVisible(node, options = {}) {
  if (!node) return false;
  const work = Number(options.work || 0);
  const support = Number(options.support || 0);
  const trialDone = Boolean(options.trialDone);
  const maxDone = Number(options.maxDone || 0);
  const stake = Number(options.stake || 0);
  const ladder = Array.isArray(options.ladder) && options.ladder.length ? options.ladder : STAKE_LADDER;
  const assignedIds = options.assignedIds instanceof Set ? options.assignedIds : assignedNodeIdSet(options.assignments);
  if (isAssignedNode(node, assignedIds)) return true;
  if (node.enabled === false) return false;
  if (isUltraCatalogNode(node, stake)) return false;
  if (node.isTrial) return !trialDone && support > 0;
  if (work >= stake) return true;
  if (stake <= 100000) return true;
  const prev = ladder.filter((item) => item < stake).pop() || 0;
  return maxDone >= prev || work >= prev;
}

export function sortMemberCatalog(left, right, assignedIds, stakeOf) {
  const assignedDelta = Number(isAssignedNode(right, assignedIds)) - Number(isAssignedNode(left, assignedIds));
  if (assignedDelta) return assignedDelta;
  const trialDelta = Number(Boolean(right?.isTrial)) - Number(Boolean(left?.isTrial));
  if (trialDelta) return trialDelta;
  const stakeFn = typeof stakeOf === 'function' ? stakeOf : (node) => Number(node?.stake || 0);
  return stakeFn(left) - stakeFn(right);
}
