-- WAVE-AB P1: RLS-safe workflow scheduler boundary.
--
-- Workers cannot bypass tenant RLS with BYPASSRLS, ownership, or superuser.
-- Global scheduling instead goes through two narrow owner-controlled
-- SECURITY DEFINER functions with pinned search_path, schema-qualified
-- objects, validated inputs, minimal returned columns, and bounded claim /
-- recovery only. The runtime role receives EXECUTE on exactly these
-- functions; PUBLIC EXECUTE is revoked.

CREATE OR REPLACE FUNCTION public.codecore_claim_workflow_execution(
  p_worker_id varchar(200),
  p_lease_ms integer
) RETURNS TABLE(
  execution_id uuid,
  tenant_id uuid,
  workflow_type varchar(120),
  status varchar(40),
  attempt_count integer,
  lease_expires_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  claimed RECORD;
BEGIN
  IF p_worker_id IS NULL OR btrim(p_worker_id) = '' OR length(p_worker_id) > 200 THEN
    RAISE EXCEPTION 'WORKFLOW_SCHEDULER_WORKER_ID_INVALID';
  END IF;
  IF p_lease_ms IS NULL OR p_lease_ms < 1000 OR p_lease_ms > 3600000 THEN
    RAISE EXCEPTION 'WORKFLOW_SCHEDULER_LEASE_INVALID';
  END IF;

  SELECT e.id, e.tenant_id, e.workflow_type, e.status, e.attempt_count, e.version
  INTO claimed
  FROM public.codecore_workflow_executions AS e
  WHERE e.status IN ('pending', 'retry_scheduled')
    AND e.next_attempt_at <= now()
  ORDER BY e.next_attempt_at, e.id
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  UPDATE public.codecore_workflow_executions AS e
  SET status = 'claimed',
      version = e.version + 1,
      attempt_count = e.attempt_count + 1,
      lease_owner = p_worker_id,
      lease_expires_at = now() + make_interval(secs => p_lease_ms / 1000.0),
      started_at = COALESCE(e.started_at, now()),
      error_code = NULL,
      error_message = NULL
  WHERE e.id = claimed.id AND e.version = claimed.version;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'WORKFLOW_SCHEDULER_CLAIM_STALE';
  END IF;

  INSERT INTO public.codecore_workflow_execution_events (
    tenant_id, execution_id, event_type, actor, reason, payload
  ) VALUES (
    claimed.tenant_id, claimed.id, 'workflow_claimed', p_worker_id, 'Scheduler claim', '{}'::jsonb
  );

  RETURN QUERY
  SELECT claimed.id, claimed.tenant_id, claimed.workflow_type,
         'claimed'::varchar(40), claimed.attempt_count + 1,
         now() + make_interval(secs => p_lease_ms / 1000.0);
END;
$$;

CREATE OR REPLACE FUNCTION public.codecore_recover_expired_workflow_leases()
RETURNS TABLE(execution_id uuid, tenant_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  recovered_ids uuid[];
  recovered_tenants uuid[];
BEGIN
  WITH expired AS (
    SELECT e.id
    FROM public.codecore_workflow_executions AS e
    WHERE e.status IN ('claimed', 'running')
      AND e.lease_expires_at IS NOT NULL
      AND e.lease_expires_at <= now()
    ORDER BY e.lease_expires_at, e.id
    LIMIT 100
    FOR UPDATE SKIP LOCKED
  ),
  updated AS (
    UPDATE public.codecore_workflow_executions AS e
    SET status = 'retry_scheduled',
        version = e.version + 1,
        next_attempt_at = now(),
        lease_owner = NULL,
        lease_expires_at = NULL,
        error_code = 'LEASE_EXPIRED',
        error_message = 'Worker lease expired'
    FROM expired
    WHERE e.id = expired.id
    RETURNING e.id AS updated_id, e.tenant_id AS updated_tenant_id
  )
  SELECT array_agg(updated_id), array_agg(updated_tenant_id)
  INTO recovered_ids, recovered_tenants
  FROM updated;

  IF recovered_ids IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO public.codecore_workflow_execution_events (
    tenant_id, execution_id, event_type, actor, reason, payload
  )
  SELECT t.tenant_id, t.execution_id, 'workflow_recovered', 'system',
         'Expired lease reclaimed', '{}'::jsonb
  FROM (
    SELECT unnest(recovered_ids) AS execution_id,
           unnest(recovered_tenants) AS tenant_id
  ) AS t;

  RETURN QUERY
  SELECT unnest(recovered_ids), unnest(recovered_tenants);
END;
$$;

REVOKE ALL ON FUNCTION public.codecore_claim_workflow_execution(varchar, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.codecore_recover_expired_workflow_leases() FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'codecore_app') THEN
    GRANT EXECUTE ON FUNCTION public.codecore_claim_workflow_execution(varchar, integer) TO codecore_app;
    GRANT EXECUTE ON FUNCTION public.codecore_recover_expired_workflow_leases() TO codecore_app;
  END IF;
END;
$$;
