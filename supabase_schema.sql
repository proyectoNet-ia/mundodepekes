
-- 1. Tabla de Configuración de Sistema
CREATE TABLE IF NOT EXISTS config_sistema (
    clave TEXT PRIMARY KEY,
    valor JSONB NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Tabla de Paquetes
CREATE TABLE IF NOT EXISTS paquetes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre TEXT NOT NULL,
    area TEXT NOT NULL,
    duracion_minutos INTEGER NOT NULL,
    precio NUMERIC(10, 2) NOT NULL,
    activo BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Tabla de Clientes (Tutores)
CREATE TABLE IF NOT EXISTS clientes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre TEXT NOT NULL,
    telefono TEXT,
    email TEXT,
    visitas_acumuladas INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Tabla de Niños
CREATE TABLE IF NOT EXISTS ninos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre TEXT NOT NULL,
    edad INTEGER, -- Usaremos 'edad' para consistencia con el seed
    cliente_id UUID REFERENCES clientes(id) ON DELETE CASCADE,
    observaciones TEXT,
    en_lista_negra BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Tabla de Transacciones
CREATE TABLE IF NOT EXISTS transacciones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cliente_id UUID REFERENCES clientes(id),
    total NUMERIC(10, 2) NOT NULL,
    metodo_pago TEXT NOT NULL,
    estado TEXT DEFAULT 'pagado', -- 'pagado', 'cancelado'
    arqueo_id UUID REFERENCES arqueos_caja(id),
    fecha TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Tabla de Sesiones
CREATE TABLE IF NOT EXISTS sesiones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaccion_id UUID REFERENCES transacciones(id),
    nino_id UUID REFERENCES ninos(id),
    paquete_id UUID REFERENCES paquetes(id),
    hora_inicio TIMESTAMPTZ NOT NULL,
    hora_fin TIMESTAMPTZ NOT NULL,
    area_actual TEXT NOT NULL,
    estado TEXT DEFAULT 'activo', -- 'activo', 'finalizado', 'cancelado'
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Habilitar RLS
ALTER TABLE config_sistema ENABLE ROW LEVEL SECURITY;
ALTER TABLE paquetes ENABLE ROW LEVEL SECURITY;
ALTER TABLE clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE ninos ENABLE ROW LEVEL SECURITY;
ALTER TABLE transacciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE sesiones ENABLE ROW LEVEL SECURITY;


-- Políticas de acceso para anon (Desarrollo)
CREATE POLICY "Public Config Access" ON config_sistema FOR ALL USING (true);
CREATE POLICY "Public Paquetes Access" ON paquetes FOR ALL USING (true);
CREATE POLICY "Public Clientes Access" ON clientes FOR ALL USING (true);
CREATE POLICY "Public Ninos Access" ON ninos FOR ALL USING (true);
CREATE POLICY "Public Transacciones Access" ON transacciones FOR ALL USING (true);
CREATE POLICY "Public Sesiones Access" ON sesiones FOR ALL USING (true);

-- 7. Funciones de Fidelización
CREATE OR REPLACE FUNCTION increment_visit_count(client_uuid UUID)
RETURNS void AS $$
BEGIN
    UPDATE clientes
    SET visitas_acumuladas = visitas_acumuladas + 1
    WHERE id = client_uuid;
END;
$$ LANGUAGE plpgsql;

-- 8. Tabla de Arqueos de Caja (Tesorería)
CREATE TABLE IF NOT EXISTS arqueos_caja (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    fecha_apertura TIMESTAMPTZ DEFAULT NOW(),
    fecha_cierre TIMESTAMPTZ,
    monto_inicial NUMERIC(10, 2) NOT NULL DEFAULT 0,
    monto_final_efectivo_esperado NUMERIC(10, 2) DEFAULT 0,
    monto_final_tarjeta_esperado NUMERIC(10, 2) DEFAULT 0,
    monto_final_real NUMERIC(10, 2) DEFAULT 0,
    observaciones TEXT,
    estado TEXT DEFAULT 'abierta', -- 'abierta', 'cerrada'
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 9. Tabla de Gastos Diarios
CREATE TABLE IF NOT EXISTS gastos_diarios (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    fecha TIMESTAMPTZ DEFAULT NOW(),
    categoria TEXT NOT NULL, -- 'Servicios', 'Sueldos', 'Mantenimiento', 'Insumos', 'Otros'
    monto NUMERIC(10, 2) NOT NULL,
    descripcion TEXT,
    arqueo_id UUID REFERENCES arqueos_caja(id),
    tiene_comprobante BOOLEAN DEFAULT false,
    autorizado_por TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE gastos_diarios ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public Gastos Access" ON gastos_diarios FOR ALL USING (true);

-- 10. Vista de Rentabilidad (Opcional para reportes rápidos)
CREATE OR REPLACE VIEW view_rentabilidad_diaria AS
WITH sales_daily AS (
    SELECT 
        fecha::date as dia,
        SUM(total) as ingresos
    FROM transacciones
    WHERE estado = 'pagado'
    GROUP BY fecha::date
),
expenses_daily AS (
    SELECT 
        fecha as dia,
        SUM(monto) as egresos
    FROM gastos_diarios
    GROUP BY fecha
)
SELECT 
    COALESCE(s.dia, e.dia) as dia,
    COALESCE(s.ingresos, 0) as ingresos,
    COALESCE(e.egresos, 0) as egresos,
    (COALESCE(s.ingresos, 0) - COALESCE(e.egresos, 0)) as utilidad_neta
FROM sales_daily s
FULL OUTER JOIN expenses_daily e ON s.dia = e.dia
ORDER BY dia DESC;


-- 11. Función RPC para Salud Financiera (Dashboard BI)
CREATE OR REPLACE FUNCTION get_financial_health_summary()
RETURNS JSON AS $$
DECLARE
    -- Forzamos la fecha de 'hoy' al horario de México
    today_date DATE := (CURRENT_TIMESTAMP AT TIME ZONE 'UTC' AT TIME ZONE 'America/Mexico_City')::DATE;
    fixed_costs_json JSONB;
    fixed_monthly_total NUMERIC := 0;
    ingresos_efectivo NUMERIC := 0;
    ingresos_tarjeta NUMERIC := 0;
    egresos NUMERIC := 0;
    egresos_list JSON;
    resultado JSON;
    active_arqueo_id UUID;
    monto_inicial_arqueo NUMERIC := 0;
BEGIN
    -- 1. Obtener Costos Fijos Mensuales
    SELECT valor INTO fixed_costs_json FROM config_sistema WHERE clave = 'fixed_costs_config';
    IF fixed_costs_json IS NOT NULL THEN
        SELECT SUM((val->>'monto')::NUMERIC) INTO fixed_monthly_total 
        FROM jsonb_array_elements(fixed_costs_json) AS val;
    END IF;

    -- 2. Calcular Ingresos de Hoy (Dividido por método) - Excluyendo Cancelados
    SELECT 
        COALESCE(SUM(total) FILTER (WHERE LOWER(metodo_pago) = 'efectivo'), 0),
        COALESCE(SUM(total) FILTER (WHERE LOWER(metodo_pago) != 'efectivo'), 0)
    INTO ingresos_efectivo, ingresos_tarjeta
    FROM transacciones 
    WHERE (fecha AT TIME ZONE 'UTC' AT TIME ZONE 'America/Mexico_City')::DATE = today_date
    AND estado = 'pagado';

    -- 3. Calcular Egresos de Hoy (Gastos Diarios / Salidas Autorizadas) - Ajustado a Timezone
    SELECT COALESCE(SUM(monto), 0) INTO egresos
    FROM gastos_diarios
    WHERE (fecha AT TIME ZONE 'UTC' AT TIME ZONE 'America/Mexico_City')::DATE = today_date;

    -- 3b. Obtener lista detallada de egresos de hoy
    SELECT COALESCE(json_agg(json_build_object(
        'monto', monto,
        'descripcion', descripcion,
        'categoria', categoria,
        'hora', TO_CHAR(fecha AT TIME ZONE 'UTC' AT TIME ZONE 'America/Mexico_City', 'HH24:MI')
    )), '[]'::json) INTO egresos_list
    FROM (
        SELECT monto, descripcion, categoria, fecha
        FROM gastos_diarios
        WHERE (fecha AT TIME ZONE 'UTC' AT TIME ZONE 'America/Mexico_City')::DATE = today_date
        ORDER BY fecha DESC
    ) sub;

    -- 4. Obtener datos del Arqueo Activo (para el cálculo de efectivo en mano)
    SELECT id, monto_inicial INTO active_arqueo_id, monto_inicial_arqueo
    FROM arqueos_caja
    WHERE estado = 'abierta'
    ORDER BY fecha_apertura DESC
    LIMIT 1;

    -- 5. Construir Respuesta JSON
    resultado := json_build_object(
        'ingresos_efectivo_hoy', ingresos_efectivo,
        'ingresos_tarjeta_hoy', ingresos_tarjeta,
        'egresos_hoy', egresos,
        'egresos_detallados', egresos_list,
        'meta_diaria', COALESCE(fixed_monthly_total / 30, 0),
        'caja_fisica_estimada', (COALESCE(monto_inicial_arqueo, 0) + ingresos_efectivo - egresos),
        'monto_inicial_caja', COALESCE(monto_inicial_arqueo, 0),
        'arqueo_activo_id', active_arqueo_id,
        'tiene_config_fijos', (fixed_costs_json IS NOT NULL)
    );

    RETURN resultado;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
