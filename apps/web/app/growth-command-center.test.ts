import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('Growth Command Center preserves unavailable provenance rather than fabricating executive metrics', async () => {
  const source = await readFile('app/growth-command-center.tsx', 'utf8');
  assert.match(source, /CODECORE AI/);
  assert.match(source, /Growth Command Center/);
  assert.match(source, /Provenance = 'ACTUAL' \| 'ESTIMATED' \| 'MODELED' \| 'UNAVAILABLE'/);
  assert.match(source, /Awaiting attributed source/);
  assert.match(source, /Unknown is never rendered as zero/);
  assert.doesNotMatch(source, /Revenue\s*[:=]\s*['"`]?\d/);
  assert.doesNotMatch(source, /ROAS\s*[:=]\s*['"`]?\d/);
});

test('Growth Command Center supports executive and operator views plus a first-class Arabic RTL shell', async () => {
  const [commandCenter, shell] = await Promise.all([
    readFile('app/growth-command-center.tsx', 'utf8'),
    readFile('app/product-shell.tsx', 'utf8'),
  ]);
  assert.match(commandCenter, /DashboardMode = 'executive' \| 'operator'/);
  assert.match(commandCenter, /aria-pressed=\{mode === 'executive'\}/);
  assert.match(commandCenter, /aria-pressed=\{mode === 'operator'\}/);
  assert.match(commandCenter, /locale === 'ar-SA'/);
  assert.match(shell, /dir=\{direction\}/);
  assert.match(shell, /No active tenant session|Active session/);
  assert.match(shell, /Workspace: unavailable|Workspace/);
});

test('Growth Command Center renders governed intelligence and safe provider health without execution controls', async () => {
  const source = await readFile('app/growth-command-center.tsx', 'utf8');
  assert.match(source, /Approval Required/);
  assert.match(source, /Unable to Verify/);
  assert.match(source, /A recommendation is never authorization/);
  assert.match(source, /Google Ads/);
  assert.match(source, /Meta Ads/);
  assert.match(source, /No credential values or synchronization timestamp available/);
  assert.doesNotMatch(source, /fetch\(/);
  assert.doesNotMatch(source, /executeConsequential|sendEmail|sendSms|sendMessage/);
});
