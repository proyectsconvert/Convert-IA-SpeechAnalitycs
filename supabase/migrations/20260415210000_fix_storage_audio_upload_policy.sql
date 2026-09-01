-- La política anterior exigía EXISTS sobre public.accounts; la RLS de accounts
-- solo deja ver filas donde el usuario tiene membresía (o es superadmin de perfil).
-- user_has_account_access() puede ser true sin poder hacer SELECT de esa fila en accounts,
-- y la subida a Storage fallaba con 400 aunque el acceso lógico fuera correcto.
--
-- Validación solo por carpeta (UUID) + user_has_account_access (sin leer accounts).

DROP POLICY IF EXISTS "Account audio upload" ON storage.objects;

CREATE POLICY "Account audio upload"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'audio-files'
  AND (storage.foldername(name))[1] IS NOT NULL
  AND (storage.foldername(name))[1] ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
  AND public.user_has_account_access(
    auth.uid(),
    trim((storage.foldername(name))[1])::uuid
  )
);
