-- ══════════════════════════════════════════════════════════════
-- MIGRACIÓN 14: Limpieza de Notificaciones y Solicitudes Atendidas
-- Marca como leídas las notificaciones viejas y finaliza solicitudes huérfanas
-- ══════════════════════════════════════════════════════════════

-- 1. Marcar como leídas todas las notificaciones pendientes anteriores
UPDATE public.notificaciones
SET read = true
WHERE read = false;

-- 2. Finalizar solicitudes de autorización que hayan quedado en estado 'pendiente' antiguas (> 1 hora)
UPDATE public.solicitudes_autorizacion
SET estado = 'aprobada'
WHERE estado = 'pendiente' 
AND created_at < NOW() - INTERVAL '1 hour';
