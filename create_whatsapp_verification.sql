-- ══════════════════════════════════════════════════════════════
-- MIGRACIÓN: Sistema de Verificación de WhatsApp
-- ══════════════════════════════════════════════════════════════

-- 1. Crear tabla de verificaciones
CREATE TABLE IF NOT EXISTS verificaciones_whatsapp (
  id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at       TIMESTAMPTZ DEFAULT now() NOT NULL,
  telefono         TEXT NOT NULL,
  codigo           TEXT NOT NULL,
  intentos         INTEGER DEFAULT 0 NOT NULL,
  verificado       BOOLEAN DEFAULT false NOT NULL,
  expires_at       TIMESTAMPTZ NOT NULL,
  
  -- Para evitar spam, limitamos por IP o por teléfono si es necesario
  ip_address       TEXT
);

-- 2. Índices para limpieza y búsqueda rápida
CREATE INDEX IF NOT EXISTS idx_verificaciones_telefono ON verificaciones_whatsapp(telefono, created_at DESC);

-- 3. RLS: Permitir que anon cree verificaciones (INSERT) y lea su propia verificación (SELECT)
ALTER TABLE verificaciones_whatsapp ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Cualquiera puede iniciar una verificacion"
  ON verificaciones_whatsapp FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY "Solo se puede leer la propia verficacion activa"
  ON verificaciones_whatsapp FOR SELECT
  TO anon
  USING (verificado = false AND expires_at > now());

-- 4. Función de limpieza automática (opcional, se puede correr manual)
-- DELETE FROM verificaciones_whatsapp WHERE expires_at < now();

-- 5. Actualizar la tabla de clientes para guardar el estatus verificado
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS whatsapp_verificado BOOLEAN DEFAULT false;
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS whatsapp_verificado_at TIMESTAMPTZ;

-- 6. Actualizar preventas para reflejar estatus de verificación
ALTER TABLE preventas ADD COLUMN IF NOT EXISTS telefono_verificado BOOLEAN DEFAULT false;
