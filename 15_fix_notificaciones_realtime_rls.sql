-- ══════════════════════════════════════════════════════════════
-- MIGRACIÓN 15: Habilitar Realtime y Políticas RLS en Notificaciones
-- Permite que las notificaciones fluyan por WebSockets y se marquen como leídas persistentemente
-- ══════════════════════════════════════════════════════════════

-- 1. Habilitar Replica Identity Full para cambios completos en Notificaciones
ALTER TABLE IF EXISTS public.notificaciones REPLICA IDENTITY FULL;

-- 2. Agregar la tabla notificaciones a la publicación supabase_realtime
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
    AND tablename = 'notificaciones'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notificaciones;
  END IF;
END $$;

-- 3. Habilitar Row Level Security (RLS) en notificaciones
ALTER TABLE IF EXISTS public.notificaciones ENABLE ROW LEVEL SECURITY;

-- 4. Crear política permisiva para usuarios autenticados (SELECT, INSERT, UPDATE, DELETE)
DROP POLICY IF EXISTS "Auth All Notificaciones" ON public.notificaciones;
CREATE POLICY "Auth All Notificaciones" ON public.notificaciones
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

-- 5. Permitir lectura anónima si fuera requerida
DROP POLICY IF EXISTS "Anon Select Notificaciones" ON public.notificaciones;
CREATE POLICY "Anon Select Notificaciones" ON public.notificaciones
FOR SELECT
TO anon
USING (true);

-- 6. Limpieza de notificaciones huérfanas o no leídas antiguas (> 12 horas)
UPDATE public.notificaciones
SET read = true
WHERE read = false
AND created_at < NOW() - INTERVAL '12 hours';

-- 7. Asegurar que solicitudes_autorizacion esté también al día
ALTER TABLE IF EXISTS public.solicitudes_autorizacion REPLICA IDENTITY FULL;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
    AND tablename = 'solicitudes_autorizacion'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.solicitudes_autorizacion;
  END IF;
END $$;
