-- Reparación final de esquemas en Supabase Auth
-- Algunos tokens internos de GoTrue no admiten valores nules tras una inserción directa por SQL.

UPDATE auth.users
SET 
  confirmation_token = COALESCE(confirmation_token, ''),
  email_change = COALESCE(email_change, ''),
  email_change_token_new = COALESCE(email_change_token_new, ''),
  recovery_token = COALESCE(recovery_token, '')
WHERE email LIKE '%_roster@mundodepekes.com';
