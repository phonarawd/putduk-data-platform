import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { readLaunchFiles, readRepo, repoPath } from '../helpers/repo.mjs';

test('depositForm은 PIN 공개 뒤에 생기고 증빙 파일 칸이 템플릿에 있다', async () => {
  const { appJs } = await readLaunchFiles();
  const formStart = appJs.indexOf('<form id="depositForm">');
  const pinForm = appJs.indexOf('id="depositPinForm"');
  const pinSetForm = appJs.indexOf('id="depositPinSetForm"');
  const revealedGate = appJs.indexOf('const amountForm = isDepositRevealed()');
  assert.ok(formStart > -1);
  assert.ok(pinForm > -1 && pinSetForm > -1);
  assert.ok(revealedGate > -1 && revealedGate < formStart);
  const formSlice = appJs.slice(formStart, formStart + 1800);
  assert.match(formSlice, /id="depositProofFile"/);
  assert.match(formSlice, /name="proof_file"/);
  assert.match(formSlice, /accept="image\/jpeg,image\/png,image\/webp,application\/pdf"/);
  assert.match(formSlice, /min="1000"/);
});

test('네이티브 입금 신청은 실제 proof_path만 보내고 빈 경로는 없다', async () => {
  const { appJs } = await readLaunchFiles();
  assert.match(appJs, /memberFinanceRequest\('request_upload'/);
  assert.match(appJs, /purpose:\s*'deposit_proof'/);
  assert.match(appJs, /uploadToSignedUrl/);
  assert.match(appJs, /proof_path:\s*proofPath/);
  assert.match(appJs, /assertDepositProofFile/);
  assert.match(appJs, /state\.depositJump = \{ \.\.\.values, file, proof_file: file \}/);
  assert.doesNotMatch(appJs, /proof_path:\s*''/);
  assert.doesNotMatch(appJs, /proof_path:\s*""/);
  assert.match(appJs, /if \(!String\(proofPath \|\| ''\)\.trim\(\)\) throw/);
  assert.doesNotMatch(appJs, /wallet\.(support|work|available)\s*[+\-]=/);
  assert.doesNotMatch(appJs, /fake success|fakeSuccess|fake deposit/i);
});

test('PHASE 4 오버레이는 기존 증빙 칸을 중복 넣지 않고 고액은 점프 폼만 가로챈다', async () => {
  const wiring = await readRepo('dist', 'assets', 'phase4-finance-wiring.js');
  assert.match(wiring, /new MutationObserver\(scan\)/);
  assert.match(wiring, /augmentDepositForm\(document\.getElementById\('depositForm'\)\)/);
  assert.match(wiring, /if \(form\.querySelector\('#depositProofFile'\)\)/);
  assert.match(wiring, /form\.dataset\.phase4FinanceWired = '1'/);
  assert.match(wiring, /stopImmediatePropagation/);
  assert.match(wiring, /if \(values\.amount >= HIGH_JUMP_MIN\) \{\s*highPending = values;\s*return;/);
  assert.match(wiring, /if \(form\.id === 'depositJumpForm'\) \{\s*if \(!highPending\) return;/);
  assert.doesNotMatch(wiring, /proof_path:\s*''/);
});

function makeHarness() {
  const listeners = [];
  const nodes = new Map();
  const financeCalls = [];
  const byId = (id) => nodes.get(id) || null;

  class HTMLFormElement extends EventTarget {
    constructor() {
      super();
      this.dataset = {};
    }

    querySelector(sel) {
      if (sel === '#depositProofFile') return this.proof || null;
      if (sel === '#depositAmount') return this.amount || null;
      if (sel === '.modal-actions') return this.actions || null;
      if (sel === 'button[type="submit"]') return this.submitButton || null;
      return null;
    }
  }

  class FakeEl {
    constructor(id, extra = {}) {
      this.id = id;
      this.dataset = {};
      this.children = [];
      this.style = {};
      Object.assign(this, extra);
    }
  }

  const documentElement = { dataset: { mode: 'member' } };
  const toastStack = new FakeEl('toastStack', {
    children: [],
    appendChild(node) { this.children.push(node); return node; },
    get firstElementChild() { return this.children[0] || null; }
  });
  nodes.set('toastStack', toastStack);

  const document = {
    documentElement,
    readyState: 'complete',
    getElementById: byId,
    querySelector: () => null,
    createElement: () => new FakeEl('', { setAttribute() {}, textContent: '', className: '', remove() {} }),
    addEventListener(type, fn, opts) {
      listeners.push({ type, fn, capture: opts === true || opts?.capture === true });
    }
  };

  const windowObj = {
    PUTDUK_CONFIG: {
      supabaseUrl: 'https://gaugwamwceqdnqdqrxqg.supabase.co',
      supabasePublishableKey: 'pub',
      memberFinanceUrl: 'https://gaugwamwceqdnqdqrxqg.supabase.co/functions/v1/member-finance'
    },
    supabase: {
      createClient() {
        return {
          auth: {
            getSession: async () => ({ data: { session: { access_token: 'tok' } } })
          },
          storage: {
            from() {
              return {
                uploadToSignedUrl: async () => ({ error: null })
              };
            }
          }
        };
      }
    },
    setTimeout: globalThis.setTimeout,
    HTMLFormElement
  };

  async function fetchMock(url, opts = {}) {
    const body = JSON.parse(String(opts.body || '{}'));
    financeCalls.push({ url: String(url), action: body.action, proof_path: body.proof_path ?? null, amount: body.amount ?? null });
    if (body.action === 'request_upload') {
      return {
        ok: true,
        json: async () => ({
          ok: true,
          upload: { bucket: 'putduk-private', path: 'deposit-proof/user/uuid-proof.jpg', token: 'signed' }
        })
      };
    }
    if (body.action === 'submit_deposit') {
      return { ok: true, json: async () => ({ ok: true, deposit: { id: 'dep-1' } }) };
    }
    return { ok: true, json: async () => ({ ok: true }) };
  }

  const context = vm.createContext({
    window: windowObj,
    document,
    HTMLFormElement,
    File,
    FormData: class FormData {
      constructor(form) {
        this._form = form;
      }

      get(name) {
        if (name === 'amount') return this._form.amount?.value;
        if (name === 'currency') return this._form.currencyValue || 'KRW';
        if (name === 'destination_id') return this._form.destinationId || 'dest-1';
        return null;
      }
    },
    fetch: fetchMock,
    MutationObserver: class {
      observe() {}
    },
    queueMicrotask,
    setTimeout: globalThis.setTimeout,
    console
  });
  context.window.window = context.window;
  context.window.document = document;
  context.window.fetch = fetchMock;
  context.window.File = File;
  context.window.FormData = context.FormData;
  context.window.MutationObserver = context.MutationObserver;
  context.window.setTimeout = globalThis.setTimeout;

  return { context, document, nodes, listeners, financeCalls, HTMLFormElement, FakeEl, byId };
}

function dispatchSubmit(listeners, form) {
  const event = {
    target: form,
    defaultPrevented: false,
    immediate: false,
    preventDefault() { this.defaultPrevented = true; },
    stopImmediatePropagation() { this.immediate = true; }
  };
  const ordered = [
    ...listeners.filter((item) => item.type === 'submit' && item.capture),
    ...listeners.filter((item) => item.type === 'submit' && !item.capture)
  ];
  for (const item of ordered) {
    if (event.immediate) break;
    item.fn(event);
  }
  return event;
}

async function flush() {
  await new Promise((resolve) => setTimeout(resolve, 40));
}

test('capture 핸들러와 네이티브 핸들러가 한 입금에 submit_deposit을 두 번 보내지 않는다', async () => {
  const wiring = await readFile(repoPath('dist', 'assets', 'phase4-finance-wiring.js'), 'utf8');
  const proof = new File([Uint8Array.from([1, 2, 3, 4])], 'proof.jpg', { type: 'image/jpeg' });

  async function runCase({ amount, formId, jumpConfirm = false, attachFile = true }) {
    const harness = makeHarness();
    vm.runInContext(wiring, harness.context, { filename: 'phase4-finance-wiring.js' });

    let nativeDepositHits = 0;
    let nativeJumpHits = 0;
    harness.document.addEventListener('submit', (event) => {
      if (event.target.id === 'depositForm') {
        nativeDepositHits += 1;
        event.preventDefault();
        if (Number(event.target.amount?.value) >= 3000000) return;
        harness.context.fetch('https://gaugwamwceqdnqdqrxqg.supabase.co/functions/v1/member-finance', {
          method: 'POST',
          body: JSON.stringify({ action: 'submit_deposit', proof_path: 'native-empty' })
        });
      }
      if (event.target.id === 'depositJumpForm') {
        nativeJumpHits += 1;
        event.preventDefault();
        harness.context.fetch('https://gaugwamwceqdnqdqrxqg.supabase.co/functions/v1/member-finance', {
          method: 'POST',
          body: JSON.stringify({ action: 'submit_deposit', proof_path: 'native-jump' })
        });
      }
    });

    const form = new harness.HTMLFormElement();
    form.id = formId;
    form.amount = { id: 'depositAmount', value: String(amount), min: '1000' };
    form.proof = attachFile ? { id: 'depositProofFile', files: [proof] } : { id: 'depositProofFile', files: [] };
    form.actions = { id: 'actions' };
    form.submitButton = { disabled: false, textContent: '입금 확인 요청', dataset: {} };
    form.currencyValue = 'KRW';
    form.destinationId = 'dest-1';
    harness.nodes.set(formId, form);
    if (formId === 'depositJumpForm') {
      harness.nodes.set('depositJumpRepeat', { value: jumpConfirm ? String(amount) : '' });
      harness.nodes.set('depositJumpSlide', { value: jumpConfirm ? '100' : '0' });
    }
    dispatchSubmit(harness.listeners, form);
    await flush();
    return { harness, nativeDepositHits, nativeJumpHits };
  }

  const normal = await runCase({ amount: 50000, formId: 'depositForm' });
  const normalSubmits = normal.harness.financeCalls.filter((row) => row.action === 'submit_deposit');
  assert.equal(normal.nativeDepositHits, 0, '정상 금액은 capture가 네이티브를 막아야 한다');
  assert.equal(normalSubmits.length, 1, '정상 금액 submit_deposit은 1회');
  assert.equal(normalSubmits[0].proof_path, 'deposit-proof/user/uuid-proof.jpg');
  assert.equal(normal.harness.financeCalls.some((row) => row.proof_path === '' || row.proof_path === 'native-empty'), false);

  const highOpen = await runCase({ amount: 3000000, formId: 'depositForm' });
  const highOpenSubmits = highOpen.harness.financeCalls.filter((row) => row.action === 'submit_deposit');
  assert.equal(highOpen.nativeDepositHits, 1, '고액 1차는 점프 모달을 위해 네이티브가 열려야 한다');
  assert.equal(highOpenSubmits.length, 0, '고액 1차에서는 submit_deposit이 없어야 한다');

  const highConfirm = await runCase({ amount: 3000000, formId: 'depositForm' });
  const jumpForm = new highConfirm.harness.HTMLFormElement();
  jumpForm.id = 'depositJumpForm';
  jumpForm.submitButton = { disabled: false, textContent: '이 금액으로 요청', dataset: {} };
  highConfirm.harness.nodes.set('depositJumpForm', jumpForm);
  highConfirm.harness.nodes.set('depositJumpRepeat', { value: '3000000' });
  highConfirm.harness.nodes.set('depositJumpSlide', { value: '100' });
  dispatchSubmit(highConfirm.harness.listeners, jumpForm);
  await flush();
  const highSubmits = highConfirm.harness.financeCalls.filter((row) => row.action === 'submit_deposit');
  assert.equal(highConfirm.nativeJumpHits, 0, '고액 확정은 capture가 네이티브 점프 제출을 막아야 한다');
  assert.equal(highSubmits.length, 1, '고액 확정 submit_deposit은 1회');
  assert.equal(highSubmits[0].proof_path, 'deposit-proof/user/uuid-proof.jpg');
  assert.equal(highSubmits[0].proof_path === '', false);

  const missing = await runCase({ amount: 50000, formId: 'depositForm', attachFile: false });
  const missingSubmits = missing.harness.financeCalls.filter((row) => row.action === 'submit_deposit');
  assert.equal(missing.nativeDepositHits, 0);
  assert.equal(missingSubmits.length, 0, '증빙 없으면 submit_deposit 전에 중단');
});
