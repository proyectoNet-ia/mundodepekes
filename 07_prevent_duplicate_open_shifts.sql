-- ══════════════════════════════════════════════════════════════
-- MIGRACIÓN 07: Prevención de Arqueos Duplicados Simultáneos
-- ══════════════════════════════════════════════════════════════

-- 1. Cerrar cualquier arqueo huérfano antes de crear el índice
UPDATE arqueos_caja
SET estado = 'corte_cerrado',
    fecha_cierre = COALESCE(fecha_cierre, NOW())
WHERE estado = 'abierta'
  AND id != (
      SELECT id FROM arqueos_caja 
      WHERE estado = 'abierta' 
      ORDER BY fecha_apertura DESC 
      LIMIT 1
  );

-- 2. Crear índice único condicional para garantizar una sola caja abierta
CREATE UNIQUE INDEX IF NOT EXISTS idx_single_open_cash 
ON arqueos_caja (estado) 
WHERE estado = 'abierta';
