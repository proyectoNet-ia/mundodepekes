-- ══════════════════════════════════════════════════════════════
-- MIGRACIÓN: Trazabilidad de Usuarios en Movimientos de Inventario
-- ══════════════════════════════════════════════════════════════

ALTER TABLE movimientos_inventario
ADD COLUMN IF NOT EXISTS usuario_nombre TEXT DEFAULT 'Sistema / Venta',
ADD COLUMN IF NOT EXISTS usuario_email TEXT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS usuario_rol TEXT DEFAULT NULL;

-- Comentario para documentación
COMMENT ON COLUMN movimientos_inventario.usuario_nombre IS 'Nombre del usuario que realizó o autorizó el movimiento';
COMMENT ON COLUMN movimientos_inventario.usuario_email IS 'Correo del usuario responsable';
COMMENT ON COLUMN movimientos_inventario.usuario_rol IS 'Rol del usuario al momento de ejecutar la acción';
