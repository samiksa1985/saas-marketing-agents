import { pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

export const tenants = pgTable('tenants', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  defaultLocale: varchar('default_locale', { length: 10 }).notNull().default('en'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});
export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id),
  subject: text('subject').notNull(),
  displayName: text('display_name').notNull(),
  preferredLocale: varchar('preferred_locale', { length: 10 }).notNull().default('en'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});
export const engagements = pgTable('engagements', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id),
  name: text('name').notNull(),
  locale: varchar('locale', { length: 10 }).notNull().default('en'),
  status: varchar('status', { length: 32 }).notNull().default('draft'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});
export const artifacts = pgTable('artifacts', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id),
  engagementId: uuid('engagement_id')
    .notNull()
    .references(() => engagements.id),
  translationGroupId: uuid('translation_group_id'),
  language: varchar('language', { length: 2 }).notNull(),
  locale: varchar('locale', { length: 10 }).notNull(),
  status: varchar('status', { length: 40 }).notNull().default('draft'),
  version: text('version').notNull().default('1'),
  contentRef: text('content_ref').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});
export const auditEvents = pgTable('audit_events', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id),
  type: text('type').notNull(),
  actorType: varchar('actor_type', { length: 32 }).notNull(),
  actorId: uuid('actor_id'),
  correlationId: text('correlation_id').notNull(),
  payload: text('payload').notNull(),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).defaultNow().notNull(),
});
