-- Reparación de Identidades para Usuarios Semilla
-- Ejecuta este script en el SQL Editor para arreglar el "Database error querying schema"

INSERT INTO auth.identities (
  id,
  user_id,
  identity_data,
  provider,
  provider_id,
  last_sign_in_at,
  created_at,
  updated_at
)
SELECT 
  gen_random_uuid(),
  id,
  json_build_object('sub', id, 'email', email),
  'email',
  id::text,
  now(),
  now(),
  now()
FROM auth.users
WHERE email LIKE '%_roster@mundodepekes.com'
  AND id NOT IN (SELECT user_id FROM auth.identities);
