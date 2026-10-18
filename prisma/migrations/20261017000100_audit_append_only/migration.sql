-- Enforce append-only semantics on "AuditEvent" at the database level.
--
-- The application repository layer deliberately exposes no update or delete
-- operation for audit events. This migration makes that a database guarantee
-- rather than an application convention, so a bug or a direct SQL session
-- cannot quietly rewrite history.
--
-- NOTE: this is referential integrity, NOT cryptographic immutability. A
-- superuser can drop this trigger. Sentinel makes no tamper-proofing claim.
-- See docs/limitations.md and docs/security-checklist.md.

CREATE OR REPLACE FUNCTION sentinel_reject_audit_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION
    'AuditEvent is append-only: % is not permitted on this table', TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$;

DROP TRIGGER IF EXISTS audit_event_append_only ON "AuditEvent";

CREATE TRIGGER audit_event_append_only
BEFORE UPDATE OR DELETE ON "AuditEvent"
FOR EACH ROW
EXECUTE FUNCTION sentinel_reject_audit_mutation();
