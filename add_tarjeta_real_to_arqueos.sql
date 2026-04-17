-- Migration: Agregar campo para registro físico de ventas por tarjeta
ALTER TABLE arqueos_caja 
ADD COLUMN IF NOT EXISTS monto_final_tarjeta_real NUMERIC(10, 2) DEFAULT 0;

COMMENT ON COLUMN arqueos_caja.monto_final_tarjeta_real IS 'Monto total en vouchers de tarjeta contado físicamente por el cajero al cierre.';
