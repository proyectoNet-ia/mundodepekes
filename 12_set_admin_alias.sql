-- ══════════════════════════════════════════════════════════════
-- MIGRACIÓN 12: Asignar Alias a Usuarios y Movimientos de Inventario
-- Actualiza nombre_completo / alias en la tabla pública de perfiles
-- y estandariza el autor en el historial de movimientos_inventario.
-- ══════════════════════════════════════════════════════════════

-- 1. Actualizar alias en la tabla pública de perfiles
UPDATE public.perfiles
SET nombre_completo = 'Fernando Admin'
WHERE email = 'admin@mundodepekes.com';

UPDATE public.perfiles
SET nombre_completo = 'Andrea Bañales'
WHERE email = 'admin_roster@mundodepekes.com';

UPDATE public.perfiles
SET nombre_completo = 'Fanny'
WHERE email = 'cajero_roster@mundodepekes.com';

UPDATE public.perfiles
SET nombre_completo = 'Andrea Rodríguez'
WHERE email = 'andrea1@mundodepekes.com';

UPDATE public.perfiles
SET nombre_completo = 'Gerente Operativo'
WHERE email = 'gerente_roster@mundodepekes.com';

UPDATE public.perfiles
SET nombre_completo = 'Supervisor de Turno'
WHERE email = 'supervisor_roster@mundodepekes.com';

UPDATE public.perfiles
SET nombre_completo = 'Analista de Datos'
WHERE email = 'analista_roster@mundodepekes.com';

-- 2. Actualizar movimientos de inventario según el correo o autor genérico
UPDATE public.movimientos_inventario
SET 
  usuario_nombre = 'Fernando Admin',
  usuario_email = COALESCE(usuario_email, 'admin@mundodepekes.com'),
  usuario_rol = COALESCE(usuario_rol, 'admin')
WHERE 
  usuario_email = 'admin@mundodepekes.com'
  OR LOWER(TRIM(usuario_nombre)) IN ('admin', 'administrador');

UPDATE public.movimientos_inventario
SET 
  usuario_nombre = 'Andrea Bañales',
  usuario_rol = COALESCE(usuario_rol, 'admin')
WHERE 
  usuario_email = 'admin_roster@mundodepekes.com';

UPDATE public.movimientos_inventario
SET 
  usuario_nombre = 'Fanny',
  usuario_rol = COALESCE(usuario_rol, 'cajero')
WHERE 
  usuario_email = 'cajero_roster@mundodepekes.com'
  OR LOWER(TRIM(usuario_nombre)) = 'cajero';

-- 3. Movimientos automáticos de ventas previas sin autor explícito
UPDATE public.movimientos_inventario
SET 
  usuario_nombre = 'Venta en Caja',
  usuario_rol = 'cajero'
WHERE 
  usuario_nombre IS NULL 
  AND (LOWER(motivo) LIKE '%venta%' OR LOWER(motivo) LIKE '%consumo%');

-- 4. Cualquier otro movimiento previo sin autor asignar a Administrador
UPDATE public.movimientos_inventario
SET 
  usuario_nombre = 'Fernando Admin',
  usuario_email = COALESCE(usuario_email, 'admin@mundodepekes.com'),
  usuario_rol = COALESCE(usuario_rol, 'admin')
WHERE 
  usuario_nombre IS NULL;

-- 5. Consulta de verificación
SELECT id, email, nombre_completo, rol_slug FROM public.perfiles;
SELECT id, tipo, cantidad, motivo, usuario_nombre, usuario_email, created_at 
FROM public.movimientos_inventario 
ORDER BY created_at DESC 
LIMIT 15;
