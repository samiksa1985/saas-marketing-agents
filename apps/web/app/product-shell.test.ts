import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('commercial shell provides onboarding, RTL direction, focusable navigation, and no direct consequential action control', async () => {
  const source = await readFile('app/product-shell.tsx', 'utf8');
  assert.match(source, /dir=\{direction\}/);
  assert.match(source, /href="\/onboarding"/);
  assert.match(source, /aria-current=/);
  assert.match(source, /Recommendation is not authorization/);
  assert.match(source, /No credential values are rendered/);
  assert.doesNotMatch(source, /fetch\(/);
  assert.doesNotMatch(source, /sendMessage|sendEmail|sendSms|executeConsequential/);
});
