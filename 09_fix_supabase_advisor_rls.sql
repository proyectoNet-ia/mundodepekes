-- ══════════════════════════════════════════════════════════════
-- MIGRACIÓN 09: Corrección de Advertencias de Seguridad Supabase Advisor
-- Habilita Row Level Security (RLS) y crea políticas en tablas públicas
-- ══════════════════════════════════════════════════════════════

-- 1. HABILITAR ROW LEVEL SECURITY (RLS) EN TODAS LAS TABLAS RESTANTES
ALTER TABLE IF EXISTS public.solicitudes_autorizacion ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.eventos_programados ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.inventario ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.movimientos_inventario ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.preventas ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.verificaciones_whatsapp ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.eventos_cumpleanos ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.ninos_cumpleanos ENABLE ROW LEVEL SECURITY;

-- 2. ELIMINAR POLÍTICAS PREVIAS DUPLICADAS PARA EVITAR ERRORES
DROP POLICY IF EXISTS "Auth All Solicitudes Autorizacion" ON public.solicitudes_autorizacion;
DROP POLICY IF EXISTS "Auth All Eventos Programados" ON public.eventos_programados;
DROP POLICY IF EXISTS "Staff puede gestionar eventos programados" ON public.eventos_programados;
DROP POLICY IF EXISTS "Auth All Inventario" ON public.inventario;
DROP POLICY IF EXISTS "Anon Select Inventario" ON public.inventario;
DROP POLICY IF EXISTS "Auth All Movimientos Inventario" ON public.movimientos_inventario;
DROP POLICY IF EXISTS "Auth All Preventas" ON public.preventas;
DROP POLICY IF EXISTS "Anon Insert Preventas" ON public.preventas;
DROP POLICY IF EXISTS "Anon Select Preventas" ON public.preventas;
DROP POLICY IF EXISTS "Auth All Verificaciones WhatsApp" ON public.verificaciones_whatsapp;
DROP POLICY IF EXISTS "Anon Insert Verificaciones" ON public.verificaciones_whatsapp;
DROP POLICY IF EXISTS "Anon Select Verificaciones" ON public.verificaciones_whatsapp;
DROP POLICY IF EXISTS "Auth All Eventos Cumpleanos" ON public.eventos_cumpleanos;
DROP POLICY IF EXISTS "Auth All Ninos Cumpleanos" ON public.ninos_cumpleanos;

-- 3. POLÍTICAS PARA INVENTARIOS
CREATE POLICY "Auth All Inventario" ON public.inventario
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Anon Select Inventario" ON public.inventario
    FOR SELECT TO anon USING (activo = true);

CREATE POLICY "Auth All Movimientos Inventario" ON public.movimientos_inventario
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 4. POLÍTICAS PARA AUTORIZACIONES Y SEGURIDAD
CREATE POLICY "Auth All Solicitudes Autorizacion" ON public.solicitudes_autorizacion
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 5. POLÍTICAS PARA EVENTOS Y CUMPLEAÑOS
CREATE POLICY "Auth All Eventos Programados" ON public.eventos_programados
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Auth All Eventos Cumpleanos" ON public.eventos_cumpleanos
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Auth All Ninos Cumpleanos" ON public.ninos_cumpleanos
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 6. POLÍTICAS PARA PREVENTAS Y PORTAL PÚBLICO
CREATE POLICY "Auth All Preventas" ON public.preventas
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Anon Insert Preventas" ON public.preventas
    FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "Anon Select Preventas" ON public.preventas
    FOR SELECT TO anon USING (true);

CREATE POLICY "Auth All Verificaciones WhatsApp" ON public.verificaciones_whatsapp
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Anon Insert Verificaciones" ON public.verificaciones_whatsapp
    FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "Anon Select Verificaciones" ON public.verificaciones_whatsapp
    FOR SELECT TO anon USING (true);
