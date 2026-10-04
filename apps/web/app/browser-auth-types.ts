export interface BrowserAuthTenantChoice {
  id: string;
  name: string;
}

export interface BrowserAuthSession {
  authenticated: boolean;
  tenantId?: string;
  csrfToken?: string;
  permissions?: string[];
  tenants?: BrowserAuthTenantChoice[];
}
