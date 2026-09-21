-- ══════════════════════════════════════════════════════════════
-- MIGRACIÓN 17: Índices Ligeros de Alta Velocidad (Sin Bloqueos)
-- ══════════════════════════════════════════════════════════════

-- BLOQUE 1: MONITOR OPERATIVO Y PREVENTAS (CRÍTICO)
CREATE INDEX IF NOT EXISTS idx_sesiones_estado_hora ON public.sesiones (estado, hora_inicio DESC);
CREATE INDEX IF NOT EXISTS idx_sesiones_nino_transaccion ON public.sesiones (nino_id, transaccion_id);
CREATE INDEX IF NOT EXISTS idx_transacciones_privado_fecha ON public.transacciones (es_privado, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_preventas_estado_expires ON public.preventas (estado, expires_at);

-- BLOQUE 2: CAMPANA, FIRMAS E INVENTARIO
CREATE INDEX IF NOT EXISTS idx_notificaciones_read_created ON public.notificaciones (read, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_solicitudes_estado_created ON public.solicitudes_autorizacion (estado, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_movimientos_tipo_created ON public.movimientos_inventario (tipo, created_at DESC);

-- BLOQUE 3: CUMPLEAÑOS Y CLIENTES
CREATE INDEX IF NOT EXISTS idx_cumpleanos_estado_fecha ON public.eventos_cumpleanos (estado, fecha_evento);
CREATE INDEX IF NOT EXISTS idx_ninos_cumpleanos_rel ON public.ninos_cumpleanos (cumpleanos_id);
CREATE INDEX IF NOT EXISTS idx_ninos_cliente_id ON public.ninos (cliente_id);
CREATE INDEX IF NOT EXISTS idx_clientes_telefono ON public.clientes (telefono);
CREATE INDEX IF NOT EXISTS idx_arqueos_estado_apertura ON public.arqueos_caja (estado, fecha_apertura DESC);
