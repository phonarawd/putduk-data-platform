import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const financeSource = fs.readFileSync(new URL('../../supabase/functions/member-finance/index.ts', import.meta.url), 'utf8');
const httpSource = fs.readFileSync(new URL('../../supabase/functions/_shared/http.ts', import.meta.url), 'utf8');
const userId = '11111111-1111-4111-8111-111111111111';

function extractFunction(source, marker) {
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `Missing function: ${marker}`);
  const openingBrace = source.indexOf('{', start);
  let depth = 0;
  for (let index = openingBrace; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}') depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`Unclosed function: ${marker}`);
}

class TestHttpError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const verifiedJwtSource = extractFunction(httpSource, 'export function userFromVerifiedJwt(')
  .replace(/^export /, '')
  .replace('(request: Request, loginCopy = "로그인이 필요합니다."): AuthUser {', '(request, loginCopy = "로그인이 필요합니다.") {')
  .replace(' as { sub?: string; email?: string; exp?: number }', '');
const userFromVerifiedJwt = new Function(
  'isUuid',
  'HttpError',
  'atob',
  `return (${verifiedJwtSource});`
)(
  (value) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || '').trim()),
  TestHttpError,
  globalThis.atob
);

const authenticateSource = extractFunction(financeSource, 'async function authenticate(request: Request) {')
  .replace('authenticate(request: Request)', 'authenticate(request)');

function makeJwt(signature = 'unit-signature') {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const payload = { sub: userId, aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 };
  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode(payload)}.${signature}`;
}

function createHarness(invalidToken = null) {
  const forwardedTokens = [];
  const admin = {
    auth: {
      async getUser(accessToken) {
        forwardedTokens.push(accessToken);
        if (accessToken === invalidToken) return { data: { user: null }, error: new Error('invalid token') };
        return {
          data: {
            user: {
              id: userId,
              email_confirmed_at: '2026-01-01T00:00:00.000Z',
              deleted_at: null,
              banned_until: null
            }
          },
          error: null
        };
      }
    }
  };
  const authenticate = new Function(
    'userFromVerifiedJwt',
    'HttpError',
    'admin',
    `return (${authenticateSource});`
  )(userFromVerifiedJwt, TestHttpError, admin);
  return { authenticate, forwardedTokens };
}

function memberRequest(authorization) {
  const headers = authorization === undefined ? {} : { authorization };
  return new Request('https://unit.test/functions/v1/member-finance', { method: 'POST', headers });
}

for (const [label, header] of [
  ['standard Bearer header', (token) => `Bearer ${token}`],
  ['case-insensitive Bearer header', (token) => `bearer ${token}`],
  ['repeated whitespace after Bearer', (token) => `Bearer    ${token}`]
]) {
  test(`member-finance forwards only the JWT for ${label}`, async () => {
    const jwt = makeJwt();
    const { authenticate, forwardedTokens } = createHarness();
    const user = await authenticate(memberRequest(header(jwt)));

    assert.equal(user.id, userId);
    assert.deepEqual(forwardedTokens, [jwt]);
  });
}

test('member-finance rejects a missing Authorization header with login required', async () => {
  const { authenticate, forwardedTokens } = createHarness();

  await assert.rejects(authenticate(memberRequest()), (error) => (
    error.status === 401 && error.message === '로그인이 필요합니다.'
  ));
  assert.deepEqual(forwardedTokens, []);
});

test('member-finance rejects an invalid token with an invalid-session response', async () => {
  const invalidJwt = makeJwt('invalid-signature');
  const { authenticate, forwardedTokens } = createHarness(invalidJwt);

  await assert.rejects(authenticate(memberRequest(`Bearer ${invalidJwt}`)), (error) => (
    error.status === 401 && error.message === '세션이 유효하지 않습니다.'
  ));
  assert.deepEqual(forwardedTokens, [invalidJwt]);
});

test('member-finance Authorization parser cannot regress to a double-escaped whitespace pattern', () => {
  const parserLine = financeSource.split(/\r?\n/).find((line) => line.includes('.replace(/^Bearer'));

  assert.ok(parserLine?.includes(String.raw`Bearer\s+`));
  assert.equal(parserLine.includes(String.raw`Bearer\\s+`), false);
  assert.match(financeSource, /data\.user\.id !== user\.id/);
});
