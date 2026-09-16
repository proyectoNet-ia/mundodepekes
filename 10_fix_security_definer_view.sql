-- ══════════════════════════════════════════════════════════════
-- MIGRACIÓN 10: Corregir advertencia Security Definer View en Supabase
-- Establece security_invoker = true para que la vista respete las políticas RLS
-- ══════════════════════════════════════════════════════════════

-- Opción 1: Aplicar la propiedad security_invoker directamente
ALTER VIEW IF EXISTS public.view_rentabilidad_diaria SET (security_invoker = true);

-- Opción 2: Recrear la vista con security_invoker explícito para máxima compatibilidad
CREATE OR REPLACE VIEW public.view_rentabilidad_diaria
WITH (security_invoker = true)
AS
WITH sales_daily AS (
    SELECT 
        fecha::date as dia,
        SUM(total) as ingresos
    FROM public.transacciones
    WHERE estado = 'pagado'
    GROUP BY fecha::date
),
expenses_daily AS (
    SELECT 
        fecha::date as dia,
        SUM(monto) as egresos
    FROM public.gastos_diarios
    GROUP BY fecha::date
)
SELECT 
    COALESCE(s.dia, e.dia) as dia,
    COALESCE(s.ingresos, 0) as ingresos,
    COALESCE(e.egresos, 0) as egresos,
    (COALESCE(s.ingresos, 0) - COALESCE(e.egresos, 0)) as utilidad_neta
FROM sales_daily s
FULL OUTER JOIN expenses_daily e ON s.dia = e.dia;
