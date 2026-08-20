DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'tenant_members', 'engagements', 'workflows', 'workflow_graph_snapshots', 'tasks', 'task_attempts',
    'execution_leases', 'artifacts', 'artifact_versions', 'artifact_validations', 'handoffs',
    'handoff_decisions', 'approval_requests', 'approval_decisions', 'audit_events'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('CREATE POLICY %I_tenant_isolation ON %I USING (tenant_id = NULLIF(current_setting(''app.tenant_id'', true), '''')::uuid) WITH CHECK (tenant_id = NULLIF(current_setting(''app.tenant_id'', true), '''')::uuid)', table_name, table_name);
  END LOOP;
END $$;