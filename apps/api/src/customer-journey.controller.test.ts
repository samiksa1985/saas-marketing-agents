import * as assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('EPIC11 API is guarded, tenant-scoped, recommendation-only, and has no execution bypass', async () => {
  const controller = await readFile(new URL('../src/customer-journey.controller.ts', import.meta.url), 'utf8');
  const application = await readFile(new URL('../src/customer-journey.application.ts', import.meta.url), 'utf8');
  for (const route of ["@Get('customer-journey/:identityId')", "@Get('customer-journey/:identityId/timeline')", "@Get('customer-journey/:identityId/lifecycle')", "@Get('customer-journey/:identityId/stage')", "@Get('customer-journey/:identityId/blockers')", "@Get('customer-journey/:identityId/next-best-actions')", "@Post('customer-journey/:identityId/next-best-actions/evaluate')", "@Get('customer-journey/:identityId/plan')", "@Get('customer-journey/:identityId/health')", "@Get('customer-journey/:identityId/retention')", "@Get('customer-journey/:identityId/renewal')", "@Get('customer-journey/:identityId/expansion')", "@Get('customer-journey/analytics')"]) assert.match(controller, new RegExp(route.replace(/[()]/g, '\\$&')));
  assert.match(controller, /@UseGuards\(ApiAuthGuard\)/); assert.match(controller, /require\(context, \['marketing:admin'\]\)/); assert.match(controller, /authorize\(context, permission\)/);
  assert.doesNotMatch(controller, /@(Post|Get)\('(send|message|call|book|pay|refund|execute)/);
  assert.match(application, /PersistentCustomerJourneyStore/); assert.match(application, /RECOMMENDATION_ONLY/); assert.doesNotMatch(application, /provider\.send|transport\.send|provider\.execute/);
});
