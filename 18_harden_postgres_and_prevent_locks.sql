-- ══════════════════════════════════════════════════════════════
-- MIGRACIÓN 18: Blindaje de Postgres contra Locks y Saturación de CPU
-- Ejecutar en: Supabase Dashboard → SQL Editor
-- ══════════════════════════════════════════════════════════════

-- 1. CONFIGURACIÓN ANTI-CONEXIONES ZOMBIES
-- Mata automáticamente cualquier transacción colgada o inactiva en 5 segundos
ALTER DATABASE postgres SET idle_in_transaction_session_timeout = '5s';
ALTER DATABASE postgres SET statement_timeout = '10s';

-- 2. ÍNDICES PARCIALES DE ALTA VELOCIDAD (ZERO-COST EN LECTURAS ACTIVAS)

-- A. Monitor de Sesiones Activas (Dashboard)
CREATE INDEX IF NOT EXISTS idx_sesiones_estado_activo_parcial 
    ON public.sesiones (hora_inicio DESC, area_actual) 
    WHERE estado = 'activo';

CREATE INDEX IF NOT EXISTS idx_sesiones_nino_fkey 
    ON public.sesiones (nino_id);

CREATE INDEX IF NOT EXISTS idx_sesiones_transaccion_fkey 
    ON public.sesiones (transaccion_id);

CREATE INDEX IF NOT EXISTS idx_sesiones_paquete_fkey 
    ON public.sesiones (paquete_id);

-- B. Preventas (Evita escaneo secuencial en sondeo de mostrador)
CREATE INDEX IF NOT EXISTS idx_preventas_vigentes_parcial 
    ON public.preventas (expires_at, created_at ASC) 
    WHERE estado = 'pendiente';

-- C. Eventos Privados y Transacciones
CREATE INDEX IF NOT EXISTS idx_transacciones_privadas_parcial 
    ON public.transacciones (created_at DESC) 
    WHERE es_privado = true;

-- D. Niños y Clientes (JOINs relacionales sin Seq Scan)
CREATE INDEX IF NOT EXISTS idx_ninos_cliente_fkey 
    ON public.ninos (cliente_id);

CREATE INDEX IF NOT EXISTS idx_clientes_telefono_busqueda 
    ON public.clientes (telefono);

-- E. Arqueos de Caja Activos
CREATE INDEX IF NOT EXISTS idx_arqueos_abierta_parcial 
    ON public.arqueos_caja (fecha_apertura DESC) 
    WHERE estado = 'abierta';

-- F. Notificaciones y Firmas
CREATE INDEX IF NOT EXISTS idx_solicitudes_pendientes_parcial 
    ON public.solicitudes_autorizacion (created_at DESC) 
    WHERE estado = 'pendiente';

CREATE INDEX IF NOT EXISTS idx_notificaciones_unread_parcial 
    ON public.notificaciones (created_at DESC) 
    WHERE read = false;
