-- ══════════════════════════════════════════════════════════════
-- MIGRACIÓN: Paquetes Públicos vs Privados + Áreas Normalizadas
-- Ejecutar en Supabase SQL Editor
-- ══════════════════════════════════════════════════════════════

-- 1. Agregar columna es_privado (false = público, true = privado/evento)
ALTER TABLE paquetes
  ADD COLUMN IF NOT EXISTS es_privado BOOLEAN DEFAULT false NOT NULL;

-- 2. Normalizar nombres de área a los 3 valores oficiales del negocio
UPDATE paquetes SET area = 'Mundo de Pekes'  WHERE area IN ('Mundo Pekes', 'MundoPekes', 'General', 'general');
UPDATE paquetes SET area = 'Trampolín Park'  WHERE area IN ('Trampolin', 'Trampolín', 'Trampolin Park', 'trampolinpark');
UPDATE paquetes SET area = 'Área Mixta'      WHERE area IN ('Mixto', 'Area Mixta', 'Mixta', 'mixto');

-- 3. Mover paquetes de "Eventos" a privados con el área que corresponda
--    (ajusta el área si tus paquetes de eventos son de un área específica)
UPDATE paquetes
  SET es_privado = true,
      area = 'Mundo de Pekes'   -- Cambiar si tus eventos aplican a otra área
  WHERE area IN ('Eventos', 'Cumpleaños', 'evento', 'eventos');

-- 4. Actualizar RLS: el portal público solo ve paquetes activos Y públicos
DROP POLICY IF EXISTS "Público puede leer paquetes activos" ON paquetes;
CREATE POLICY "Público puede leer paquetes activos"
  ON paquetes FOR SELECT
  TO anon
  USING (activo = true AND es_privado = false);

-- ══════════════════════════════════════════════════════════════
-- VERIFICACIÓN
-- ══════════════════════════════════════════════════════════════
-- Paquetes públicos (visibles en portal):
-- SELECT id, nombre, area, precio, es_privado FROM paquetes WHERE activo = true AND es_privado = false;

-- Paquetes privados (solo en caja):
-- SELECT id, nombre, area, precio, es_privado FROM paquetes WHERE activo = true AND es_privado = true;

-- Distribución de áreas (debe ser solo 3 valores):
-- SELECT area, count(*) FROM paquetes GROUP BY area;
