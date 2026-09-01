DO $$
DECLARE
  new_user_id uuid;
  acct_id uuid;
BEGIN
  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at, confirmation_token,
    raw_app_meta_data, raw_user_meta_data
  ) VALUES (
    '00000000-0000-0000-0000-000000000000',
    gen_random_uuid(),
    'authenticated',
    'authenticated',
    'nuevpro2020@gmail.com',
    crypt('Harold123*', gen_salt('bf')),
    now(), now(), now(), '',
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Super Admin"}'::jsonb
  ) RETURNING id INTO new_user_id;

  -- Profile is auto-created by trigger, just update it
  UPDATE public.profiles SET is_superadmin = true, full_name = 'Super Admin' WHERE id = new_user_id;

  INSERT INTO public.accounts (id, name, slug, plan, status, max_users, max_processing_minutes, max_storage_gb)
  VALUES (gen_random_uuid(), 'Cuenta Principal', 'cuenta-principal', 'enterprise', 'active', 100, 50000, 500)
  RETURNING id INTO acct_id;

  INSERT INTO public.user_accounts (user_id, account_id, role)
  VALUES (new_user_id, acct_id, 'superadmin');
END;
$$;