-- P108M1T11: Grade-version ACL closure
-- Revoke direct mutation privileges on public.grade_band_versions from PUBLIC, anon, and authenticated.
-- Preserves SELECT, table ownership, service_role privileges, RLS/policies, and all RPC functions.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.grade_band_versions FROM PUBLIC, anon, authenticated;
