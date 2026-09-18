// KYC 업로드 클라이언트·서버 공통 검증 (테스트·Edge 동기화)

export const KYC_ID_ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);
export const KYC_SELFIE_ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
export const KYC_MAX_BYTES = 10 * 1024 * 1024;

export function normalizeKycDocumentKind(value) {
  const kind = String(value || '').trim().toLowerCase();
  if (['identity_front', 'front', 'kyc_front'].includes(kind)) return 'identity_front';
  if (['identity_back', 'back', 'kyc_back'].includes(kind)) return 'identity_back';
  if (['selfie', 'kyc_selfie'].includes(kind)) return 'selfie';
  return kind;
}

export function validateKycUploadFile(file, documentKind) {
  const kind = normalizeKycDocumentKind(documentKind);
  const type = String(file?.type || '').toLowerCase();
  const size = Number(file?.size);
  const allowed = kind === 'selfie' ? KYC_SELFIE_ALLOWED_TYPES : KYC_ID_ALLOWED_TYPES;

  if (!file || !Number.isFinite(size) || size <= 0) {
    return { ok: false, message: '파일을 선택해 주세요.' };
  }
  if (size > KYC_MAX_BYTES) {
    return { ok: false, message: '파일은 10MB 이하만 올릴 수 있어요.' };
  }
  if (!allowed.has(type)) {
    if (kind === 'selfie' && type === 'application/pdf') {
      return { ok: false, message: '셀카는 JPG, PNG, WEBP만 올릴 수 있어요.' };
    }
    return { ok: false, message: 'JPG, PNG, WEBP, PDF만 올릴 수 있어요.' };
  }
  return { ok: true, kind };
}

export function isKycBusyForm(form) {
  return form?.dataset?.kycBusy === '1';
}

export function setKycFormBusy(form, busy, label = '검수 요청') {
  if (!form) return;
  form.dataset.kycBusy = busy ? '1' : '0';
  const button = form.querySelector('button[type="submit"]');
  if (!button) return;
  if (!button.dataset.kycLabel) button.dataset.kycLabel = button.textContent || label;
  button.disabled = busy;
  button.textContent = busy ? '자료 올리는 중…' : button.dataset.kycLabel;
}

export function isKycPathForDocumentKind(userId, path, documentKind) {
  const candidate = String(path || '').trim();
  const kind = normalizeKycDocumentKind(documentKind);
  if (!['identity_front', 'identity_back', 'selfie'].includes(kind)) return false;
  if (!candidate || candidate.includes('..') || candidate.startsWith('/') || candidate.includes('\\')) return false;
  const parts = candidate.split('/').filter(Boolean);
  if (parts.length < 4 || parts[0] !== 'kyc' || parts[1] !== String(userId || '').trim()) return false;
  return parts[2] === kind;
}

// submitKycForm busy guard·업로드 순서를 테스트·런타임에서 동일하게 재현한다.
export async function runGuardedKycSubmit(form, { uploadKind, submitKyc }) {
  if (isKycBusyForm(form)) return { ok: false, skipped: true, submitCalls: 0, uploadCalls: 0 };
  setKycFormBusy(form, true);
  let uploadCalls = 0;
  let submitCalls = 0;
  try {
    const frontPath = await uploadKind('identity_front');
    uploadCalls += 1;
    const backPath = await uploadKind('identity_back');
    uploadCalls += 1;
    const selfiePath = await uploadKind('selfie');
    uploadCalls += 1;
    if (![frontPath, backPath, selfiePath].every((path) => String(path || '').trim())) {
      throw new Error('본인확인 파일 경로를 확인해 주세요.');
    }
    await submitKyc({ front_path: frontPath, back_path: backPath, selfie_path: selfiePath });
    submitCalls += 1;
    return { ok: true, skipped: false, submitCalls, uploadCalls };
  } catch (error) {
    return { ok: false, skipped: false, submitCalls, uploadCalls, error };
  } finally {
    setKycFormBusy(form, false);
  }
}
