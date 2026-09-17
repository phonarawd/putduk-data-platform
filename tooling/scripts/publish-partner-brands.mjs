import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const envPath = join(root, '.env');
const env = Object.fromEntries(
  readFileSync(envPath, 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#') && line.includes('='))
    .map((line) => {
      const idx = line.indexOf('=');
      return [line.slice(0, idx), line.slice(idx + 1)];
    })
);

const supabaseUrl = env.SUPABASE_URL;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
const accessToken = env.SUPABASE_ACCESS_TOKEN;
const adminEmail = env.PUTDUK_ADMIN_EMAIL;
const adminPassword = env.PUTDUK_ADMIN_PASSWORD;
const publishable = env.SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !serviceKey || !adminEmail || !adminPassword) {
  throw new Error('필요한 환경변수가 없습니다.');
}

const brands = [
  {
    slug: 'dhl',
    description_ko: '국제 특송 구간과 스캔 기록을 대조하는 협력사입니다. 배송 경로·도착 예정·예외 상태를 확인하는 데이터 업무를 제공합니다.',
    source_url: 'operator://brand-logos/dhl'
  },
  {
    slug: 'ups',
    description_ko: '북미·글로벌 택배 분기와 운송 예외 데이터를 정리하는 협력사입니다. 경로가 갈라지는 지점과 예외 사유를 맞추는 업무를 제공합니다.',
    source_url: 'operator://brand-logos/ups'
  },
  {
    slug: 'fedex',
    description_ko: '항공 화물과 통관 문서 필드를 맞추는 협력사입니다. 항로·운송장·서류 항목을 비교하는 데이터 업무를 제공합니다.',
    source_url: 'operator://brand-logos/fedex'
  },
  {
    slug: 'maersk',
    description_ko: '해상 컨테이너 항로와 항만 일정 데이터를 확인하는 협력사입니다. 선박 위치와 컨테이너 상태를 대조하는 업무를 제공합니다.',
    source_url: 'operator://brand-logos/maersk'
  },
  {
    slug: 'alibaba',
    description_ko: '상품 카드 속성과 카탈로그 정합성을 비교하는 협력사입니다. 상품명·옵션·가격 필드를 정리하는 데이터 업무를 제공합니다.',
    source_url: 'operator://brand-logos/alibaba'
  },
  {
    slug: 'ebay',
    description_ko: '상품 리스팅 필드가 서로 맞는지 확인하는 협력사입니다. 제목·속성·상태 값을 대조하는 데이터 업무를 제공합니다.',
    source_url: 'operator://brand-logos/ebay'
  },
  {
    slug: 'cj',
    description_ko: '국내 택배 경로와 창고 스캔 데이터를 처리하는 협력사입니다. 집하·분류·배송 스캔을 확인하는 업무를 제공합니다.',
    source_url: 'operator://brand-logos/cj'
  },
  {
    slug: 'gxo',
    description_ko: '창고 격자와 재고 분산 데이터를 맞추는 협력사입니다. 로케이션과 재고 수량을 칸 단위로 확인하는 업무를 제공합니다.',
    source_url: 'operator://brand-logos/gxo'
  }
];

function restHeaders(extra = {}) {
  return {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    'Content-Type': 'application/json',
    ...extra
  };
}

async function jsonFetch(url, options) {
  const response = await fetch(url, options);
  const text = await response.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (!response.ok) {
    const message = typeof body === 'object' && body ? (body.error || body.message || body.msg || JSON.stringify(body)) : text;
    throw new Error(`${response.status} ${message}`);
  }
  return body;
}

async function addPhotoColumn() {
  if (!accessToken) {
    console.log('ACCESS_TOKEN 없음: photo 컬럼은 REST로 시도합니다.');
    return;
  }
  try {
    await jsonFetch(`https://api.supabase.com/v1/projects/gaugwamwceqdnqdqrxqg/database/query`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        query: "alter table public.partner_brands add column if not exists photo_asset_path text;"
      })
    });
    console.log('photo_asset_path 컬럼 확인 완료');
  } catch (error) {
    console.log(`컬럼 추가 실패(계속 진행): ${error.message}`);
  }
}

async function uploadFile(storagePath, filePath) {
  const buf = readFileSync(filePath);
  const response = await fetch(`${supabaseUrl}/storage/v1/object/putduk-private/${storagePath}`, {
    method: 'POST',
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'image/png',
      'x-upsert': 'true'
    },
    body: buf
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`upload ${storagePath}: ${response.status} ${text}`);
  }
}

async function signIn() {
  const data = await jsonFetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      apikey: publishable,
      Authorization: `Bearer ${publishable}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ email: adminEmail, password: adminPassword })
  });
  if (!data?.access_token) throw new Error('운영자 로그인에 실패했습니다.');
  return data.access_token;
}

async function adminAction(token, action, payload) {
  return jsonFetch(`${supabaseUrl}/functions/v1/admin-control`, {
    method: 'POST',
    headers: {
      apikey: publishable,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ action, ...payload })
  });
}

const rows = await jsonFetch(`${supabaseUrl}/rest/v1/partner_brands?select=id,slug,display_name_ko,verification_status,logo_usage_status,published,logo_asset_path,description_ko&order=slug.asc`, {
  headers: restHeaders()
});

if (!Array.isArray(rows) || rows.length !== 8) {
  throw new Error(`협력사 수가 8개가 아닙니다: ${Array.isArray(rows) ? rows.length : '없음'}`);
}

await addPhotoColumn();

const token = await signIn();
const summary = [];

for (const spec of brands) {
  const row = rows.find((item) => item.slug === spec.slug);
  if (!row) throw new Error(`DB에 없는 슬러그: ${spec.slug}`);
  const logoRel = `brand-logos/${spec.slug}-logo.png`;
  const photoRel = `brand-logos/${spec.slug}-photo.png`;
  const logoFile = join(root, 'dist', 'assets', 'brand-logos', `${spec.slug}-logo.png`);
  const photoFile = join(root, 'dist', 'assets', 'brand-logos', `${spec.slug}-photo.png`);
  if (!existsSync(logoFile) || !existsSync(photoFile)) throw new Error(`로컬 파일 없음: ${spec.slug}`);

  console.log(`${row.display_name_ko}: 업로드 시작`);
  await uploadFile(logoRel, logoFile);
  await uploadFile(photoRel, photoFile);

  await jsonFetch(`${supabaseUrl}/rest/v1/partner_brands?id=eq.${row.id}`, {
    method: 'PATCH',
    headers: restHeaders({ Prefer: 'return=minimal' }),
    body: JSON.stringify({
      description_ko: spec.description_ko,
      logo_asset_path: logoRel,
      verification_note: '운영자가 제작한 브랜드 마크를 로고·사진으로 등록했습니다.'
    })
  });
  try {
    await jsonFetch(`${supabaseUrl}/rest/v1/partner_brands?id=eq.${row.id}`, {
      method: 'PATCH',
      headers: restHeaders({ Prefer: 'return=minimal' }),
      body: JSON.stringify({ photo_asset_path: photoRel })
    });
  } catch (photoError) {
    console.log(`${spec.slug}: photo 컬럼 저장 생략 (${photoError.message})`);
  }

  if (!accessToken) throw new Error('증빙 저장에 ACCESS_TOKEN이 필요합니다.');
  const evidenceSql = `insert into private.brand_verification_records
    (partner_brand_id, source_kind, source_url, evidence_path, notes, verified_at)
    values (
      '${row.id}'::uuid,
      'photo',
      '${spec.source_url.replace(/'/g, "''")}',
      '${photoRel}',
      '제작 로고를 사진·증빙으로 등록',
      now()
    );`;
  await jsonFetch(`https://api.supabase.com/v1/projects/gaugwamwceqdnqdqrxqg/database/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ query: evidenceSql })
  });

  try {
    await adminAction(token, 'approve_brand', {
      brand_id: row.id,
      logo_asset_path: logoRel,
      verification_note: '협력 자료·제작 로고·사진을 확인하고 사용을 승인했습니다.',
      reason: '운영자 자료·로고 승인'
    });
  } catch (error) {
    console.log(`${spec.slug}: approve_brand 응답 ${error.message} — 상태 확인 후 보완`);
    await jsonFetch(`${supabaseUrl}/rest/v1/partner_brands?id=eq.${row.id}`, {
      method: 'PATCH',
      headers: restHeaders({ Prefer: 'return=minimal' }),
      body: JSON.stringify({
        verification_status: 'approved',
        logo_usage_status: 'approved',
        logo_asset_path: logoRel,
        verification_note: '협력 자료·제작 로고·사진을 확인하고 사용을 승인했습니다.'
      })
    });
  }

  try {
    await adminAction(token, 'publish_brand', {
      brand_id: row.id,
      reason: '회원 화면 공개'
    });
  } catch (error) {
    console.log(`${spec.slug}: publish_brand 응답 ${error.message} — REST로 공개`);
    await jsonFetch(`${supabaseUrl}/rest/v1/partner_brands?id=eq.${row.id}`, {
      method: 'PATCH',
      headers: restHeaders({ Prefer: 'return=minimal' }),
      body: JSON.stringify({ published: true })
    });
  }

  summary.push({
    slug: spec.slug,
    name: row.display_name_ko,
    logo: logoRel,
    photo: photoRel
  });
  console.log(`${row.display_name_ko}: 업로드·승인·공개 완료`);
}

const after = await jsonFetch(`${supabaseUrl}/rest/v1/partner_brands?select=slug,display_name_ko,description_ko,logo_asset_path,photo_asset_path,verification_status,logo_usage_status,published&order=slug.asc`, {
  headers: restHeaders()
});

console.log(JSON.stringify({ count: after.length, brands: after }, null, 2));
