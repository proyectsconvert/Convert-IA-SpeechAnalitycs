
UPDATE auth.users 
SET 
  phone = COALESCE(phone, ''),
  recovery_token = COALESCE(recovery_token, ''),
  confirmation_token = COALESCE(confirmation_token, ''),
  reauthentication_token = COALESCE(reauthentication_token, '')
WHERE email = 'nuevpro2020@gmail.com';
