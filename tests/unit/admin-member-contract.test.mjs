import fs from 'node:fs';
import assert from 'node:assert/strict';

const source = fs.readFileSync(new URL('../../dist/admin/admin-member-contract.js', import.meta.url), 'utf8');
const index = fs.readFileSync(new URL('../../dist/admin/index.html', import.meta.url), 'utf8');

const tests = [
  ['100건 단위 페이지 순회', () => assert.match(source, /const PAGE_SIZE = 100;[\s\S]*limit: PAGE_SIZE,[\s\S]*offset/)],
  ['페이지가 가득 차면 다음 offset 조회', () => assert.match(source, /for \(let offset = 0; offset < MAX_ROWS; offset \+= PAGE_SIZE\)/)],
  ['전체 검색 결과 수를 total로 사용', () => assert.match(source, /adminMemberTotal: all\.length/)],
  ['상태 필터는 전체 검색 결과를 받은 뒤 적용', () => assert.match(source, /filter === 'all' \? all : all\.filter/)],
  ['필터·검색 이벤트를 capture 단계에서 고정', () => {
    assert.match(source, /\[data-member-filter\], \[data-action=\"refresh-members\"\]/);
    assert.match(source, /event\.target\?\.id !== 'memberSearchForm'/);
    assert.ok((source.match(/stopImmediatePropagation\(\)/g) || []).length >= 2);
  }],
  ['실제 enum withdrawn을 탈퇴로 표시', () => {
    assert.match(source, /button\.dataset\.memberFilter = 'withdrawn'/);
    assert.match(source, /pill\.textContent = '탈퇴'/);
  }],
  ['PII 원문 복원 로직을 추가하지 않음', () => {
    for (const forbidden of ['email_snapshot', 'birth_date', 'last_login_ip =', 'legal_name =']) assert.ok(!source.includes(forbidden));
  }],
  ['모바일/필터 주요 조작 44px', () => assert.match(source, /minHeight = '44px'/)],
  ['admin index에서 guard 로드', () => assert.match(index, /admin-member-contract\.js\?v=20260920-p2member1/)]
];

let passed = 0;
for (const [name, run] of tests) {
  run();
  passed += 1;
  console.log(`PASS ${name}`);
}
console.log(`PASS ${passed}\/${tests.length}`);
