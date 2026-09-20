import test from 'node:test';
import assert from 'node:assert/strict';
import {
  WORK_CONTRACT_VERSION,
  buildSubmission,
  compileWorkContract,
  compileWorkDefinition,
  defaultComponentRegistry,
  materializeComponentInstances,
  renderWorkStep,
  validateMemberSubmission
} from '../../src/work/engine.mjs';
import { catalogListingWorkDefinition, inspectBundleWorkDefinition } from '../../src/work/legacy-definitions.mjs';

test('범용 엔진은 등록된 공통 component와 versioned schema만 허용한다', () => {
  assert.deepEqual(defaultComponentRegistry.types(), ['text', 'digits', 'integer', 'boolean', 'choice']);
  const inspect = compileWorkDefinition(inspectBundleWorkDefinition);
  const catalog = compileWorkDefinition(catalogListingWorkDefinition);
  assert.equal(inspect.templateKey, 'inspect_bundle');
  assert.equal(catalog.templateKey, 'catalog_listing');
  assert.throws(() => compileWorkDefinition({ ...inspectBundleWorkDefinition, schema_version: 'putduk.work/9.9' }), /지원하지 않는 work schema/);
});

test('inspect 5건과 catalog 4칸이 같은 materialize/render API를 사용한다', () => {
  const inspect = compileWorkContract({
    contract: WORK_CONTRACT_VERSION,
    schema_version: inspectBundleWorkDefinition.schema_version,
    template_key: 'inspect_bundle',
    template_version: 1,
    task_run_id: '00000000-0000-4000-8000-000000000001',
    definition: inspectBundleWorkDefinition,
    items: Array.from({ length: 5 }, (_, index) => ({
      item_key: `inspect-${index + 1}`,
      step_key: 'inspect',
      ordinal: index + 1,
      payload: { invoice_code: `PDK-${1000 + index}`, target_code: `PDK-${1000 + index}` }
    }))
  });
  assert.equal(materializeComponentInstances(inspect).length, 5);
  assert.match(renderWorkStep(inspect, 'inspect'), /data-work-step="inspect"/);
  assert.match(renderWorkStep(inspect, 'inspect'), /inspect-5\.match/);

  const catalog = compileWorkContract({
    contract: WORK_CONTRACT_VERSION,
    schema_version: catalogListingWorkDefinition.schema_version,
    template_key: 'catalog_listing',
    template_version: 1,
    task_run_id: '00000000-0000-4000-8000-000000000002',
    definition: catalogListingWorkDefinition,
    items: [{ item_key: 'listing-1', step_key: 'listing', ordinal: 1, payload: {} }]
  });
  assert.equal(materializeComponentInstances(catalog).length, 4);
  assert.match(renderWorkStep(catalog, 'listing'), /listing-1\.product_name/);
  assert.match(renderWorkStep(catalog, 'listing'), /listing-1\.shipping/);
});

test('client validation은 형식만 확인하고 server expected 값은 노출하지 않는다', () => {
  const contract = compileWorkContract({
    contract: WORK_CONTRACT_VERSION,
    schema_version: catalogListingWorkDefinition.schema_version,
    template_key: 'catalog_listing',
    template_version: 1,
    task_run_id: '00000000-0000-4000-8000-000000000003',
    definition: catalogListingWorkDefinition,
    items: [{ item_key: 'listing-1', step_key: 'listing', ordinal: 1, payload: { product_name: '카드 표시값' } }]
  });
  const bad = validateMemberSubmission(contract, { 'listing-1': { product_name: '', price: '', option: '', shipping: '' } });
  assert.equal(bad.ok, false);
  assert.equal(bad.errors.length, 4);

  const good = buildSubmission(contract, {
    'listing-1': {
      product_name: '  무선   이어폰  ',
      price: '12,900원',
      option: ' 블랙 / 1개 ',
      shipping: '무료배송'
    }
  }, { now: new Date('2026-09-21T00:00:00.000Z'), metadata: { source: 'unit' } });
  assert.equal(good.ok, true);
  assert.equal(good.submission.answers['listing-1'].product_name, '무선 이어폰');
  assert.equal(good.submission.answers['listing-1'].price, '12900');
  assert.equal(good.submission.evidence['listing-1'].price.type, 'answer_snapshot');
  assert.equal(good.submission.metadata.source, 'unit');
  assert.equal(good.submission.metadata.submitted_at, '2026-09-21T00:00:00.000Z');
});

test('새 업무는 app.js 분기 없이 definition + registered component로 확장 가능하다', () => {
  const definition = {
    schema_version: 'putduk.work/1.0',
    template_key: 'quantity_check',
    template_version: 1,
    title_ko: '입고 수량 확인',
    purpose_ko: '발주 수량과 실입고 수량을 입력합니다.',
    components: [
      { key: 'ordered', type: 'integer', label_ko: '발주 수량', required: true, min: 0, max: 100000, validation: { mode: 'none' } },
      { key: 'received', type: 'integer', label_ko: '입고 수량', required: true, min: 0, max: 100000, validation: { mode: 'none' } }
    ],
    workflow: { mode: 'linear', steps: [{ key: 'count', repeat: 'items', component_keys: ['ordered', 'received'] }] },
    evidence: { model: 'answer_snapshot.v1' },
    submission: { contract: 'putduk.work_submission/1.0' },
    review: { contract: 'putduk.review/1.0' },
    settlement: { contract: 'putduk.stake_stipend/1.0' }
  };
  const compiled = compileWorkDefinition(definition);
  assert.equal(compiled.templateKey, 'quantity_check');
  assert.equal(compiled.components.size, 2);
});
