import {
  billingInvoices,
  billingOrganizationEntitlements,
  billingPayments,
  billingSubscriptions,
  billingUsageCounters,
} from '@platform/db';

import type {
  BillingInvoice,
  BillingPayment,
  BillingSubscription,
  OrganizationEntitlementOverride,
  UsageCounter,
} from '@platform/contracts';

export interface BillingPersistenceDatabase {
  insert: (...args: any[]) => any;
  select: (...args: any[]) => any;
  update: (...args: any[]) => any;
}

function assertTenant(
  requestedTenantId: string,
  resourceTenantId: string,
): void {
  if (!requestedTenantId) {
    throw new Error(
      'Tenant context is required',
    );
  }

  if (
    requestedTenantId !==
    resourceTenantId
  ) {
    throw new Error(
      'Cross-tenant billing access denied',
    );
  }
}

export class BillingStore {
  constructor(
    private readonly db:
      BillingPersistenceDatabase,
  ) {}

  async saveSubscription(
    tenantId: string,
    subscription:
      BillingSubscription,
  ): Promise<void> {
    assertTenant(
      tenantId,
      subscription.tenantId,
    );

    await this.db
      .insert(
        billingSubscriptions,
      )
      .values({
        id: subscription.id,
        tenantId:
          subscription.tenantId,
        planId:
          subscription.planId,
        status:
          subscription.status,
        billingCycle:
          subscription.billingCycle,
        startedAt:
          new Date(
            subscription.startedAt,
          ),
        currentPeriodStart:
          new Date(
            subscription.currentPeriodStart,
          ),
        currentPeriodEnd:
          new Date(
            subscription.currentPeriodEnd,
          ),
        trialEndsAt:
          subscription.trialEndsAt
            ? new Date(
                subscription.trialEndsAt,
              )
            : null,
        cancelledAt:
          subscription.cancelledAt
            ? new Date(
                subscription.cancelledAt,
              )
            : null,
        provider:
          subscription.provider ??
          null,
        providerSubscriptionId:
          subscription.providerSubscriptionId ??
          null,
      });
  }

  async saveOrganizationEntitlement(
    tenantId: string,
    entitlement:
      OrganizationEntitlementOverride,
  ): Promise<void> {
    assertTenant(
      tenantId,
      entitlement.tenantId,
    );

    await this.db
      .insert(
        billingOrganizationEntitlements,
      )
      .values({
        id: entitlement.id,
        tenantId:
          entitlement.tenantId,
        key: entitlement.key,
        value:
          entitlement.value,
        reason:
          entitlement.reason ??
          null,
        expiresAt:
          entitlement.expiresAt
            ? new Date(
                entitlement.expiresAt,
              )
            : null,
      });
  }

  async saveUsage(
    tenantId: string,
    usage: UsageCounter,
  ): Promise<void> {
    assertTenant(
      tenantId,
      usage.tenantId,
    );

    await this.db
      .insert(
        billingUsageCounters,
      )
      .values({
        id: usage.id,
        tenantId:
          usage.tenantId,
        key: usage.key,
        periodStart:
          new Date(
            usage.periodStart,
          ),
        periodEnd:
          new Date(
            usage.periodEnd,
          ),
        used: usage.used,
        limit:
          usage.limit ?? null,
      });
  }

  async saveInvoice(
    tenantId: string,
    invoice: BillingInvoice,
  ): Promise<void> {
    assertTenant(
      tenantId,
      invoice.tenantId,
    );

    await this.db
      .insert(billingInvoices)
      .values({
        id: invoice.id,
        tenantId:
          invoice.tenantId,
        subscriptionId:
          invoice.subscriptionId ??
          null,
        externalInvoiceId:
          invoice.externalInvoiceId ??
          null,
        currency:
          invoice.currency,
        amountDueMinor:
          invoice.amountDueMinor,
        amountPaidMinor:
          invoice.amountPaidMinor,
        status:
          invoice.status,
        issuedAt:
          new Date(
            invoice.issuedAt,
          ),
        dueAt:
          invoice.dueAt
            ? new Date(
                invoice.dueAt,
              )
            : null,
        paidAt:
          invoice.paidAt
            ? new Date(
                invoice.paidAt,
              )
            : null,
      });
  }

  async savePayment(
    tenantId: string,
    payment: BillingPayment,
  ): Promise<void> {
    assertTenant(
      tenantId,
      payment.tenantId,
    );

    await this.db
      .insert(billingPayments)
      .values({
        id: payment.id,
        tenantId:
          payment.tenantId,
        invoiceId:
          payment.invoiceId ??
          null,
        externalPaymentId:
          payment.externalPaymentId ??
          null,
        provider:
          payment.provider ??
          null,
        currency:
          payment.currency,
        amountMinor:
          payment.amountMinor,
        status:
          payment.status,
        occurredAt:
          new Date(
            payment.occurredAt,
          ),
      });
  }
}

export function assertBillingTenant(
  tenantId: string,
  resourceTenantId: string,
): void {
  assertTenant(
    tenantId,
    resourceTenantId,
  );
}
