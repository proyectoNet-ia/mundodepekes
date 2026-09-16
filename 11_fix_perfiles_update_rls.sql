-- ══════════════════════════════════════════════════════════════
-- MIGRACIÓN 11: Habilitar UPDATE e INSERT en tabla perfiles (RLS)
-- Permite que los administradores editen nombres, roles y PINs de usuarios
-- ══════════════════════════════════════════════════════════════

-- 1. Eliminar políticas restrictivas previas en perfiles si existen
DROP POLICY IF EXISTS "Permitir actualizar perfiles a staff" ON public.perfiles;
DROP POLICY IF EXISTS "Permitir insertar perfiles a staff" ON public.perfiles;
DROP POLICY IF EXISTS "Permitir gestionar perfiles a staff" ON public.perfiles;

-- 2. Crear política para permitir UPDATE en perfiles
CREATE POLICY "Permitir actualizar perfiles a staff"
ON public.perfiles
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

-- 3. Crear política para permitir INSERT en perfiles
CREATE POLICY "Permitir insertar perfiles a staff"
ON public.perfiles
FOR INSERT
TO authenticated
WITH CHECK (true);

-- 4. Crear política para permitir DELETE en perfiles si fuera necesario
CREATE POLICY "Permitir eliminar perfiles a staff"
ON public.perfiles
FOR DELETE
TO authenticated
USING (true);
