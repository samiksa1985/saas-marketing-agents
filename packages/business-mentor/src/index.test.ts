import {
  test,
} from 'node:test';

import * as assert
  from 'node:assert/strict';

import {
  assessDecisionSupport,
  assertMentorTenant,
  buildBusinessMentorResult,
} from './index.js';


test(
  'mentor remains advisory and cannot execute sensitive actions',
  () => {
    const result =
      buildBusinessMentorResult({
        tenantId:
          'tenant-a',

        locale:
          'en',

        businessMetrics: [
          {
            id:
              'metric-1',

            kind:
              'BUSINESS_METRIC',

            label:
              'revenue',

            value:
              100000,
          },
        ],

        pipeline: [
          {
            id:
              'pipeline-1',

            kind:
              'PIPELINE',

            label:
              'pipeline coverage',

            value:
              70,
          },
        ],

        clients: [
          {
            id:
              'client-1',

            kind:
              'CLIENT',

            label:
              'active clients',

            value:
              10,
          },
        ],

        profitability: [
          {
            id:
              'profit-1',

            kind:
              'PROFITABILITY',

            label:
              'gross margin',

            value:
              35,
          },
        ],

        goals: [
          {
            id:
              'goal-1',

            description:
              'Grow profitable revenue',
          },
        ],
      });

    assert.equal(
      result.status,
      'READY',
    );

    assert.equal(
      result.advisoryOnly,
      true,
    );

    assert.equal(
      result.mayExecuteSensitiveActions,
      false,
    );
  },
);


test(
  'mentor returns exact missing context fields',
  () => {
    const result =
      buildBusinessMentorResult({
        tenantId:
          'tenant-a',

        locale:
          'en',

        businessMetrics: [],
        pipeline: [],
        clients: [],
        profitability: [],
        goals: [],
      });

    assert.equal(
      result.status,
      'NEEDS_MORE_CONTEXT',
    );

    assert.deepEqual(
      result.missingFields,
      [
        'business_metrics',
        'pipeline',
        'clients',
        'profitability',
        'goals',
      ],
    );
  },
);


test(
  'mentor requests canonical handoffs instead of performing other agent jobs',
  () => {
    const result =
      buildBusinessMentorResult({
        tenantId:
          'tenant-a',

        locale:
          'en',

        businessMetrics: [],
        pipeline: [],
        clients: [],
        profitability: [],
        goals: [],
      });

    assert.equal(
      result.handoffs.some(
        (handoff) =>
          handoff.targetCapability ===
          'CAP-CFO-PROFITABILITY',
      ),
      true,
    );

    assert.equal(
      result.handoffs.some(
        (handoff) =>
          handoff.targetCapability ===
          'CAP-SALES-INTELLIGENCE',
      ),
      true,
    );
  },
);


test(
  'decision support does not fabricate a winning option',
  () => {
    const result =
      assessDecisionSupport({
        tenantId:
          'tenant-a',

        locale:
          'en',

        decision: {
          id:
            'decision-1',

          question:
            'Should we increase campaign investment?',

          options: [
            'Increase',
            'Maintain',
          ],
        },

        evidence: [],
      });

    assert.equal(
      result.decision.recommendedOption,
      undefined,
    );

    assert.equal(
      result.requiresHumanDecision,
      true,
    );

    assert.deepEqual(
      result.missingFields,
      [
        'decision_evidence',
      ],
    );
  },
);


test(
  'decision support preserves evidence references',
  () => {
    const result =
      assessDecisionSupport({
        tenantId:
          'tenant-a',

        locale:
          'en',

        decision: {
          id:
            'decision-1',

          question:
            'Which commercial priority should management review?',

          options: [
            'Pipeline',
            'Retention',
          ],
        },

        evidence: [
          {
            id:
              'evidence-1',

            kind:
              'PIPELINE',

            label:
              'pipeline coverage',

            value:
              50,
          },
        ],
      });

    assert.deepEqual(
      result.decision.evidenceIds,
      [
        'evidence-1',
      ],
    );
  },
);


test(
  'cross tenant mentor access is denied',
  () => {
    assert.throws(
      () =>
        assertMentorTenant(
          'tenant-a',
          'tenant-b',
        ),
      /Cross-tenant/,
    );
  },
);
