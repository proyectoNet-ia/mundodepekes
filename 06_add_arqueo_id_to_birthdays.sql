-- ══════════════════════════════════════════════════════════════
-- MIGRACIÓN: Vincular Cumpleaños a Arqueo de Caja y Guardar Detalle de Extras
-- Ejecutar en Supabase SQL Editor
-- ══════════════════════════════════════════════════════════════

-- 1. Agregar columna arqueo_id (foreign key a arqueos_caja con delete set null) a eventos_cumpleanos
ALTER TABLE eventos_cumpleanos
  ADD COLUMN IF NOT EXISTS arqueo_id UUID REFERENCES arqueos_caja(id) ON DELETE SET NULL;

-- 2. Agregar columna extras_liquidados (JSONB) a eventos_cumpleanos para guardar el detalle de los consumos extras al liquidar
ALTER TABLE eventos_cumpleanos
  ADD COLUMN IF NOT EXISTS extras_liquidados JSONB DEFAULT '[]'::jsonb;

-- 3. Agregar columna cant_ninos (INTEGER) a eventos_cumpleanos para registrar la cantidad total de niños cobrados
ALTER TABLE eventos_cumpleanos
  ADD COLUMN IF NOT EXISTS cant_ninos INTEGER DEFAULT 0;

-- ══════════════════════════════════════════════════════════════
-- VERIFICACIÓN
-- ══════════════════════════════════════════════════════════════
-- SELECT id, nombre_festejado, arqueo_id, extras_liquidados, cant_ninos FROM eventos_cumpleanos LIMIT 5;
