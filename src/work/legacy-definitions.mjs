import { WORK_SCHEMA_VERSION, WORK_SUBMISSION_VERSION } from './engine.mjs';

const sharedContracts = {
  evidence: { model: 'answer_snapshot.v1', retain_with_submission: true },
  submission: { contract: WORK_SUBMISSION_VERSION, mode: 'all_required_valid' },
  review: { contract: 'putduk.review/1.0', decisions: ['approved', 'rework', 'rejected'] },
  settlement: {
    contract: 'putduk.stake_stipend/1.0',
    trigger: 'review_approved',
    release_stake: true,
    post_stipend: true
  }
};

export const inspectBundleWorkDefinition = Object.freeze({
  schema_version: WORK_SCHEMA_VERSION,
  template_key: 'inspect_bundle',
  template_version: 1,
  title_ko: '라벨·전표 5건 대조',
  purpose_ko: '표시된 송장 번호와 실물 라벨 번호가 일치하는지 5건을 확인합니다.',
  components: [
    {
      key: 'match',
      type: 'choice',
      label_ko: '두 번호가 같나요?',
      required: true,
      options: [
        { value: 'yes', label_ko: '같아요' },
        { value: 'no', label_ko: '달라요' }
      ],
      validation: { mode: 'equals_expected' },
      evidence: { capture: 'value', type: 'answer_snapshot' }
    }
  ],
  workflow: {
    mode: 'linear',
    steps: [
      { key: 'inspect', title_ko: '라벨 확인', repeat: 'items', component_keys: ['match'] }
    ]
  },
  ...sharedContracts
});

export const catalogListingWorkDefinition = Object.freeze({
  schema_version: WORK_SCHEMA_VERSION,
  template_key: 'catalog_listing',
  template_version: 1,
  title_ko: '상품 정보 4칸 입력',
  purpose_ko: '카드에 보이는 상품명·가격·옵션·배송 정보를 그대로 입력합니다.',
  components: [
    { key: 'product_name', type: 'text', label_ko: '상품명', required: true, max_length: 120, validation: { mode: 'equals_expected' }, evidence: { capture: 'value' } },
    { key: 'price', type: 'digits', label_ko: '가격', required: true, min_length: 1, max_length: 12, validation: { mode: 'equals_expected' }, evidence: { capture: 'value' } },
    { key: 'option', type: 'text', label_ko: '옵션', required: true, max_length: 120, validation: { mode: 'equals_expected' }, evidence: { capture: 'value' } },
    { key: 'shipping', type: 'text', label_ko: '배송', required: true, max_length: 120, validation: { mode: 'equals_expected' }, evidence: { capture: 'value' } }
  ],
  workflow: {
    mode: 'linear',
    steps: [
      { key: 'listing', title_ko: '상품 정보 입력', repeat: 'items', component_keys: ['product_name', 'price', 'option', 'shipping'] }
    ]
  },
  ...sharedContracts
});

export const legacyWorkDefinitions = Object.freeze({
  inspect_bundle: inspectBundleWorkDefinition,
  catalog_listing: catalogListingWorkDefinition
});
