-- ══════════════════════════════════════════════════════════════
-- FIX: Política RLS para que el Portal Público lea paquetes
-- El portal corre como usuario "anon" (sin auth).
-- Sin esta política, Supabase devuelve [] vacío silenciosamente.
-- ══════════════════════════════════════════════════════════════

-- 1. Permitir a visitantes anónimos LEER paquetes activos
--    (solo lectura de los campos que el portal necesita)
CREATE POLICY "Público puede leer paquetes activos"
  ON paquetes FOR SELECT
  TO anon
  USING (activo = true);

-- ── VERIFICACIÓN ──────────────────────────────────────────────
-- Después de ejecutar, comprueba que devuelve resultados:
-- SELECT id, nombre, area, duracion_minutos, precio
--   FROM paquetes
--  WHERE activo = true
--  ORDER BY precio ASC;
