'use client';

import { useCallback, useEffect, useState } from 'react';
import type { BrowserAuthSession } from './browser-auth-types';

type BrowserAuthControlProps = {
  initialSession: BrowserAuthSession;
  isPilot: boolean;
  locale: 'en-US' | 'ar-SA';
};

export function BrowserAuthControl({ initialSession, isPilot, locale }: BrowserAuthControlProps) {
  const [session, setSession] = useState(initialSession);
  const [error, setError] = useState<string | null>(null);
  const arabic = locale === 'ar-SA';
  const ui = (english: string, arabicText: string) => arabic ? arabicText : english;

  const refresh = useCallback(async () => {
    const response = await fetch('/api/auth/session', { cache: 'no-store' });
    if (!response.ok) throw new Error('session unavailable');
    const value = await response.json() as BrowserAuthSession;
    if (typeof value.authenticated !== 'boolean') throw new Error('invalid session response');
    setSession(value);
  }, []);

  useEffect(() => {
    if (!isPilot) {
      refresh().catch(() => setError(ui('Session status is unavailable.', 'حالة الجلسة غير متاحة.')));
    }
  }, [isPilot, refresh]);

  const changeTenant = async (tenantId: string) => {
    if (!session.csrfToken) return;
    setError(null);
    try {
      const response = await fetch('/api/auth/tenant', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-csrf-token': session.csrfToken },
        body: JSON.stringify({ tenantId }),
      });
      if (!response.ok) throw new Error('tenant change rejected');
      window.location.reload();
    } catch {
      setError(ui('Tenant change failed.', 'تعذر تغيير مساحة العمل.'));
    }
  };

  const logout = async () => {
    if (!session.csrfToken) return;
    setError(null);
    try {
      const response = await fetch('/api/auth/logout', {
        method: 'POST',
        headers: { 'x-csrf-token': session.csrfToken },
      });
      if (!response.ok) throw new Error('logout rejected');
      setSession({ authenticated: false });
      window.location.assign('/');
    } catch {
      setError(ui('Sign-out failed.', 'تعذر تسجيل الخروج.'));
    }
  };

  if (isPilot) {
    return <span className="auth-control__pilot">{ui('Local pilot session', 'جلسة تجريبية محلية')}</span>;
  }
  if (!session.authenticated) {
    const returnTo = typeof window === 'undefined'
      ? '/'
      : `${window.location.pathname}${window.location.search}`;
    return (
      <div className="auth-control">
        <a className="topbar-account" href={`/api/auth/login?returnTo=${encodeURIComponent(returnTo)}`}>
          {ui('Sign in', 'تسجيل الدخول')}
        </a>
        {error ? <span role="status">{error}</span> : null}
      </div>
    );
  }

  return (
    <div className="auth-control">
      <label className="topbar-select">
        <span>{ui('Workspace', 'مساحة العمل')}</span>
        <select
          aria-label={ui('Select workspace', 'اختر مساحة العمل')}
          onChange={(event) => void changeTenant(event.target.value)}
          value={session.tenantId}
        >
          {(session.tenants ?? []).map((tenant) => (
            <option key={tenant.id} value={tenant.id}>{tenant.name}</option>
          ))}
        </select>
      </label>
      <button className="topbar-account" onClick={() => void logout()} type="button">
        {ui('Sign out', 'تسجيل الخروج')}
      </button>
      {error ? <span role="status">{error}</span> : null}
    </div>
  );
}
