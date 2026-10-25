-- POL-01 D1 (recette REG-F3): remove integration-test rows leaked into kfit_dev before the test guard existed.
-- Review in DBeaver against the LOCAL kfit_dev database only. Not run by any script or agent.
-- 1. Run as is: it lists what would go, deletes inside the transaction, shows what remains, then ROLLBACK (nothing changes).
-- 2. If the lists match what you expect, replace the final ROLLBACK by COMMIT and run again.
-- Converted requests (with a subscription) are never touched: they are listed and kept.

BEGIN;

CREATE TEMP TABLE pol01_services ON COMMIT DROP AS
  SELECT id FROM services WHERE name IN ('Integration test service', 'Integration Test');

CREATE TEMP TABLE pol01_requests ON COMMIT DROP AS
  SELECT r.id, r.prospect_id FROM service_requests r
  WHERE (r.service_id IN (SELECT id FROM pol01_services)
     OR r.prospect_id IN (SELECT id FROM prospects WHERE full_name IN ('Integration Test', 'Integration test service')))
    AND NOT EXISTS (SELECT 1 FROM subscriptions s WHERE s.source_request_id = r.id);

CREATE TEMP TABLE pol01_prospects ON COMMIT DROP AS
  SELECT p.id FROM prospects p
  WHERE (p.full_name IN ('Integration Test', 'Integration test service') OR p.id IN (SELECT prospect_id FROM pol01_requests))
    AND NOT EXISTS (SELECT 1 FROM customers c WHERE c.prospect_id = p.id);

-- What would be removed
SELECT 'service' AS kind, s.id, s.name AS label, s.slug AS detail, s.created_at FROM services s WHERE s.id IN (SELECT id FROM pol01_services)
UNION ALL
SELECT 'request', r.id, r.reference, r.status, r.created_at FROM service_requests r WHERE r.id IN (SELECT id FROM pol01_requests)
UNION ALL
SELECT 'prospect', p.id, p.full_name, p.whatsapp, p.created_at FROM prospects p WHERE p.id IN (SELECT id FROM pol01_prospects)
ORDER BY kind, created_at;

-- Kept on purpose: converted requests on these services (should be 0)
SELECT r.id, r.reference FROM service_requests r
WHERE r.service_id IN (SELECT id FROM pol01_services) AND EXISTS (SELECT 1 FROM subscriptions s WHERE s.source_request_id = r.id);

-- Children first (reverse FK order)
DELETE FROM qualification_reviews WHERE request_id IN (SELECT id FROM pol01_requests);
DELETE FROM waitlist_entries      WHERE request_id IN (SELECT id FROM pol01_requests) OR service_id IN (SELECT id FROM pol01_services);
DELETE FROM contact_attempts      WHERE request_id IN (SELECT id FROM pol01_requests) OR prospect_id IN (SELECT id FROM pol01_prospects);
DELETE FROM service_requests      WHERE id IN (SELECT id FROM pol01_requests);
DELETE FROM prospects p           WHERE p.id IN (SELECT id FROM pol01_prospects)
                                    AND NOT EXISTS (SELECT 1 FROM service_requests r WHERE r.prospect_id = p.id);
DELETE FROM service_policies      WHERE service_id IN (SELECT id FROM pol01_services);
DELETE FROM service_components    WHERE service_id IN (SELECT id FROM pol01_services);
DELETE FROM service_variants      WHERE service_id IN (SELECT id FROM pol01_services);
DELETE FROM services s            WHERE s.id IN (SELECT id FROM pol01_services)
                                    AND NOT EXISTS (SELECT 1 FROM service_requests r WHERE r.service_id = s.id)
                                    AND NOT EXISTS (SELECT 1 FROM subscriptions su WHERE su.service_id = s.id);

-- What remains (expected 0 / 0 / 0 unless something was kept above)
SELECT
  (SELECT count(*) FROM services WHERE name IN ('Integration test service', 'Integration Test')) AS services_left,
  (SELECT count(*) FROM prospects WHERE full_name IN ('Integration Test', 'Integration test service')) AS prospects_left,
  (SELECT count(*) FROM service_requests WHERE service_id IN (SELECT id FROM pol01_services)) AS requests_left;

ROLLBACK;
-- COMMIT;
