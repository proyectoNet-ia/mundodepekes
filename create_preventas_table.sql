-- ══════════════════════════════════════════════════════════════
-- MIGRACIÓN: Portal Público — Tabla de Preventas
-- Ejecutar en Supabase SQL Editor
-- ══════════════════════════════════════════════════════════════

-- 1. Crear la tabla preventas
CREATE TABLE IF NOT EXISTS preventas (
  id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at       TIMESTAMPTZ DEFAULT now() NOT NULL,
  expires_at       TIMESTAMPTZ DEFAULT (now() + interval '30 minutes') NOT NULL,
  estado           TEXT DEFAULT 'pendiente' NOT NULL
                   CHECK (estado IN ('pendiente', 'confirmada', 'expirada', 'cancelada')),

  -- Datos del Tutor (capturados por el cliente desde el portal)
  tutor_nombre     TEXT NOT NULL,
  tutor_telefono   TEXT NOT NULL,
  tutor_email      TEXT,

  -- Array JSON de niños con sus paquetes pre-seleccionados
  -- Estructura: [{ nombre, edad, paquete_id, paquete_nombre, area, duracion_minutos, precio }]
  ninos            JSONB NOT NULL DEFAULT '[]'::jsonb,

  -- Total pre-calculado (el cajero puede ajustar antes de confirmar)
  total_estimado   NUMERIC(10,2) NOT NULL DEFAULT 0,

  -- Referencia opcional al cliente si ya existe en el sistema
  cliente_id       UUID REFERENCES clientes(id) ON DELETE SET NULL
);

-- 2. Índices para el dashboard (solo preventas pendientes recientes)
CREATE INDEX IF NOT EXISTS idx_preventas_estado_fecha
  ON preventas(estado, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_preventas_expires
  ON preventas(expires_at)
  WHERE estado = 'pendiente';

-- 3. Activar Row Level Security
ALTER TABLE preventas ENABLE ROW LEVEL SECURITY;

-- 4. Política: cualquier visitante (anon) puede CREAR una preventa
CREATE POLICY "Clientes pueden crear preventas"
  ON preventas FOR INSERT
  TO anon
  WITH CHECK (true);

-- 5. Política: staff autenticado puede leer, actualizar y cancelar
CREATE POLICY "Staff puede gestionar preventas"
  ON preventas FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- 6. Habilitar Realtime para la tabla (para push al dashboard del cajero)
-- Ejecutar esto SOLO si aún no está habilitado en tu proyecto de Supabase:
-- ALTER PUBLICATION supabase_realtime ADD TABLE preventas;

-- ══════════════════════════════════════════════════════════════
-- VERIFICACIÓN: Comprueba que la tabla se creó correctamente
-- ══════════════════════════════════════════════════════════════
-- SELECT * FROM preventas LIMIT 5;
-- SELECT schemaname, tablename, rowsecurity FROM pg_tables WHERE tablename = 'preventas';
