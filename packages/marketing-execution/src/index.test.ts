import {
  test,
} from 'node:test';

import * as assert
  from 'node:assert/strict';

import {
  buildCampaignExecutionPlan,
  buildContentProductionResult,
  buildCreativeExecutionResult,
  buildSEOExecutionResult,
  createMarketingHandoff,
  MARKETING_AGENT_POLICIES,
  MarketingExecutionError,
  policyForDomain,
} from './index.js';


test(
  'campaign plan is reviewable and requires approval',
  () => {
    const result =
      buildCampaignExecutionPlan({
        tenantId:
          'tenant-a',

        locale:
          'en',

        companyContextId:
          'company-1',

        strategyId:
          'strategy-1',

        goal:
          'Generate qualified enterprise leads',

        audience: [
          'CIO',
          'CMO',
        ],

        offer:
          'Executive workshop',

        channels: [
          'LINKEDIN',
          'LANDING_PAGE',
        ],

        funnelStages: [
          'AWARENESS',
          'CONVERSION',
        ],

        evidence: [
          {
            id:
              'evidence-1',
            sourceType:
              'STRATEGY',
          },
        ],
      });

    assert.equal(
      result.domain,
      'CAMPAIGN',
    );

    assert.equal(
      result.requiresApproval,
      true,
    );

    assert.equal(
      result.status,
      'READY_FOR_REVIEW',
    );

    assert.equal(
      result.assets.length,
      2,
    );
  },
);


test(
  'content detects prohibited claims',
  () => {
    const result =
      buildContentProductionResult(
        {
          tenantId:
            'tenant-a',

          locale:
            'en',

          companyContextId:
            'company-1',

          strategyId:
            'strategy-1',

          brief:
            'Enterprise campaign post',

          audience: [
            'CIO',
          ],

          channel:
            'LINKEDIN',

          funnelStage:
            'CONSIDERATION',

          objective:
            'Generate discovery meetings',

          prohibitedClaims: [
            'guaranteed results',
          ],

          evidence: [
            {
              id:
                'source-1',
              sourceType:
                'KNOWLEDGE_BASE',
            },
          ],
        },
        [
          {
            id:
              'draft-1',

            concept:
              'Enterprise transformation',

            hook:
              'A new approach',

            body:
              'Guaranteed results for every customer.',

            cta:
              'Book a meeting',

            metadata: {
              channel:
                'LINKEDIN',

              funnelStage:
                'CONSIDERATION',
            },
          },
        ],
      );

    assert.equal(
      result.status,
      'DRAFT',
    );

    assert.equal(
      result.qaFlags.some(
        (flag) =>
          flag.code ===
          'PROHIBITED_CLAIM',
      ),
      true,
    );
  },
);


test(
  'creative variants must belong to known concepts',
  () => {
    assert.throws(
      () =>
        buildCreativeExecutionResult(
          {
            tenantId:
              'tenant-a',

            locale:
              'en',

            brandContextId:
              'brand-1',

            strategyId:
              'strategy-1',

            audience: [
              'enterprise buyers',
            ],

            channel:
              'LINKEDIN',

            objective:
              'Lead generation',
          },
          [
            {
              id:
                'concept-1',

              title:
                'Executive insight',

              hook:
                'Reduce complexity',

              visualDirection:
                'Executive infographic',

              formats: [
                '1:1',
              ],
            },
          ],
          [
            {
              id:
                'variant-1',

              conceptId:
                'missing-concept',

              copy:
                'Copy',

              visualDirection:
                'Direction',

              hypothesis:
                'Test',
            },
          ],
        ),
      MarketingExecutionError,
    );
  },
);


test(
  'SEO brief must reference an existing keyword cluster',
  () => {
    assert.throws(
      () =>
        buildSEOExecutionResult(
          {
            tenantId:
              'tenant-a',

            locale:
              'en',

            companyContextId:
              'company-1',

            strategyId:
              'strategy-1',

            products: [
              'AI Marketing OS',
            ],

            targetMarket:
              'Saudi Arabia',
          },
          [
            {
              id:
                'cluster-1',

              topic:
                'AI marketing',

              keywords: [
                'ai marketing platform',
              ],

              intent:
                'COMMERCIAL',

              priority:
                'HIGH',
            },
          ],
          [
            {
              id:
                'brief-1',

              keywordClusterId:
                'cluster-missing',

              title:
                'AI Marketing',

              objective:
                'Organic acquisition',

              recommendedSections: [
                'Overview',
              ],
            },
          ],
          [],
          [],
        ),
      MarketingExecutionError,
    );
  },
);


test(
  'every execution agent is forbidden from direct external publishing',
  () => {
    assert.equal(
      MARKETING_AGENT_POLICIES.length,
      4,
    );

    for (
      const policy
      of MARKETING_AGENT_POLICIES
    ) {
      assert.equal(
        policy.mayPublishExternally,
        false,
      );

      assert.equal(
        policy
          .requiresHumanApprovalForExternalAction,
        true,
      );
    }
  },
);


test(
  'project2 tool boundaries are represented',
  () => {
    assert.deepEqual(
      policyForDomain(
        'CONTENT',
      ).allowedTools,
      [
        'knowledge_base',
        'content_library',
      ],
    );

    assert.equal(
      policyForDomain(
        'SEO',
      ).allowedTools.includes(
        'keyword_research',
      ),
      true,
    );
  },
);


test(
  'cross-domain handoff is machine readable',
  () => {
    const handoff =
      createMarketingHandoff({
        tenantId:
          'tenant-a',

        fromDomain:
          'CAMPAIGN',

        toDomain:
          'CONTENT',

        reason:
          'Campaign requires channel content',

        artifactIds: [
          'campaign-plan-1',
        ],

        requiredInputs: [
          'brief',
          'channel',
          'funnel_stage',
        ],
      });

    assert.equal(
      handoff.toDomain,
      'CONTENT',
    );

    assert.equal(
      handoff.requiredInputs.length,
      3,
    );
  },
);
