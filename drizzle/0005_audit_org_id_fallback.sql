-- The phase-1 domain tables carry their tenant in `org_id`, while the auth
-- tables use `organization_id`. Teach the audit trigger's org fallback both
-- spellings so context-less writes (migrations, fixtures, system jobs) are
-- still attributed to the right organization.

CREATE OR REPLACE FUNCTION audit_row_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_org text := nullif(current_setting('app.org_id', true), '');
  v_actor text := nullif(current_setting('app.user_id', true), '');
  v_before jsonb;
  v_after jsonb;
  v_entity_id text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_after := to_jsonb(NEW);
  ELSIF TG_OP = 'UPDATE' THEN
    v_before := to_jsonb(OLD);
    v_after := to_jsonb(NEW);
  ELSE
    v_before := to_jsonb(OLD);
  END IF;

  IF v_org IS NULL THEN
    v_org := coalesce(
      v_after ->> 'org_id',
      v_before ->> 'org_id',
      v_after ->> 'organization_id',
      v_before ->> 'organization_id'
    );
    IF v_org IS NULL AND TG_TABLE_NAME = 'organizations' THEN
      v_org := coalesce(v_after ->> 'id', v_before ->> 'id');
    END IF;
  END IF;

  v_entity_id := coalesce(v_after ->> 'id', v_before ->> 'id');

  INSERT INTO audit_log (
    org_id, actor_user_id, actor_type, action,
    entity_type, entity_id, before_data, after_data
  )
  VALUES (
    v_org,
    v_actor,
    CASE WHEN v_actor IS NULL THEN 'system' ELSE 'user' END,
    TG_TABLE_NAME || '.' || lower(TG_OP),
    TG_TABLE_NAME,
    v_entity_id,
    audit_redact(v_before),
    audit_redact(v_after)
  );

  RETURN COALESCE(NEW, OLD);
END
$$;
