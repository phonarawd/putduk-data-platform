export const WORK_SCHEMA_VERSION = 'putduk.work/1.0';
export const WORK_CONTRACT_VERSION = 'putduk.work_contract/1.0';
export const WORK_SUBMISSION_VERSION = 'putduk.work_submission/1.0';

const SLUG = /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/;

function objectValue(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function arrayValue(value) {
  return Array.isArray(value) ? value : [];
}

function text(value) {
  return String(value ?? '').trim();
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function normalizeText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function normalizeDigits(value) {
  return String(value ?? '').replace(/\D/g, '');
}

function normalizeChoice(value) {
  return String(value ?? '').trim().toLowerCase();
}

function normalizeInteger(value) {
  const number = Number(value);
  return Number.isSafeInteger(number) ? number : null;
}

function normalizeBoolean(value) {
  if (value === true || value === false) return value;
  const candidate = String(value ?? '').trim().toLowerCase();
  if (['1', 'true', 'yes', 'y'].includes(candidate)) return true;
  if (['0', 'false', 'no', 'n'].includes(candidate)) return false;
  return null;
}

function optionList(component) {
  return arrayValue(component.options).map((option) => {
    const row = objectValue(option);
    const value = text(row.value || row.id);
    return { value, label: text(row.label || row.label_ko || value) };
  }).filter((option) => option.value);
}

function fieldName(instance) {
  return `${instance.itemKey}.${instance.component.key}`;
}

function defaultRenderInput(instance, type = 'text', extra = '') {
  const component = instance.component;
  const name = fieldName(instance);
  const required = component.required === false ? '' : ' required';
  return `<label class="putduk-work-field" data-work-component="${escapeHtml(component.type)}">`
    + `<span>${escapeHtml(component.label_ko || component.label || component.key)}</span>`
    + `<input type="${type}" name="${escapeHtml(name)}" data-work-answer="${escapeHtml(name)}"${required}${extra} />`
    + `</label>`;
}

export function createComponentRegistry(seed = {}) {
  const adapters = new Map();
  const api = {
    register(type, adapter) {
      const key = text(type);
      if (!key || !SLUG.test(key)) throw new Error(`잘못된 component type: ${key || '(empty)'}`);
      if (!adapter || typeof adapter.normalize !== 'function' || typeof adapter.render !== 'function') {
        throw new Error(`${key} component는 normalize/render가 필요합니다.`);
      }
      adapters.set(key, adapter);
      return api;
    },
    get(type) {
      return adapters.get(text(type)) || null;
    },
    has(type) {
      return adapters.has(text(type));
    },
    types() {
      return [...adapters.keys()];
    },
    normalize(type, value, component = {}) {
      const adapter = api.get(type);
      if (!adapter) throw new Error(`지원하지 않는 component type: ${type}`);
      return adapter.normalize(value, component);
    },
    render(instance, context = {}) {
      const adapter = api.get(instance?.component?.type);
      if (!adapter) throw new Error(`지원하지 않는 component type: ${instance?.component?.type || ''}`);
      return adapter.render(instance, context);
    }
  };

  api
    .register('text', {
      normalize: normalizeText,
      render: (instance) => defaultRenderInput(instance, 'text', ` maxlength="${Number(instance.component.max_length || 240)}"`)
    })
    .register('digits', {
      normalize: normalizeDigits,
      render: (instance) => defaultRenderInput(instance, 'text', ' inputmode="numeric" pattern="[0-9,. -]*"')
    })
    .register('integer', {
      normalize: normalizeInteger,
      render: (instance) => defaultRenderInput(instance, 'number', ' step="1"')
    })
    .register('boolean', {
      normalize: normalizeBoolean,
      render: (instance) => {
        const component = instance.component;
        const name = fieldName(instance);
        return `<label class="putduk-work-field putduk-work-toggle" data-work-component="boolean">`
          + `<input type="checkbox" name="${escapeHtml(name)}" data-work-answer="${escapeHtml(name)}" />`
          + `<span>${escapeHtml(component.label_ko || component.label || component.key)}</span>`
          + `</label>`;
      }
    })
    .register('choice', {
      normalize: normalizeChoice,
      render: (instance) => {
        const component = instance.component;
        const name = fieldName(instance);
        const options = optionList(component).map((option) => (
          `<label class="putduk-work-choice">`
          + `<input type="radio" name="${escapeHtml(name)}" value="${escapeHtml(option.value)}" data-work-answer="${escapeHtml(name)}" />`
          + `<span>${escapeHtml(option.label)}</span>`
          + `</label>`
        )).join('');
        return `<fieldset class="putduk-work-field" data-work-component="choice">`
          + `<legend>${escapeHtml(component.label_ko || component.label || component.key)}</legend>${options}</fieldset>`;
      }
    });

  for (const [type, adapter] of Object.entries(seed)) api.register(type, adapter);
  return api;
}

export const defaultComponentRegistry = createComponentRegistry();

function compileComponents(definition, registry) {
  const components = arrayValue(definition.components);
  if (!components.length) throw new Error('work definition에 components가 필요합니다.');
  const byKey = new Map();
  for (const raw of components) {
    const component = { ...objectValue(raw) };
    component.key = text(component.key);
    component.type = text(component.type);
    if (!component.key || !SLUG.test(component.key)) throw new Error(`잘못된 component key: ${component.key || '(empty)'}`);
    if (byKey.has(component.key)) throw new Error(`중복 component key: ${component.key}`);
    if (!registry.has(component.type)) throw new Error(`등록되지 않은 component type: ${component.type}`);
    if (component.type === 'choice' && !optionList(component).length) throw new Error(`${component.key} choice에는 options가 필요합니다.`);
    byKey.set(component.key, Object.freeze(component));
  }
  return byKey;
}

function compileWorkflow(definition, components) {
  const workflow = objectValue(definition.workflow);
  const steps = arrayValue(workflow.steps);
  if (!steps.length) throw new Error('work definition에 workflow.steps가 필요합니다.');
  const compiled = [];
  const seen = new Set();
  for (const raw of steps) {
    const step = { ...objectValue(raw) };
    step.key = text(step.key);
    if (!step.key || !SLUG.test(step.key)) throw new Error(`잘못된 step key: ${step.key || '(empty)'}`);
    if (seen.has(step.key)) throw new Error(`중복 step key: ${step.key}`);
    seen.add(step.key);
    step.component_keys = arrayValue(step.component_keys).map(text).filter(Boolean);
    if (!step.component_keys.length) throw new Error(`${step.key} step에는 component_keys가 필요합니다.`);
    for (const key of step.component_keys) {
      if (!components.has(key)) throw new Error(`${step.key} step이 없는 component ${key}를 참조합니다.`);
    }
    step.repeat = text(step.repeat || 'once');
    if (!['once', 'items'].includes(step.repeat)) throw new Error(`${step.key} repeat는 once/items만 지원합니다.`);
    compiled.push(Object.freeze(step));
  }
  return Object.freeze(compiled);
}

export function compileWorkDefinition(rawDefinition, registry = defaultComponentRegistry) {
  const definition = { ...objectValue(rawDefinition) };
  const schemaVersion = text(definition.schema_version);
  const templateKey = text(definition.template_key);
  const templateVersion = Number(definition.template_version);
  if (schemaVersion !== WORK_SCHEMA_VERSION) throw new Error(`지원하지 않는 work schema: ${schemaVersion || '(empty)'}`);
  if (!templateKey || !SLUG.test(templateKey)) throw new Error(`잘못된 template_key: ${templateKey || '(empty)'}`);
  if (!Number.isSafeInteger(templateVersion) || templateVersion < 1) throw new Error('template_version은 1 이상의 정수여야 합니다.');
  const components = compileComponents(definition, registry);
  const steps = compileWorkflow(definition, components);
  const submission = objectValue(definition.submission);
  const review = objectValue(definition.review);
  const settlement = objectValue(definition.settlement);
  if (text(submission.contract) !== WORK_SUBMISSION_VERSION) throw new Error('submission contract가 올바르지 않습니다.');
  if (!text(review.contract)) throw new Error('review contract가 필요합니다.');
  if (!text(settlement.contract)) throw new Error('settlement contract가 필요합니다.');
  return Object.freeze({
    schemaVersion,
    templateKey,
    templateVersion,
    title: text(definition.title_ko || definition.title),
    purpose: text(definition.purpose_ko || definition.purpose),
    components,
    steps,
    evidence: Object.freeze(objectValue(definition.evidence)),
    submission: Object.freeze(submission),
    review: Object.freeze(review),
    settlement: Object.freeze(settlement),
    raw: Object.freeze(definition)
  });
}

export function compileWorkContract(rawContract, registry = defaultComponentRegistry) {
  const contract = objectValue(rawContract);
  if (text(contract.contract) !== WORK_CONTRACT_VERSION) throw new Error('work contract version이 올바르지 않습니다.');
  const definition = compileWorkDefinition(contract.definition, registry);
  if (text(contract.schema_version) !== definition.schemaVersion) throw new Error('contract/schema version이 다릅니다.');
  if (text(contract.template_key) !== definition.templateKey) throw new Error('contract/template key가 다릅니다.');
  if (Number(contract.template_version) !== definition.templateVersion) throw new Error('contract/template version이 다릅니다.');
  const items = arrayValue(contract.items).map((raw, index) => {
    const item = objectValue(raw);
    return Object.freeze({
      itemKey: text(item.item_key || `item-${index + 1}`),
      stepKey: text(item.step_key || definition.steps[0]?.key),
      ordinal: Number(item.ordinal || index + 1),
      payload: Object.freeze(objectValue(item.payload || item.member_payload))
    });
  });
  return Object.freeze({
    taskRunId: text(contract.task_run_id),
    definition,
    items: Object.freeze(items)
  });
}

export function materializeComponentInstances(compiled, items = null) {
  const definition = compiled?.definition || compiled;
  if (!definition?.steps || !definition?.components) throw new Error('compileWorkDefinition 결과가 필요합니다.');
  const rows = arrayValue(items ?? compiled?.items ?? []);
  const instances = [];
  for (const step of definition.steps) {
    const stepItems = step.repeat === 'items'
      ? rows.filter((item) => text(item.stepKey || item.step_key) === step.key)
      : [{ itemKey: step.key, stepKey: step.key, ordinal: 1, payload: {} }];
    for (const item of stepItems) {
      const itemKey = text(item.itemKey || item.item_key || step.key);
      const payload = objectValue(item.payload || item.member_payload);
      for (const key of step.component_keys) {
        instances.push(Object.freeze({
          key: `${itemKey}.${key}`,
          itemKey,
          stepKey: step.key,
          ordinal: Number(item.ordinal || instances.length + 1),
          payload,
          component: definition.components.get(key)
        }));
      }
    }
  }
  return instances;
}

function answerAt(answers, instance) {
  const root = objectValue(answers);
  const item = objectValue(root[instance.itemKey]);
  if (Object.prototype.hasOwnProperty.call(item, instance.component.key)) return item[instance.component.key];
  if (Object.prototype.hasOwnProperty.call(root, instance.key)) return root[instance.key];
  return undefined;
}

function isEmpty(value) {
  return value == null || value === '' || (Array.isArray(value) && value.length === 0);
}

export function validateMemberSubmission(compiled, answers, registry = defaultComponentRegistry) {
  const contract = compiled?.definition ? compiled : { definition: compiled, items: [] };
  const instances = materializeComponentInstances(contract.definition, contract.items || []);
  const normalized = {};
  const errors = [];
  for (const instance of instances) {
    const component = instance.component;
    const raw = answerAt(answers, instance);
    const value = registry.normalize(component.type, raw, component);
    if (!normalized[instance.itemKey]) normalized[instance.itemKey] = {};
    normalized[instance.itemKey][component.key] = value;
    const required = component.required !== false;
    if (required && isEmpty(value)) {
      errors.push({ item_key: instance.itemKey, component_key: component.key, code: 'required' });
      continue;
    }
    if (isEmpty(value)) continue;
    if (component.type === 'text') {
      const length = String(value).length;
      if (component.min_length != null && length < Number(component.min_length)) errors.push({ item_key: instance.itemKey, component_key: component.key, code: 'min_length' });
      if (component.max_length != null && length > Number(component.max_length)) errors.push({ item_key: instance.itemKey, component_key: component.key, code: 'max_length' });
    }
    if (component.type === 'digits') {
      const length = String(value).length;
      if (component.min_length != null && length < Number(component.min_length)) errors.push({ item_key: instance.itemKey, component_key: component.key, code: 'min_length' });
      if (component.max_length != null && length > Number(component.max_length)) errors.push({ item_key: instance.itemKey, component_key: component.key, code: 'max_length' });
    }
    if (component.type === 'integer') {
      if (value == null) errors.push({ item_key: instance.itemKey, component_key: component.key, code: 'integer' });
      if (component.min != null && Number(value) < Number(component.min)) errors.push({ item_key: instance.itemKey, component_key: component.key, code: 'min' });
      if (component.max != null && Number(value) > Number(component.max)) errors.push({ item_key: instance.itemKey, component_key: component.key, code: 'max' });
    }
    if (component.type === 'choice') {
      const allowed = new Set(optionList(component).map((option) => option.value.toLowerCase()));
      if (!allowed.has(String(value).toLowerCase())) errors.push({ item_key: instance.itemKey, component_key: component.key, code: 'option' });
    }
  }
  return { ok: errors.length === 0, errors, answers: normalized };
}

export function buildEvidence(compiled, normalizedAnswers, now = new Date()) {
  const contract = compiled?.definition ? compiled : { definition: compiled, items: [] };
  const instances = materializeComponentInstances(contract.definition, contract.items || []);
  const evidence = {};
  for (const instance of instances) {
    const policy = objectValue(instance.component.evidence);
    if (text(policy.capture || 'value') === 'none') continue;
    if (!evidence[instance.itemKey]) evidence[instance.itemKey] = {};
    evidence[instance.itemKey][instance.component.key] = {
      type: text(policy.type || 'answer_snapshot'),
      value: objectValue(normalizedAnswers)[instance.itemKey]?.[instance.component.key] ?? null,
      captured_at: now.toISOString()
    };
  }
  return evidence;
}

export function buildSubmission(compiledContract, answers, { now = new Date(), metadata = {} } = {}) {
  const validation = validateMemberSubmission(compiledContract, answers);
  if (!validation.ok) return { ok: false, errors: validation.errors };
  const definition = compiledContract.definition;
  return {
    ok: true,
    submission: {
      contract: WORK_SUBMISSION_VERSION,
      schema_version: definition.schemaVersion,
      template_key: definition.templateKey,
      template_version: definition.templateVersion,
      task_run_id: compiledContract.taskRunId || null,
      answers: validation.answers,
      evidence: buildEvidence(compiledContract, validation.answers, now),
      metadata: { ...objectValue(metadata), submitted_at: now.toISOString() }
    }
  };
}

export function renderWorkStep(compiledContract, stepKey, answers = {}, registry = defaultComponentRegistry) {
  const definition = compiledContract.definition;
  const step = definition.steps.find((candidate) => candidate.key === stepKey);
  if (!step) throw new Error(`없는 work step: ${stepKey}`);
  const instances = materializeComponentInstances(compiledContract).filter((instance) => instance.stepKey === step.key);
  const body = instances.map((instance) => registry.render(instance, { answers, definition, step })).join('');
  const title = escapeHtml(step.title_ko || step.title || definition.title || '업무');
  return `<section class="putduk-work-step" data-work-step="${escapeHtml(step.key)}"><h2>${title}</h2>${body}</section>`;
}
