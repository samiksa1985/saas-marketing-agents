CREATE TABLE codecore_oidc_login_transactions (
  state_hash char(64) PRIMARY KEY,
  browser_binding_hash char(64) NOT NULL,
  pkce_verifier varchar(128) NOT NULL,
  nonce varchar(255) NOT NULL,
  return_to varchar(512) NOT NULL,
  expires_at timestamptz NOT NULL
);

CREATE INDEX codecore_oidc_login_transactions_expiry_idx
  ON codecore_oidc_login_transactions (expires_at);

CREATE TABLE codecore_web_sessions (
  session_hash char(64) PRIMARY KEY,
  subject varchar(512) NOT NULL,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  csrf_token varchar(128) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz
);

CREATE INDEX codecore_web_sessions_tenant_expiry_idx
  ON codecore_web_sessions (tenant_id, expires_at);

ALTER TABLE codecore_web_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY codecore_web_sessions_tenant_isolation ON codecore_web_sessions
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

REVOKE ALL ON TABLE codecore_oidc_login_transactions, codecore_web_sessions FROM PUBLIC;

CREATE FUNCTION codecore_start_oidc_login(
  p_state_hash char(64),
  p_browser_binding_hash char(64),
  p_pkce_verifier varchar(128),
  p_nonce varchar(255),
  p_return_to varchar(512)
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  DELETE FROM public.codecore_oidc_login_transactions
  WHERE expires_at < now() - interval '1 day';

  INSERT INTO public.codecore_oidc_login_transactions (
    state_hash, browser_binding_hash, pkce_verifier, nonce, return_to, expires_at
  ) VALUES (
    p_state_hash, p_browser_binding_hash, p_pkce_verifier, p_nonce, p_return_to, now() + interval '5 minutes'
  );
END;
$$;

CREATE FUNCTION codecore_consume_oidc_login(
  p_state_hash char(64),
  p_browser_binding_hash char(64)
) RETURNS TABLE(pkce_verifier varchar(128), nonce varchar(255), return_to varchar(512))
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  DELETE FROM public.codecore_oidc_login_transactions
  WHERE state_hash = p_state_hash
    AND browser_binding_hash = p_browser_binding_hash
    AND expires_at > now()
  RETURNING codecore_oidc_login_transactions.pkce_verifier,
    codecore_oidc_login_transactions.nonce,
    codecore_oidc_login_transactions.return_to;
$$;

CREATE FUNCTION codecore_create_web_session(
  p_session_hash char(64),
  p_subject varchar(512),
  p_tenant_id uuid,
  p_csrf_token varchar(128)
) RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  session_expiry timestamptz := now() + interval '8 hours';
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.users AS u
    JOIN public.tenant_members AS tm ON tm.user_id = u.id
    WHERE u.subject = p_subject
      AND tm.tenant_id = p_tenant_id
      AND tm.status = 'active'
  ) THEN
    RETURN NULL;
  END IF;

  DELETE FROM public.codecore_web_sessions
  WHERE expires_at < now() - interval '7 days' OR revoked_at < now() - interval '7 days';

  INSERT INTO public.codecore_web_sessions (
    session_hash, subject, tenant_id, csrf_token, expires_at
  ) VALUES (
    p_session_hash, p_subject, p_tenant_id, p_csrf_token, session_expiry
  );
  RETURN session_expiry;
END;
$$;

CREATE FUNCTION codecore_lookup_web_session(p_session_hash char(64))
RETURNS TABLE(subject varchar(512), tenant_id uuid, csrf_token varchar(128), expires_at timestamptz)
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT s.subject, s.tenant_id, s.csrf_token, s.expires_at
  FROM public.codecore_web_sessions AS s
  WHERE s.session_hash = p_session_hash
    AND s.revoked_at IS NULL
    AND s.expires_at > now();
$$;

CREATE FUNCTION codecore_revoke_web_session(p_session_hash char(64))
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  affected integer;
BEGIN
  UPDATE public.codecore_web_sessions
  SET revoked_at = now()
  WHERE session_hash = p_session_hash
    AND revoked_at IS NULL;
  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected = 1;
END;
$$;

CREATE FUNCTION codecore_rotate_web_session(
  p_old_session_hash char(64),
  p_new_session_hash char(64),
  p_subject varchar(512),
  p_tenant_id uuid,
  p_csrf_token varchar(128)
) RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  affected integer;
  session_expiry timestamptz := now() + interval '8 hours';
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.users AS u
    JOIN public.tenant_members AS tm ON tm.user_id = u.id
    WHERE u.subject = p_subject
      AND tm.tenant_id = p_tenant_id
      AND tm.status = 'active'
  ) THEN
    RETURN NULL;
  END IF;

  UPDATE public.codecore_web_sessions
  SET revoked_at = now()
  WHERE session_hash = p_old_session_hash
    AND subject = p_subject
    AND revoked_at IS NULL
    AND expires_at > now();
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 1 THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.codecore_web_sessions (
    session_hash, subject, tenant_id, csrf_token, expires_at
  ) VALUES (
    p_new_session_hash, p_subject, p_tenant_id, p_csrf_token, session_expiry
  );
  RETURN session_expiry;
END;
$$;

CREATE FUNCTION codecore_list_user_tenants(p_session_hash char(64))
RETURNS TABLE(tenant_id uuid, tenant_name text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT t.id, t.name
  FROM public.codecore_web_sessions AS s
  JOIN public.users AS u ON u.subject = s.subject
  JOIN public.tenant_members AS tm ON tm.user_id = u.id
  JOIN public.tenants AS t ON t.id = tm.tenant_id
  WHERE s.session_hash = p_session_hash
    AND s.revoked_at IS NULL
    AND s.expires_at > now()
    AND tm.status = 'active'
  ORDER BY t.name, t.id;
$$;

REVOKE ALL ON FUNCTION codecore_start_oidc_login(char, char, varchar, varchar, varchar) FROM PUBLIC;
REVOKE ALL ON FUNCTION codecore_consume_oidc_login(char, char) FROM PUBLIC;
REVOKE ALL ON FUNCTION codecore_create_web_session(char, varchar, uuid, varchar) FROM PUBLIC;
REVOKE ALL ON FUNCTION codecore_lookup_web_session(char) FROM PUBLIC;
REVOKE ALL ON FUNCTION codecore_revoke_web_session(char) FROM PUBLIC;
REVOKE ALL ON FUNCTION codecore_rotate_web_session(char, char, varchar, uuid, varchar) FROM PUBLIC;
REVOKE ALL ON FUNCTION codecore_list_user_tenants(char) FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'codecore_app') THEN
    REVOKE ALL ON TABLE codecore_oidc_login_transactions, codecore_web_sessions FROM codecore_app;
    GRANT EXECUTE ON FUNCTION codecore_start_oidc_login(char, char, varchar, varchar, varchar) TO codecore_app;
    GRANT EXECUTE ON FUNCTION codecore_consume_oidc_login(char, char) TO codecore_app;
    GRANT EXECUTE ON FUNCTION codecore_create_web_session(char, varchar, uuid, varchar) TO codecore_app;
    GRANT EXECUTE ON FUNCTION codecore_lookup_web_session(char) TO codecore_app;
    GRANT EXECUTE ON FUNCTION codecore_revoke_web_session(char) TO codecore_app;
    GRANT EXECUTE ON FUNCTION codecore_rotate_web_session(char, char, varchar, uuid, varchar) TO codecore_app;
    GRANT EXECUTE ON FUNCTION codecore_list_user_tenants(char) TO codecore_app;
  END IF;
END;
$$;
