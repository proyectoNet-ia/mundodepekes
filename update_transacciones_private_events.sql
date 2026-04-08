-- Update transacciones table to support private event management
ALTER TABLE transacciones ADD COLUMN IF NOT EXISTS es_privado BOOLEAN DEFAULT FALSE;
ALTER TABLE transacciones ADD COLUMN IF NOT EXISTS paquete_id UUID REFERENCES paquetes(id);
ALTER TABLE transacciones ADD COLUMN IF NOT EXISTS event_start_time TIMESTAMP WITH TIME ZONE;
ALTER TABLE transacciones ADD COLUMN IF NOT EXISTS event_end_time TIMESTAMP WITH TIME ZONE;

-- Add index for dashboard performance
CREATE INDEX IF NOT EXISTS idx_transacciones_es_privado ON transacciones(es_privado) WHERE es_privado = true;
CREATE INDEX IF NOT EXISTS idx_transacciones_created_today ON transacciones(created_at) WHERE created_at >= CURRENT_DATE;
