-- ══════════════════════════════════════════════════════════════
-- MIGRACIÓN: Módulo de Reservas — Asignación de Paquete y Costo a Invitados
-- Ejecutar en Supabase SQL Editor
-- ══════════════════════════════════════════════════════════════

-- 1. Agregar columna paquete_id (foreign key a paquetes con delete set null) a ninos_cumpleanos
ALTER TABLE ninos_cumpleanos
  ADD COLUMN IF NOT EXISTS paquete_id UUID REFERENCES paquetes(id) ON DELETE SET NULL;

-- 2. Agregar columna costo_unitario (NUMERIC(10,2)) a ninos_cumpleanos para registrar el precio unitario del paquete
ALTER TABLE ninos_cumpleanos
  ADD COLUMN IF NOT EXISTS costo_unitario NUMERIC(10,2) DEFAULT 0;
