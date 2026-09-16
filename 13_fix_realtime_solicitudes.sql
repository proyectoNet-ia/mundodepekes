-- ══════════════════════════════════════════════════════════════
-- MIGRACIÓN 13: Habilitar Supabase Realtime en Solicitudes de Autorización
-- Permite que las firmas y aprobaciones remotas fluyan instantáneamente vía WebSockets
-- ══════════════════════════════════════════════════════════════

-- 1. Habilitar Replica Identity Full para notificaciones completas de UPDATE
ALTER TABLE public.solicitudes_autorizacion REPLICA IDENTITY FULL;

-- 2. Asegurar que la tabla esté en la publicación supabase_realtime
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

-- 3. Verificar estado de RLS
ALTER TABLE public.solicitudes_autorizacion ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Auth All Solicitudes Autorizacion" ON public.solicitudes_autorizacion;
CREATE POLICY "Auth All Solicitudes Autorizacion" ON public.solicitudes_autorizacion
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);
