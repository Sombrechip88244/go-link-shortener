// Validation tests — run with `npm test` (tsx tests/validate.test.ts).
// No test framework; uses node:assert. Covers URL validation, custom code
// validation, and the reserved-word blocklist.

import assert from 'node:assert';
import {
  isReservedCode,
  validateCode,
  validateUrl,
  generateCode,
  CODE_REGEX,
  CHARSET,
} from '../functions/lib/validate';

type Test = { name: string; fn: () => void };
const tests: Test[] = [];

function test(name: string, fn: () => void) {
  tests.push({ name, fn });
}

// ─── validateUrl ──────────────────────────────────────────────────────────

test('validateUrl: accepts http://', () => {
  assert.strictEqual(validateUrl('http://example.com'), 'http://example.com/');
});

test('validateUrl: accepts https://', () => {
  assert.strictEqual(validateUrl('https://example.com'), 'https://example.com/');
});

test('validateUrl: accepts https with path, query, and fragment', () => {
  const out = validateUrl('https://example.com/a/b?x=1&y=2#frag');
  assert.strictEqual(out, 'https://example.com/a/b?x=1&y=2#frag');
});

test('validateUrl: prepends https to bare domains', () => {
  assert.strictEqual(validateUrl('example.com'), 'https://example.com/');
  assert.strictEqual(validateUrl('example.com/path'), 'https://example.com/path');
});

test('validateUrl: accepts international domain names (punycode via URL)', () => {
  const out = validateUrl('https://xn--bcher-kva.example/page');
  assert.ok(out?.startsWith('https://xn--bcher-kva.example/'));
});

test('validateUrl: rejects empty', () => {
  assert.strictEqual(validateUrl(''), null);
  assert.strictEqual(validateUrl('   '), null);
  assert.strictEqual(validateUrl(null), null);
  assert.strictEqual(validateUrl(undefined), null);
});

test('validateUrl: rejects >2048 chars', () => {
  const long = 'https://example.com/' + 'a'.repeat(2050);
  assert.strictEqual(validateUrl(long), null);
});

test('validateUrl: rejects ftp://', () => {
  assert.strictEqual(validateUrl('ftp://example.com'), null);
});

test('validateUrl: rejects javascript:', () => {
  assert.strictEqual(validateUrl('javascript:alert(1)'), null);
});

test('validateUrl: rejects data:', () => {
  assert.strictEqual(validateUrl('data:text/html,<script>alert(1)</script>'), null);
});

test('validateUrl: rejects file:', () => {
  assert.strictEqual(validateUrl('file:///etc/passwd'), null);
});

test('validateUrl: rejects vbscript:', () => {
  assert.strictEqual(validateUrl('vbscript:msgbox(1)'), null);
});

test('validateUrl: rejects localhost', () => {
  assert.strictEqual(validateUrl('http://localhost/page'), null);
  assert.strictEqual(validateUrl('https://localhost:3000/'), null);
});

test('validateUrl: rejects 127.0.0.1', () => {
  assert.strictEqual(validateUrl('http://127.0.0.1'), null);
  assert.strictEqual(validateUrl('https://127.0.0.1:8080/x'), null);
});

test('validateUrl: rejects 0.0.0.0', () => {
  assert.strictEqual(validateUrl('http://0.0.0.0'), null);
});

test('validateUrl: rejects [::1]', () => {
  assert.strictEqual(validateUrl('http://[::1]'), null);
});

test('validateUrl: strips userinfo for defense in depth', () => {
  const out = validateUrl('https://user:pass@example.com/');
  assert.ok(out);
  assert.ok(!out.includes('user'));
  assert.ok(!out.includes('pass'));
});

test('validateUrl: rejects garbage', () => {
  assert.strictEqual(validateUrl('not a url at all !!!'), null);
});

// ─── validateCode ─────────────────────────────────────────────────────────

test('validateCode: accepts alphanumerics, hyphens, underscores (1-32)', () => {
  assert.strictEqual(validateCode('abc'), 'abc');
  assert.strictEqual(validateCode('abc-123'), 'abc-123');
  assert.strictEqual(validateCode('abc_123'), 'abc_123');
  assert.strictEqual(validateCode('ABC123'), 'ABC123');
  assert.strictEqual(validateCode('a'), 'a');
  assert.strictEqual(validateCode('x'.repeat(32)), 'x'.repeat(32));
});

test('validateCode: rejects empty/null/undefined', () => {
  assert.strictEqual(validateCode(''), null);
  assert.strictEqual(validateCode('   '), null);
  assert.strictEqual(validateCode(null), null);
  assert.strictEqual(validateCode(undefined), null);
});

test('validateCode: rejects >32 chars', () => {
  assert.strictEqual(validateCode('x'.repeat(33)), null);
});

test('validateCode: rejects spaces', () => {
  assert.strictEqual(validateCode('ab cd'), null);
});

test('validateCode: rejects emoji and unicode', () => {
  assert.strictEqual(validateCode('🚀'), null);
  assert.strictEqual(validateCode('café'), null);
  assert.strictEqual(validateCode('🚀abc'), null);
  assert.strictEqual(validateCode('naïve'), null);
});

test('validateCode: rejects special chars', () => {
  assert.strictEqual(validateCode('ab/cd'), null);
  assert.strictEqual(validateCode('ab.cd'), null);
  assert.strictEqual(validateCode('ab+cd'), null);
  assert.strictEqual(validateCode('ab@cd'), null);
  assert.strictEqual(validateCode('ab%20cd'), null);
});

test('validateCode: regex matches valid patterns', () => {
  assert.ok(CODE_REGEX.test('abc-123_xyz'));
  assert.ok(!CODE_REGEX.test('abc 123'));
  assert.ok(!CODE_REGEX.test(''));
});

// ─── generateCode ─────────────────────────────────────────────────────────

test('generateCode: produces 6 chars from CHARSET', () => {
  for (let i = 0; i < 50; i++) {
    const code = generateCode();
    assert.strictEqual(code.length, 6);
    for (const ch of code) {
      assert.ok(CHARSET.includes(ch), `unexpected char: ${ch}`);
    }
  }
});

// ─── isReservedCode ────────────────────────────────────────────────────────

test('isReservedCode: blocks exact reserved words (case-insensitive)', () => {
  assert.strictEqual(isReservedCode('admin'), true);
  assert.strictEqual(isReservedCode('Admin'), true);
  assert.strictEqual(isReservedCode('API'), true);
  assert.strictEqual(isReservedCode('docs'), true);
  assert.strictEqual(isReservedCode('health'), true);
});

test('isReservedCode: blocks codes containing a dot', () => {
  assert.strictEqual(isReservedCode('a.b'), true);
  assert.strictEqual(isReservedCode('favicon.ico'), true);
  assert.strictEqual(isReservedCode('robots.txt'), true);
});

test('isReservedCode: blocks codes starting with _', () => {
  assert.strictEqual(isReservedCode('_next'), true);
  assert.strictEqual(isReservedCode('_internal'), true);
  assert.strictEqual(isReservedCode('__'), true);
});

test('isReservedCode: allows valid non-reserved codes', () => {
  assert.strictEqual(isReservedCode('abc123'), false);
  assert.strictEqual(isReservedCode('launch'), false);
  assert.strictEqual(isReservedCode('a-b-c'), false);
  assert.strictEqual(isReservedCode('X1_Y2'), false);
});

test('isReservedCode: empty string is reserved', () => {
  assert.strictEqual(isReservedCode(''), true);
});

// ─── runner ───────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;
const failures: { name: string; err: unknown }[] = [];

for (const t of tests) {
  try {
    t.fn();
    passed++;
    console.log(`  \x1b[32m✓\x1b[0m ${t.name}`);
  } catch (err) {
    failed++;
    failures.push({ name: t.name, err });
    console.log(`  \x1b[31m✗\x1b[0m ${t.name}`);
    if (err instanceof Error) console.log(`    ${err.message}`);
  }
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log('\nFailures:');
  for (const f of failures) {
    console.log(`  - ${f.name}`);
    if (f.err instanceof Error) console.log(`    ${f.err.message}`);
  }
  process.exit(1);
}
