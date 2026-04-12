-- ══════════════════════════════════════════════════════════════
-- CORRECCIÓN: Resolver el error 42P17 "Infinite Recursion"
-- ══════════════════════════════════════════════════════════════

-- 1. Deshabilitar RLS temporalmente
ALTER TABLE perfiles DISABLE ROW LEVEL SECURITY;

-- 2. Eliminar TODAS las políticas existentes en "perfiles" que pueden estar causando el ciclo
-- En Supabase, a menudo se crean políticas de administrador que dicen:
-- "Dejar ver los perfiles si el rol_slug del perfil de mi auth.uid() es admin".
-- ¡Eso hace que perfiles se lea a sí misma mil veces! (Por eso explotó).

DO $$ 
DECLARE
    pol record;
BEGIN
    FOR pol IN 
        SELECT policyname 
        FROM pg_policies 
        WHERE tablename = 'perfiles' AND schemaname = 'public'
    LOOP
        EXECUTE 'DROP POLICY IF EXISTS "' || pol.policyname || '" ON public.perfiles';
    END LOOP;
END $$;

-- 3. Volver a habilitar RLS limpiamente
ALTER TABLE perfiles ENABLE ROW LEVEL SECURITY;

-- 4. Crear la única política segura (y no recursiva)
CREATE POLICY "Permitir leer propio perfil" 
ON perfiles 
FOR SELECT 
TO authenticated 
USING (id = auth.uid());

-- 5. Crear política para que todos los usuarios autenticados puedan ver correos (necesario a veces para vistas) - SEGURA
-- Si detectas que la vista de Roster (Personal) ya no carga a los cajeros, ejecuta este bloque:
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'perfiles'
      AND policyname = 'Permitir leer todos los perfiles a staff'
  ) THEN
    CREATE POLICY "Permitir leer todos los perfiles a staff"
    ON public.perfiles
    FOR SELECT
    TO authenticated
    USING (true);
  END IF;
END $$;
