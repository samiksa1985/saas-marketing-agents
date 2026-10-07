/**
 * Database-backed authoritative tenant membership resolver (WS-PROD-04).
 *
 * Runs as the application's runtime database identity. The claimed tenant id
 * never grants anything by itself: it scopes the RLS transaction so the
 * membership row can only ever be read within the tenant being claimed, and
 * the row's role + role_permissions become the ONLY role/permission source.
 */
import type { TenantMembershipResolver, TenantMembership } from '@platform/auth/membership';
import { CANONICAL_PERMISSIONS, CANONICAL_ROLES, type Permission, type Role } from '@platform/contracts';
import { withTenantScope, type TenantScopedTransactionRunner, type TenantScopedTransaction } from '@platform/db';
import { sql } from 'drizzle-orm';

interface UserRow {
  id: string;
}
interface MembershipRow {
  role_id: string;
  status: string;
}
interface RoleRow {
  name: string;
}
interface PermissionRow {
  name: string;
}

function rows<T>(value: unknown): T[] {
  return Array.from(value as Iterable<T>);
}

export class DatabaseTenantMembershipResolver<TTransaction extends TenantScopedTransaction>
  implements TenantMembershipResolver
{
  constructor(
    private readonly runner: TenantScopedTransactionRunner<TTransaction>,
  ) {}

  async resolve(subject: string, claimedTenantId: string): Promise<TenantMembership | null> {
    if (!subject.trim() || !claimedTenantId.trim()) return null;
    // Tenant ids are UUIDs; anything else cannot match tenant_members anyway.
    if (!/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(claimedTenantId)) {
      return null;
    }

    // The claimed tenant id scopes the RLS transaction. If the subject has no
    // active membership in that tenant, no rows are visible and resolution
    // fails closed — arbitrary tenant selection is impossible.
    return withTenantScope(this.runner, claimedTenantId, async (tx) => {
      const user = rows<UserRow>(
        await tx.execute(sql`SELECT id::text AS id FROM users WHERE subject = ${subject}`),
      )[0];
      if (!user) return null; // provisioning policy: pre-provisioned users only

      const membership = rows<MembershipRow>(
        await tx.execute(
          sql`SELECT role_id::text AS role_id, status FROM tenant_members
              WHERE user_id = ${user.id}::uuid AND tenant_id = ${claimedTenantId}::uuid`,
        ),
      )[0];
      if (!membership || membership.status !== 'active') return null;

      // WS-PROD-10: tenant lifecycle is an authoritative suspension boundary.
      // Suspended/offboarding/offboarded tenants fail closed even when the
      // membership row is still active; prior sessions cannot bypass it.
      const tenant = rows<{ lifecycle: string }>(
        await tx.execute(
          sql`SELECT lifecycle FROM tenants WHERE id = ${claimedTenantId}::uuid`,
        ),
      )[0];
      if (tenant && ['SUSPENDED', 'OFFBOARDING', 'OFFBOARDED'].includes(tenant.lifecycle)) {
        return null;
      }

      const role = rows<RoleRow>(
        await tx.execute(sql`SELECT name FROM roles WHERE id = ${membership.role_id}::uuid`),
      )[0];
      if (!role || !(CANONICAL_ROLES as readonly string[]).includes(role.name)) return null;

      const permissionNames = rows<PermissionRow>(
        await tx.execute(
          sql`SELECT p.name FROM role_permissions rp
              JOIN permissions p ON p.id = rp.permission_id
              WHERE rp.role_id = ${membership.role_id}::uuid`,
        ),
      ).map((row) => row.name);

      return {
        tenantId: claimedTenantId,
        role: role.name as Role,
        permissions: permissionNames.filter((name): name is Permission =>
          (CANONICAL_PERMISSIONS as readonly string[]).includes(name),
        ),
      };
    });
  }
}
