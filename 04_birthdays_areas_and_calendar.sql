-- ══════════════════════════════════════════════════════════════
-- MIGRACIÓN: Módulo de Reservas — Paquete y Área en Cumpleaños
-- Ejecutar en Supabase SQL Editor
-- ══════════════════════════════════════════════════════════════

-- 1. Agregar columna paquete_id (foreign key a paquetes con delete set null)
ALTER TABLE eventos_cumpleanos
  ADD COLUMN IF NOT EXISTS paquete_id UUID REFERENCES paquetes(id) ON DELETE SET NULL;

-- 2. Agregar columna area (TEXT) para control directo de disponibilidad
ALTER TABLE eventos_cumpleanos
  ADD COLUMN IF NOT EXISTS area TEXT;

-- 3. Crear índice para optimizar consultas de disponibilidad y traslapes
CREATE INDEX IF NOT EXISTS idx_eventos_cumpleanos_fecha_area
  ON eventos_cumpleanos(fecha_evento, area)
  WHERE estado != 'cancelado';

-- ══════════════════════════════════════════════════════════════
-- VERIFICACIÓN
-- ══════════════════════════════════════════════════════════════
-- SELECT id, nombre_festejado, paquete_id, area, fecha_evento FROM eventos_cumpleanos LIMIT 5;
