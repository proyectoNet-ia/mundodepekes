-- ══════════════════════════════════════════════════════════════
-- MIGRACIÓN: Programación de Eventos Privados
-- ══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS eventos_programados (
  id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  fecha            DATE NOT NULL DEFAULT CURRENT_DATE,
  nombre_cliente   TEXT NOT NULL,
  total_pesos      NUMERIC(10,2) DEFAULT 0,
  estado           TEXT DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'confirmado', 'cancelado')),
  created_at       TIMESTAMPTZ DEFAULT now()
);

-- Permisos
ALTER TABLE eventos_programados ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff puede gestionar eventos programados" ON eventos_programados FOR ALL TO authenticated USING (true);

-- Función para contar eventos pendientes de hoy
CREATE OR REPLACE FUNCTION get_today_pending_events_count()
RETURNS BIGINT AS $$
  SELECT count(*) FROM eventos_programados 
  WHERE fecha = CURRENT_DATE 
  AND estado = 'pendiente';
$$ LANGUAGE sql STABLE;
