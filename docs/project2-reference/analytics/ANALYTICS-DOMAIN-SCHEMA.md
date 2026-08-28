# Analytics Domain Schema

## MarketingEvent
organizationId, eventType, occurredAt, source, medium, campaignId, contentId, leadId,
contactId, opportunityId, customerId, revenueAmount, currency, metadata

## AttributionTouch
organizationId, eventId, model, touchType, weight, attributedAmount

## MetricSnapshot
organizationId, metricKey, periodStart, periodEnd, value, currency, status, dimensions

## CohortSnapshot
organizationId, cohortKey, cohortStart, periodNumber, customers, retainedCustomers,
revenue, churnedCustomers

## GrowthRecommendation
organizationId, source, title, finding, evidence, recommendation, expectedImpact,
risk, priority, status

## AnalyticsReport
organizationId, reportType, periodStart, periodEnd, generatedAt, payload, status
