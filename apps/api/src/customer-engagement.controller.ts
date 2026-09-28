import { Body, Controller, ForbiddenException, Get, Inject, Param, Post, Req, UseGuards } from '@nestjs/common';
import { authorize } from '@platform/auth';
import type { Permission, TenantContext } from '@platform/contracts';
import type { ConversationIngressEvent } from '@platform/marketing-os-core';

import { ApiAuthGuard, getAuthContext, type AuthenticatedRequest } from './auth.guard.js';
import { CUSTOMER_ENGAGEMENT_APPLICATION_SERVICE, CustomerEngagementApplicationService } from './customer-engagement.application.js';

@UseGuards(ApiAuthGuard)
@Controller()
export class CustomerEngagementController {
  constructor(@Inject(CUSTOMER_ENGAGEMENT_APPLICATION_SERVICE) private readonly engagement: CustomerEngagementApplicationService<any>) {}
  @Post('customer-engagement/conversations/ingest') ingest(@Req() request: AuthenticatedRequest, @Body() body: ConversationIngressEvent) { const context = getAuthContext(request); require(context, ['marketing:admin']); return this.engagement.ingest(context, body); }
  @Get('customer-engagement/conversations') conversations(@Req() request: AuthenticatedRequest) { const context = getAuthContext(request); require(context, ['artifact:read']); return this.engagement.listConversations(context); }
  @Get('customer-engagement/conversations/:id') conversation(@Req() request: AuthenticatedRequest, @Param('id') id: string) { const context = getAuthContext(request); require(context, ['artifact:read']); return this.engagement.getConversation(context, id); }
  @Get('customer-engagement/conversations/:id/intents') intents(@Req() request: AuthenticatedRequest, @Param('id') id: string) { const context = getAuthContext(request); require(context, ['artifact:read']); return this.engagement.intents(context, id); }
  @Get('customer-engagement/conversations/:id/signals') signals(@Req() request: AuthenticatedRequest, @Param('id') id: string) { const context = getAuthContext(request); require(context, ['artifact:read']); return this.engagement.signals(context, id); }
  @Get('customer-engagement/conversations/:id/summary') summary(@Req() request: AuthenticatedRequest, @Param('id') id: string) { const context = getAuthContext(request); require(context, ['artifact:read']); return this.engagement.summary(context, id); }
  @Get('customer-engagement/conversations/:id/recommendations') recommendations(@Req() request: AuthenticatedRequest, @Param('id') id: string) { const context = getAuthContext(request); require(context, ['artifact:read']); return this.engagement.recommendations(context, id); }
  @Get('customer-engagement/conversations/:id/diagnostics') diagnostics(@Req() request: AuthenticatedRequest, @Param('id') id: string) { const context = getAuthContext(request); require(context, ['artifact:read', 'audit:read']); return this.engagement.diagnostics(context, id); }
  @Get('customer-engagement/leads/:leadId/engagement') leadEngagement(@Req() request: AuthenticatedRequest, @Param('leadId') leadId: string) { const context = getAuthContext(request); require(context, ['artifact:read']); return { leadId, state: 'UNKNOWN', limitations: ['ASSESSMENT_REQUIRES_EVIDENCE'] }; }
  @Get('customer-engagement/leads/:leadId/journey') journey(@Req() request: AuthenticatedRequest, @Param('leadId') leadId: string) { const context = getAuthContext(request); require(context, ['artifact:read']); return { tenantId: context.tenantId, leadId, unknowns: ['JOURNEY_EVIDENCE_NOT_YET_LINKED'] }; }
  @Get('customer-engagement/handoffs') handoffs(@Req() request: AuthenticatedRequest) { const context = getAuthContext(request); require(context, ['artifact:read']); return this.engagement.handoffs(context); }
  @Get('customer-engagement/follow-ups') followUps(@Req() request: AuthenticatedRequest) { const context = getAuthContext(request); require(context, ['artifact:read']); return this.engagement.followUps(context); }
  @Get('customer-engagement/analytics') analytics(@Req() request: AuthenticatedRequest) { const context = getAuthContext(request); require(context, ['artifact:read', 'audit:read']); return this.engagement.analytics(context); }
  @Post('ai-receptionist/sessions') startSession(@Req() request: AuthenticatedRequest, @Body() body: { sessionId: string; conversationId: string; profileId: string }) { const context = getAuthContext(request); require(context, ['marketing:admin']); return this.engagement.startSession(context, body); }
  @Get('ai-receptionist/sessions/:id') session(@Req() request: AuthenticatedRequest, @Param('id') id: string) { const context = getAuthContext(request); require(context, ['artifact:read']); return this.engagement.getSession(context, id); }
  @Post('ai-receptionist/sessions/:id/events') sessionEvent(@Req() request: AuthenticatedRequest, @Param('id') id: string, @Body() body: ConversationIngressEvent) { const context = getAuthContext(request); require(context, ['marketing:admin']); return this.engagement.ingestSessionEvent(context, id, body); }
  @Get('ai-receptionist/sessions/:id/recommendations') sessionRecommendations(@Req() request: AuthenticatedRequest, @Param('id') id: string) { const context = getAuthContext(request); require(context, ['artifact:read']); return this.engagement.sessionRecommendations(context, id); }
  @Get('ai-receptionist/sessions/:id/handoff') sessionHandoff(@Req() request: AuthenticatedRequest, @Param('id') id: string) { const context = getAuthContext(request); require(context, ['artifact:read']); return this.engagement.sessionHandoff(context, id); }
}
function require(context: TenantContext, permissions: Permission[]): void { try { for (const permission of permissions) authorize(context, permission); } catch (error) { throw new ForbiddenException(error instanceof Error ? error.message : 'Permission denied'); } }
