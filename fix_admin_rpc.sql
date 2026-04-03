-- Script para solucionar errores de edición de perfiles en el CMS
-- Despliega este código en la sección "SQL Editor" de Supabase de tu proyecto
-- Otorga a tu backend la capacidad de actualizar credenciales fuertemente encriptadas.

CREATE OR REPLACE FUNCTION admin_update_user_auth(
  target_user_id UUID,
  new_email TEXT DEFAULT NULL,
  new_password TEXT DEFAULT NULL
) 
RETURNS void AS $$
BEGIN
  -- 1. Si se define un nuveo correo, actualizar el usuario previemamente verificado
  IF new_email IS NOT NULL AND new_email != '' THEN
    UPDATE auth.users 
    SET email = new_email, 
        email_change = new_email, 
        updated_at = NOW()
    WHERE id = target_user_id;
  END IF;

  -- 2. Si se define una nueva contraseña, generar un cifrado tipo bcrypt
  IF new_password IS NOT NULL AND new_password != '' THEN
    UPDATE auth.users 
    SET encrypted_password = crypt(new_password, gen_salt('bf')), 
        updated_at = NOW()
    WHERE id = target_user_id;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Garantiza que al menos los gerentes o el backend puedan usarla de forma autenticada
GRANT EXECUTE ON FUNCTION admin_update_user_auth TO authenticated;
