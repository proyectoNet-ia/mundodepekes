-- ══════════════════════════════════════════════════════════════
-- MIGRACIÓN 16: Asegurar Realtime, Broadcast y Cancelación de Firmas
-- Habilita sincronización instantánea y gestión limpia de estados
-- ══════════════════════════════════════════════════════════════

-- 1. Habilitar Replica Identity Full para actualizaciones completas
ALTER TABLE IF EXISTS public.solicitudes_autorizacion REPLICA IDENTITY FULL;
ALTER TABLE IF EXISTS public.notificaciones REPLICA IDENTITY FULL;

-- 2. Asegurar que ambas tablas estén en la publicación supabase_realtime
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
    AND tablename = 'solicitudes_autorizacion'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.solicitudes_autorizacion;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
    AND tablename = 'notificaciones'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notificaciones;
  END IF;
END $$;

-- 3. Habilitar y actualizar Row Level Security (RLS)
ALTER TABLE IF EXISTS public.solicitudes_autorizacion ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.notificaciones ENABLE ROW LEVEL SECURITY;

-- Políticas para solicitudes_autorizacion
DROP POLICY IF EXISTS "Auth All Solicitudes Autorizacion" ON public.solicitudes_autorizacion;
CREATE POLICY "Auth All Solicitudes Autorizacion" ON public.solicitudes_autorizacion
FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Anon Select Solicitudes Autorizacion" ON public.solicitudes_autorizacion;
CREATE POLICY "Anon Select Solicitudes Autorizacion" ON public.solicitudes_autorizacion
FOR SELECT TO anon USING (true);

-- Políticas para notificaciones
DROP POLICY IF EXISTS "Auth All Notificaciones" ON public.notificaciones;
CREATE POLICY "Auth All Notificaciones" ON public.notificaciones
FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Anon Select Notificaciones" ON public.notificaciones;
CREATE POLICY "Anon Select Notificaciones" ON public.notificaciones
FOR SELECT TO anon USING (true);
