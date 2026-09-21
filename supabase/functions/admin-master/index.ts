import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

type JsonRecord = Record<string, any>;

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const PHASE5_URL = `${SUPABASE_URL}/functions/v1/admin-phase5`;
const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

class HttpError extends Error {
  status: number;
  code?: string;
  constructor(status: number, message: string, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function corsHeaders(req: Request) {
  const configured = (Deno.env.get('PUTDUK_ALLOWED_ORIGINS') || '*')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  const origin = req.headers.get('origin') || '';
  const allowOrigin = configured.includes('*')
    ? '*'
    : configured.includes(origin)
      ? origin
      : configured[0] || 'null';
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin'
  };
}

function json(req: Request, body: JsonRecord, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json; charset=utf-8' }
  });
}

async function payloadOf(req: Request) {
  try {
    const body = await req.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('invalid');
    return body as JsonRecord;
  } catch {
    throw new HttpError(400, '요청 형식을 확인해 주세요.');
  }
}

function verifiedUserId(req: Request) {
  const raw = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  const parts = raw.split('.');
  if (parts.length !== 3) throw new HttpError(401, '운영자 로그인이 필요합니다.');
  try {
    const normalized = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized + '='.repeat((4 - normalized.length % 4) % 4);
    const data = JSON.parse(atob(padded));
    const sub = String(data?.sub || '');
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(sub)) throw new Error('sub');
    return sub;
  } catch {
    throw new HttpError(401, '운영자 로그인이 필요합니다.');
  }
}

function text(value: unknown, label: string, max = 500, required = true) {
  const result = String(value ?? '').trim();
  if (required && !result) throw new HttpError(400, `${label}을(를) 입력해 주세요.`);
  if (result.length > max) throw new HttpError(400, `${label}이(가) 너무 깁니다.`);
  return result || null;
}

function uuid(value: unknown, label: string) {
  const result = String(value || '').trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(result)) {
    throw new HttpError(400, `${label}을(를) 확인해 주세요.`);
  }
  return result;
}

function amount(value: unknown, label: string) {
  const n = Number(value ?? 0);
  if (!Number.isSafeInteger(n) || n < 0) throw new HttpError(400, `${label}은 0 이상의 정수로 입력해 주세요.`);
  return n;
}

function optionalDate(value: unknown, label: string) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) throw new HttpError(400, `${label}을(를) 확인해 주세요.`);
  return d.toISOString();
}

async function requireMasterRole(userId: string) {
  const { data, error } = await admin.rpc('putduk_admin_has_role', { p_user_id: userId, p_roles: ['super_admin'] });
  if (error) throw new HttpError(503, '운영자 권한을 확인하지 못했습니다.');
  if (data !== true) throw new HttpError(403, '이 메뉴를 사용할 권한이 없습니다.');
}

async function appendAudit(userId: string, action: string, targetType: string, targetId: string | null, reason: string | null, before: unknown, after: unknown) {
  const { error } = await admin.rpc('putduk_admin_append_audit', {
    p_admin_id: userId,
    p_action: action,
    p_target_type: targetType,
    p_target_id: targetId,
    p_reason: reason,
    p_before: before ?? null,
    p_after: after ?? null
  });
  if (error) console.error('admin master audit failed', error);
}

async function listMasterOps(userId: string) {
  await requireMasterRole(userId);
  const [funding, allocations, contents, audits, evidence] = await Promise.all([
    admin.schema('private').from('partner_funding_pools').select('*').order('updated_at', { ascending: false }).limit(500),
    admin.schema('private').from('partner_budget_allocations').select('*').order('updated_at', { ascending: false }).limit(1000),
    admin.schema('private').from('admin_content_items').select('*').order('content_type').order('sort_order').order('updated_at', { ascending: false }).limit(500),
    admin.schema('private').from('admin_audit_logs').select('id,admin_id,action,target_type,target_id,reason,created_at').order('created_at', { ascending: false }).limit(200),
    admin.schema('private').from('brand_verification_records').select('id,partner_brand_id,source_kind,evidence_path,notes,verified_by,verified_at,created_at').order('created_at', { ascending: false }).limit(500)
  ]);
  const error = funding.error || allocations.error || contents.error || audits.error || evidence.error;
  if (error) {
    console.error('admin master list failed', error);
    throw new HttpError(503, '운영 설정을 불러오지 못했습니다.');
  }
  return {
    funding_pools: funding.data || [],
    funding_allocations: allocations.data || [],
    content_items: contents.data || [],
    audit_logs: audits.data || [],
    partner_evidence: evidence.data || []
  };
}

async function savePartner(userId: string, payload: JsonRecord) {
  await requireMasterRole(userId);
  const id = payload.id || payload.brand_id ? uuid(payload.id || payload.brand_id, '협력사') : null;
  const patch: JsonRecord = {
    display_name_ko: text(payload.display_name_ko || payload.company_name, '회사명', 120),
    legal_name: text(payload.legal_name, '법인명', 160),
    category: text(payload.category, '분야', 80),
    description_ko: text(payload.description_ko || payload.description, '회사 소개', 1000, false),
    verification_note: text(payload.verification_note, '협력 확인 메모', 500, false),
    updated_at: new Date().toISOString()
  };
  if (payload.logo_asset_path) patch.logo_asset_path = text(payload.logo_asset_path, '로고', 500);
  if (payload.photo_asset_path) patch.photo_asset_path = text(payload.photo_asset_path, '대표 사진', 500);

  let before: JsonRecord | null = null;
  let result;
  if (id) {
    const old = await admin.from('partner_brands').select('*').eq('id', id).maybeSingle();
    if (old.error || !old.data) throw new HttpError(404, '협력사를 찾을 수 없습니다.');
    before = old.data;
    result = await admin.from('partner_brands').update(patch).eq('id', id).select('*').single();
  } else {
    const slug = `partner-${crypto.randomUUID().slice(0, 12)}`;
    result = await admin.from('partner_brands').insert({
      ...patch,
      slug,
      verification_status: 'pending',
      logo_usage_status: 'not_submitted',
      published: false
    }).select('*').single();
  }
  if (result.error || !result.data) throw new HttpError(400, String(result.error?.message || '협력사 정보를 저장하지 못했습니다.'));
  const evidencePath = text(payload.verification_evidence_path, '협력 확인 자료', 500, false);
  const operatorNote = text(payload.operator_note, '운영 메모', 1000, false);
  if (evidencePath || operatorNote) {
    const evidence = await admin.schema('private').from('brand_verification_records').insert({
      partner_brand_id: result.data.id,
      source_kind: 'operator',
      evidence_path: evidencePath,
      notes: operatorNote || text(payload.verification_note, '협력 확인 메모', 500, false),
      verified_by: userId,
      verified_at: new Date().toISOString()
    });
    if (evidence.error) throw new HttpError(400, String(evidence.error.message || '협력 확인 자료를 저장하지 못했습니다.'));
  }
  await appendAudit(userId, id ? '협력사 정보 수정' : '협력사 등록', 'partner_brand', result.data.id, text(payload.reason, '변경 사유', 240, false), before, { partner: result.data, evidence_path: evidencePath ? 'stored' : null });
  return { partner: result.data };
}

async function saveFunding(userId: string, payload: JsonRecord) {
  await requireMasterRole(userId);
  const id = payload.id ? uuid(payload.id, '지급예산') : null;
  const partnerBrandId = uuid(payload.partner_brand_id, '협력사');
  const totalBudget = amount(payload.total_budget, '총 업무예산');
  const securedAmount = amount(payload.secured_amount, '실제 확보 금액');
  if (securedAmount > totalBudget) throw new HttpError(400, '실제 확보 금액은 총 업무예산보다 클 수 없습니다.');
  const verificationStatus = String(payload.verification_status || 'pending');
  if (!['pending','verified','rejected'].includes(verificationStatus)) throw new HttpError(400, '확인 상태를 선택해 주세요.');
  const startsAt = optionalDate(payload.starts_at, '시작일');
  const endsAt = optionalDate(payload.ends_at, '종료일');
  if (startsAt && endsAt && Date.parse(endsAt) <= Date.parse(startsAt)) throw new HttpError(400, '종료일은 시작일 이후여야 합니다.');
  const patch = {
    partner_brand_id: partnerBrandId,
    total_budget: totalBudget,
    secured_amount: securedAmount,
    verification_status: verificationStatus,
    public_visible: payload.public_visible === true,
    starts_at: startsAt,
    ends_at: endsAt,
    operator_note: text(payload.operator_note, '운영 메모', 1000, false),
    updated_by: userId,
    updated_at: new Date().toISOString()
  };

  let before: JsonRecord | null = null;
  let saved;
  if (id) {
    const old = await admin.schema('private').from('partner_funding_pools').select('*').eq('id', id).maybeSingle();
    if (old.error || !old.data) throw new HttpError(404, '지급예산을 찾을 수 없습니다.');
    before = old.data;
    saved = await admin.schema('private').from('partner_funding_pools').update(patch).eq('id', id).select('*').single();
  } else {
    saved = await admin.schema('private').from('partner_funding_pools').insert({ ...patch, created_by: userId }).select('*').single();
  }
  if (saved.error || !saved.data) throw new HttpError(400, String(saved.error?.message || '지급예산을 저장하지 못했습니다.'));
  const allocations = Array.isArray(payload.allocations) ? payload.allocations : [];
  for (const item of allocations) {
    const nodeId = uuid(item.node_id, '업무');
    const allocated = amount(item.allocated_amount, '업무 배정 금액');
    const spent = amount(item.spent_amount, '이미 사용한 금액');
    const reserved = amount(item.reserved_amount, '진행 중 예약 금액');
    if (spent + reserved > allocated) throw new HttpError(400, '사용 금액과 예약 금액의 합은 업무 배정 금액보다 클 수 없습니다.');
    const row = {
      funding_pool_id: saved.data.id,
      node_id: nodeId,
      allocated_amount: allocated,
      spent_amount: spent,
      reserved_amount: reserved,
      updated_by: userId,
      updated_at: new Date().toISOString()
    };
    const upsert = await admin.schema('private').from('partner_budget_allocations').upsert(row, { onConflict: 'funding_pool_id,node_id' }).select('*').single();
    if (upsert.error || !upsert.data) throw new HttpError(400, String(upsert.error?.message || '업무별 예산을 저장하지 못했습니다.'));
  }

  const allocationRows = await admin.schema('private').from('partner_budget_allocations').select('*').eq('funding_pool_id', saved.data.id);
  if (allocationRows.error) throw new HttpError(503, '업무별 예산을 다시 확인하지 못했습니다.');
  const snapshot = { pool: saved.data, allocations: allocationRows.data || [] };
  await admin.schema('private').from('partner_budget_ledger').insert({
    funding_pool_id: saved.data.id,
    event_type: id ? 'updated' : 'created',
    amount: securedAmount,
    note: text(payload.reason, '변경 사유', 240, false),
    actor_id: userId,
    snapshot
  });
  await appendAudit(userId, id ? '지급예산 수정' : '지급예산 등록', 'partner_funding_pool', saved.data.id, text(payload.reason, '변경 사유', 240, false), before, snapshot);
  return { funding_pool: saved.data, allocations: allocationRows.data || [] };
}

async function saveAdminContent(userId: string, payload: JsonRecord) {
  await requireMasterRole(userId);
  const id = payload.id ? uuid(payload.id, '운영 콘텐츠') : null;
  const contentType = String(payload.content_type || '');
  if (!['onboarding','faq','notification_template'].includes(contentType)) throw new HttpError(400, '콘텐츠 종류를 확인해 주세요.');
  const patch = {
    content_type: contentType,
    title_ko: text(payload.title_ko || payload.title, '제목', 120),
    body_ko: text(payload.body_ko || payload.body, '내용', 2000),
    audience: payload.audience === 'all' ? 'all' : 'member',
    sort_order: Math.max(0, Math.min(10000, Number(payload.sort_order || 0) || 0)),
    enabled: payload.enabled !== false,
    updated_by: userId,
    updated_at: new Date().toISOString()
  };
  let before: JsonRecord | null = null;
  let saved;
  if (id) {
    const old = await admin.schema('private').from('admin_content_items').select('*').eq('id', id).maybeSingle();
    if (old.error || !old.data) throw new HttpError(404, '운영 콘텐츠를 찾을 수 없습니다.');
    before = old.data;
    saved = await admin.schema('private').from('admin_content_items').update(patch).eq('id', id).select('*').single();
  } else {
    saved = await admin.schema('private').from('admin_content_items').insert({ ...patch, created_by: userId }).select('*').single();
  }
  if (saved.error || !saved.data) throw new HttpError(400, String(saved.error?.message || '운영 콘텐츠를 저장하지 못했습니다.'));
  await appendAudit(userId, id ? '운영 콘텐츠 수정' : '운영 콘텐츠 등록', 'admin_content_item', saved.data.id, text(payload.reason, '변경 사유', 240, false), before, saved.data);
  return { content_item: saved.data };
}

async function setAdminContentEnabled(userId: string, payload: JsonRecord) {
  await requireMasterRole(userId);
  const id = uuid(payload.id, '운영 콘텐츠');
  const old = await admin.schema('private').from('admin_content_items').select('*').eq('id', id).maybeSingle();
  if (old.error || !old.data) throw new HttpError(404, '운영 콘텐츠를 찾을 수 없습니다.');
  const saved = await admin.schema('private').from('admin_content_items').update({ enabled: payload.enabled === true, updated_by: userId, updated_at: new Date().toISOString() }).eq('id', id).select('*').single();
  if (saved.error || !saved.data) throw new HttpError(400, '표시 상태를 저장하지 못했습니다.');
  await appendAudit(userId, payload.enabled === true ? '운영 콘텐츠 표시' : '운영 콘텐츠 숨김', 'admin_content_item', id, null, old.data, saved.data);
  return { content_item: saved.data };
}

async function uploadPublicAsset(userId: string, payload: JsonRecord) {
  await requireMasterRole(userId);
  const kind = String(payload.kind || 'partner').replace(/[^a-z0-9_-]/gi, '').slice(0, 40) || 'partner';
  const mime = String(payload.content_type || '').toLowerCase();
  const allowed = new Map([['image/jpeg','jpg'],['image/png','png'],['image/webp','webp']]);
  const ext = allowed.get(mime);
  if (!ext) throw new HttpError(400, 'JPG, PNG, WEBP 이미지만 올릴 수 있습니다.');
  const raw = String(payload.base64 || '').replace(/^data:[^;]+;base64,/, '');
  if (!raw) throw new HttpError(400, '업로드할 파일을 선택해 주세요.');
  let bytes: Uint8Array;
  try {
    const binary = atob(raw);
    if (binary.length > 10 * 1024 * 1024) throw new HttpError(400, '파일은 10MB 이하만 올릴 수 있습니다.');
    bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(400, '파일을 읽지 못했습니다.');
  }
  const path = `admin-assets/${kind}/${crypto.randomUUID()}.${ext}`;
  const uploaded = await admin.storage.from('putduk-public-assets').upload(path, bytes, { contentType: mime, upsert: false, cacheControl: '3600' });
  if (uploaded.error) throw new HttpError(400, String(uploaded.error.message || '파일을 올리지 못했습니다.'));
  const publicUrl = admin.storage.from('putduk-public-assets').getPublicUrl(path).data.publicUrl;
  await appendAudit(userId, '운영 이미지 업로드', 'public_asset', null, null, null, { path, kind });
  return { path: publicUrl, storage_path: path };
}


async function uploadPartnerEvidence(userId: string, payload: JsonRecord) {
  await requireMasterRole(userId);
  const mime = String(payload.content_type || '').toLowerCase();
  const allowed = new Map([['image/jpeg','jpg'],['image/png','png'],['image/webp','webp'],['application/pdf','pdf']]);
  const ext = allowed.get(mime);
  if (!ext) throw new HttpError(400, 'JPG, PNG, WEBP, PDF 파일만 올릴 수 있습니다.');
  const raw = String(payload.base64 || '').replace(/^data:[^;]+;base64,/, '');
  if (!raw) throw new HttpError(400, '업로드할 파일을 선택해 주세요.');
  let bytes: Uint8Array;
  try {
    const binary = atob(raw);
    if (binary.length > 10 * 1024 * 1024) throw new HttpError(400, '파일은 10MB 이하만 올릴 수 있습니다.');
    bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(400, '파일을 읽지 못했습니다.');
  }
  const path = `partner-evidence/${crypto.randomUUID()}.${ext}`;
  const uploaded = await admin.storage.from('putduk-private').upload(path, bytes, { contentType: mime, upsert: false, cacheControl: '3600' });
  if (uploaded.error) throw new HttpError(400, String(uploaded.error.message || '확인 자료를 올리지 못했습니다.'));
  await appendAudit(userId, '협력 확인 자료 업로드', 'partner_evidence', null, null, null, { path });
  return { storage_path: path };
}

async function proxyPhase5(req: Request, payload: JsonRecord) {
  const res = await fetch(PHASE5_URL, {
    method: 'POST',
    headers: {
      'Authorization': req.headers.get('authorization') || '',
      'apikey': req.headers.get('apikey') || SERVICE_ROLE_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });
  const raw = await res.text();
  let body: JsonRecord;
  try { body = JSON.parse(raw); } catch { body = { ok: false, error: '운영 요청을 처리하지 못했습니다.' }; }
  return { status: res.status, body };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(req) });
  if (req.method !== 'POST') return json(req, { ok: false, error: '지원하지 않는 요청입니다.' }, 405);
  try {
    const userId = verifiedUserId(req);
    const payload = await payloadOf(req);
    const action = String(payload.action || 'catalog');

    if (action === 'list_master_ops') return json(req, { ok: true, ...(await listMasterOps(userId)) });
    if (action === 'save_partner') return json(req, { ok: true, ...(await savePartner(userId, payload)) });
    if (action === 'save_funding') return json(req, { ok: true, ...(await saveFunding(userId, payload)) });
    if (action === 'save_admin_content') return json(req, { ok: true, ...(await saveAdminContent(userId, payload)) });
    if (action === 'set_admin_content_enabled') return json(req, { ok: true, ...(await setAdminContentEnabled(userId, payload)) });
    if (action === 'upload_public_asset') return json(req, { ok: true, ...(await uploadPublicAsset(userId, payload)) });
    if (action === 'upload_partner_evidence') return json(req, { ok: true, ...(await uploadPartnerEvidence(userId, payload)) });

    const proxied = await proxyPhase5(req, payload);
    return json(req, proxied.body, proxied.status);
  } catch (error) {
    if (error instanceof HttpError) return json(req, { ok: false, error: error.message, code: error.code }, error.status);
    console.error('admin-master error', error);
    return json(req, { ok: false, error: '운영 요청을 처리하지 못했습니다.' }, 500);
  }
});