import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createEmptyICPDefinition,
  validateICPAccount,
  type ICPAccount,
} from './icp-contract.js';

function makeAccount(
  overrides: Partial<ICPAccount> = {},
): ICPAccount {
  return {
    accountId: 'account-001',
    tenantId: 'tenant-001',
    locale: 'en-US',

    name: 'Example Corp',
    website: 'https://example.com',

    region: 'Saudi Arabia',
    sector: 'B2B SaaS',

    stage: 'qualified',
    tier: 'tier_1',

    fit: {
      score: 85,
      confidence: 'high',
      rationale:
        'Strong evidence-backed fit.',
      positiveSignals: [
        'Relevant buying trigger',
      ],
      disqualifiers: [],
      antiICPFlags: [],
      evidenceIds: [
        'evidence-001',
        'evidence-002',
      ],
    },

    evidence: [
      {
        id: 'evidence-001',
        type: 'business-fit',
        claim:
          'Strong target-market fit.',
        source: 'client-crm',
        sourceDate: '2026-08-15',
        status: 'verified',
        confidence: 'high',
      },
      {
        id: 'evidence-002',
        type: 'commercial',
        claim:
          'Relevant commercial need exists.',
        source: 'sales-call',
        sourceDate: '2026-08-16',
        status: 'corroborated',
        confidence: 'high',
      },
    ],

    triggers: [
      {
        id: 'trigger-001',
        family: 'growth',
        signal:
          'Company entered a growth phase.',
        source: 'company-news',
        detectedAt:
          '2026-08-18T00:00:00.000Z',
        confidence: 'high',
      },
      {
        id: 'trigger-002',
        family: 'hiring',
        signal:
          'Hiring for relevant roles.',
        source: 'company-careers',
        detectedAt:
          '2026-08-18T00:00:00.000Z',
        confidence: 'medium',
      },
    ],

    buyerCommittee: [
      {
        role: 'economic_buyer',
        title: 'Chief Revenue Officer',
        status: 'known',
        evidenceIds: [
          'evidence-001',
        ],
      },
      {
        role: 'champion',
        title: 'VP Marketing',
        status: 'hypothesized',
        evidenceIds: [
          'evidence-002',
        ],
      },
    ],

    ownerId: 'seller-001',

    reasonForSelection:
      'High fit, corroborated triggers, and a credible next milestone.',

    confidence: 'high',

    nextMilestone: {
      description:
        'Validate buying committee and business case.',
      owner: 'seller-001',
      status: 'pending',
    },

    suppression: {
      status: 'clear',
      reasons: [],
      checkedAt:
        '2026-08-19T00:00:00.000Z',
      source: 'suppression-system',
    },

    sourceDate: '2026-08-19',

    ...overrides,
  };
}

test(
  'empty ICP definition provides safe unresolved defaults',
  () => {
    const definition =
      createEmptyICPDefinition(
        '2026.08.20',
      );

    assert.equal(
      definition.version,
      '2026.08.20',
    );

    assert.deepEqual(
      definition.accounts,
      [],
    );

    assert.equal(
      definition.evidenceRules
        .minimumIndependentSignalFamilies,
      2,
    );
  },
);

test(
  'valid tier 1 ICP account passes validation',
  () => {
    const definition =
      createEmptyICPDefinition();

    const result =
      validateICPAccount(
        makeAccount(),
        definition.evidenceRules,
      );

    assert.equal(
      result.valid,
      true,
    );

    assert.deepEqual(
      result.issues,
      [],
    );
  },
);

test(
  'tier 1 ICP account fails without owner and independent signals',
  () => {
    const definition =
      createEmptyICPDefinition();

    const account =
      makeAccount();

    delete account.ownerId;

    account.triggers = [
      {
        id: 'trigger-001',
        family: 'growth',
        signal:
          'One trigger only.',
        source:
          'company-news',
        detectedAt:
          '2026-08-18T00:00:00.000Z',
        confidence: 'medium',
      },
    ];

    const result =
      validateICPAccount(
        account,
        definition.evidenceRules,
      );

    assert.equal(
      result.valid,
      false,
    );

    assert.ok(
      result.issues.some(
        (issue) =>
          issue.code ===
          'missing_owner',
      ),
    );

    assert.ok(
      result.issues.some(
        (issue) =>
          issue.code ===
          'insufficient_signals',
      ),
    );
  },
);