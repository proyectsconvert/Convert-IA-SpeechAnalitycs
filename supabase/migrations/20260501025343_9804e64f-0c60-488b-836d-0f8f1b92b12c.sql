REVOKE ALL ON FUNCTION public.claim_due_remote_connections(integer, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_due_remote_connections(integer, integer, integer) FROM anon;
REVOKE ALL ON FUNCTION public.claim_due_remote_connections(integer, integer, integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.claim_due_remote_connections(integer, integer, integer) TO service_role;

REVOKE ALL ON FUNCTION public.release_remote_connection_lock(uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.release_remote_connection_lock(uuid, uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.release_remote_connection_lock(uuid, uuid, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.release_remote_connection_lock(uuid, uuid, text) TO service_role;