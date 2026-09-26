-- Forward-only repair for tenant-owned Marketing OS tables introduced in 0005.
-- `users` is intentionally not included: it is the global identity record and
-- tenant membership is represented by tenant_members.
DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'marketing_memory_records',
    'marketing_os_plan_snapshots',
    'marketing_outcome_events'
  ] LOOP
    IF to_regclass(format('public.%I', table_name)) IS NULL THEN
      RAISE EXCEPTION 'Expected tenant table % is missing', table_name;
    END IF;

    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('DROP POLICY IF EXISTS %I_tenant_policy ON %I', table_name, table_name);
    EXECUTE format('DROP POLICY IF EXISTS %I_tenant_isolation ON %I', table_name, table_name);
    EXECUTE format(
      'CREATE POLICY %I_tenant_policy ON %I USING (tenant_id = NULLIF(current_setting(''app.tenant_id'', true), '''')::uuid) WITH CHECK (tenant_id = NULLIF(current_setting(''app.tenant_id'', true), '''')::uuid)',
      table_name,
      table_name
    );
  END LOOP;
END $$;
