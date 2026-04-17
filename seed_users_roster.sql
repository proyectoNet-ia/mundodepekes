-- Script de generación de usuarios (Supabase + Perfiles)
-- Asegúrate de ejecutar este script desde el "SQL Editor" de tu Dashboard de Supabase.

DO $$ 
DECLARE
  v_admin_id uuid := gen_random_uuid();
  v_gerente_id uuid := gen_random_uuid();
  v_supervisor_id uuid := gen_random_uuid();
  v_analista_id uuid := gen_random_uuid();
  v_cajero_id uuid := gen_random_uuid();
BEGIN
  -- 1. Insertar en schema AUTH de Supabase para habilitar el Login Real
  INSERT INTO auth.users (
    id, 
    instance_id, 
    aud, 
    role, 
    email, 
    encrypted_password, 
    email_confirmed_at, 
    raw_app_meta_data, 
    raw_user_meta_data, 
    created_at, 
    updated_at
  )
  VALUES 
    (v_admin_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin_roster@mundodepekes.com', crypt('RootAdmin$2026', gen_salt('bf')), NOW(), '{"provider":"email","providers":["email"]}', '{"role":"admin"}', NOW(), NOW()),
    (v_gerente_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'gerente_roster@mundodepekes.com', crypt('Gerente$2026', gen_salt('bf')), NOW(), '{"provider":"email","providers":["email"]}', '{"role":"gerente"}', NOW(), NOW()),
    (v_supervisor_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'supervisor_roster@mundodepekes.com', crypt('Supervisor$2026', gen_salt('bf')), NOW(), '{"provider":"email","providers":["email"]}', '{"role":"supervisor"}', NOW(), NOW()),
    (v_analista_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'analista_roster@mundodepekes.com', crypt('Analista$2026', gen_salt('bf')), NOW(), '{"provider":"email","providers":["email"]}', '{"role":"analista"}', NOW(), NOW()),
    (v_cajero_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'cajero_roster@mundodepekes.com', crypt('Cajero$2026', gen_salt('bf')), NOW(), '{"provider":"email","providers":["email"]}', '{"role":"cajero"}', NOW(), NOW());

  -- 2. Insertar/Actualizar en la tabla Pública de Perfiles
  INSERT INTO public.perfiles (id, email, nombre_completo, rol_slug, pin_seguridad)
  VALUES
    (v_admin_id, 'admin_roster@mundodepekes.com', 'Admin Principal', 'admin', '8492'),
    (v_gerente_id, 'gerente_roster@mundodepekes.com', 'Gerente Operativo', 'gerente', '5193'),
    (v_supervisor_id, 'supervisor_roster@mundodepekes.com', 'Supervisor de Turno', 'supervisor', '7284'),
    (v_analista_id, 'analista_roster@mundodepekes.com', 'Analista de Datos', 'analista', NULL),
    (v_cajero_id, 'cajero_roster@mundodepekes.com', 'Cajero Ventanilla', 'cajero', NULL)
  ON CONFLICT (id) DO UPDATE SET 
    rol_slug = EXCLUDED.rol_slug,
    pin_seguridad = EXCLUDED.pin_seguridad,
    nombre_completo = EXCLUDED.nombre_completo;
    
END $$;
