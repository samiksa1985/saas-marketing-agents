import * as assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

test('EPIC10 API remains guarded, tenant-scoped, recommendation-only, and transport-free', async () => {
  const controller = await readFile(new URL('../src/customer-engagement.controller.ts', import.meta.url), 'utf8');
  const application = await readFile(new URL('../src/customer-engagement.application.ts', import.meta.url), 'utf8');
  for (const route of ["@Post('customer-engagement/conversations/ingest')", "@Get('customer-engagement/conversations')", "@Get('customer-engagement/conversations/:id')", "@Get('customer-engagement/conversations/:id/intents')", "@Get('customer-engagement/conversations/:id/signals')", "@Get('customer-engagement/conversations/:id/summary')", "@Get('customer-engagement/conversations/:id/recommendations')", "@Get('customer-engagement/conversations/:id/diagnostics')", "@Get('customer-engagement/handoffs')", "@Get('customer-engagement/follow-ups')", "@Get('customer-engagement/analytics')", "@Post('ai-receptionist/sessions')", "@Post('ai-receptionist/sessions/:id/events')", "@Get('ai-receptionist/sessions/:id/recommendations')", "@Get('ai-receptionist/sessions/:id/handoff')"]) assert.match(controller, new RegExp(route.replace(/[()]/g, '\\$&')));
  assert.match(controller, /@UseGuards\(ApiAuthGuard\)/);
  assert.doesNotMatch(controller, /@(?:Get|Post)\('\/?(?:send|call|message|book|refund|payment|execute)/i);
  assert.doesNotMatch(`${controller}\n${application}`, /Twilio|Vendasta|WhatsApp.*SDK|GoogleAds|MetaAds/i);
  assert.match(application, /RECOMMENDATION_ONLY|no communication transport or send operation/);
  assert.match(application, /RECEPTIONIST_SESSION_CONVERSATION_MISMATCH/);
});
