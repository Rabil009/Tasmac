REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.master_data_audit_log, public.access_audit_log FROM anon, authenticated;
REVOKE ALL ON public.master_data_audit_log, public.access_audit_log FROM anon;
