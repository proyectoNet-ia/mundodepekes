-- ══════════════════════════════════════════════════════════════
-- MIGRACIÓN: Endurecimiento de Seguridad (Punto 1.1, 2.2, 2.3, 3.1)
-- IMPORTANTE: Ejecutar en el SQL Editor de Supabase
-- ══════════════════════════════════════════════════════════════

-- 1. Eliminar políticas "Públicas libres" peligrosas (Si existen)
DROP POLICY IF EXISTS "Public Config Access" ON config_sistema;
DROP POLICY IF EXISTS "Public Paquetes Access" ON paquetes;
DROP POLICY IF EXISTS "Public Clientes Access" ON clientes;
DROP POLICY IF EXISTS "Public Ninos Access" ON ninos;
DROP POLICY IF EXISTS "Public Transacciones Access" ON transacciones;
DROP POLICY IF EXISTS "Public Sesiones Access" ON sesiones;
DROP POLICY IF EXISTS "Public Gastos Access" ON gastos_diarios;

-- 2. ASEGURAR QUE RLS ESTÉ HABILITADO EN TODAS LAS TABLAS
ALTER TABLE arqueos_caja ENABLE ROW LEVEL SECURITY;
ALTER TABLE bitacora_auditoria ENABLE ROW LEVEL SECURITY;
ALTER TABLE bitacora_seguridad ENABLE ROW LEVEL SECURITY;
ALTER TABLE perfiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE transacciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE sesiones ENABLE ROW LEVEL SECURITY;
ALTER TABLE clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE ninos ENABLE ROW LEVEL SECURITY;
ALTER TABLE paquetes ENABLE ROW LEVEL SECURITY;
ALTER TABLE config_sistema ENABLE ROW LEVEL SECURITY;
ALTER TABLE gastos_diarios ENABLE ROW LEVEL SECURITY;

-- 3. POLÍTICAS SEGURAS PARA EL PORTAL PÚBLICO (ANON)
-- Solo se puede leer configuración (básica) y paquetes que estén activos. NO SE PUEDE INSERTAR.
CREATE POLICY "Anon Select Paquetes" ON paquetes FOR SELECT TO anon USING (activo = true);
CREATE POLICY "Anon Select Config" ON config_sistema FOR SELECT TO anon USING (clave = 'fixed_costs_config' OR clave = 'receipt_header');

-- 4. POLÍTICAS PARA USUARIOS CON INICIO DE SESIÓN (CAJEROS / SUPERVISORES)
-- Clientes / Ninos / Transacciones / Sesiones / Gastos: Solo para autenticados
CREATE POLICY "Auth All Clientes" ON clientes FOR ALL TO authenticated USING (true);
CREATE POLICY "Auth All Ninos" ON ninos FOR ALL TO authenticated USING (true);
CREATE POLICY "Auth All Transacciones" ON transacciones FOR ALL TO authenticated USING (true);
CREATE POLICY "Auth All Sesiones" ON sesiones FOR ALL TO authenticated USING (true);
CREATE POLICY "Auth All Gastos" ON gastos_diarios FOR ALL TO authenticated USING (true);
CREATE POLICY "Auth All Config" ON config_sistema FOR ALL TO authenticated USING (true);
CREATE POLICY "Auth All Paquetes" ON paquetes FOR ALL TO authenticated USING (true);

-- 5. BLINDAR LA TABLA DE AUDITORÍA (APPEND-ONLY)
-- Nadie puede modificar o eliminar logs, ni siquiera como Auth.
CREATE POLICY "Auth Insert Auditoria" ON bitacora_auditoria FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth Select Auditoria" ON bitacora_auditoria FOR SELECT TO authenticated USING (true);

-- Nadie puede Update/Delete en auditoría
-- (El silencio aquí significa que está Denegado por defecto gracias al RLS)

CREATE POLICY "Auth Insert Bitacora Segura" ON bitacora_seguridad FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth Select Bitacora Segura" ON bitacora_seguridad FOR SELECT TO authenticated USING (true);

-- 6. BLINDAR ARQUEOS DE CAJA (TESORERÍA)
CREATE POLICY "Auth Select Arqueos" ON arqueos_caja FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth Insert Arqueos" ON arqueos_caja FOR INSERT TO authenticated WITH CHECK (true);
-- CRÍTICO: Los cajeros solo pueden hacer UPDATE si la caja ESTÁ ABIERTA o si la están "cerrando" en este instante. No después de cerrada.
-- (Simplificado a autenticados por ahora, la validación estricta será delegada al RPC de cierre de caja en posteriores fases o mantenido al momento del cierre)
CREATE POLICY "Auth Update Arqueos" ON arqueos_caja FOR UPDATE TO authenticated USING (estado = 'abierta');

-- 7. OCULTAR PIN DE EXPOSICIÓN GLOBAL (PERFILES)
-- Los usuarios solo pueden ver su PROPIO perfil directo
CREATE POLICY "Usuarios ven su propio perfil" ON perfiles FOR SELECT TO authenticated USING (id = auth.uid());

-- 8. FUNCIÓN RPC PARA VALIDAR PIN DE MANERA SEGURA EN BACKEND (Evita traer el PIN al cliente js)
CREATE OR REPLACE FUNCTION validar_pin_supervisor(pin_ingresado TEXT)
RETURNS JSON AS $$
DECLARE
    supervisor_record RECORD;
BEGIN
    SELECT * INTO supervisor_record
    FROM public.perfiles
    WHERE pin_seguridad = pin_ingresado 
    AND rol_slug IN ('admin', 'supervisor', 'gerente')
    LIMIT 1;

    IF FOUND THEN
        RETURN json_build_object(
            'id', supervisor_record.id,
            'email', supervisor_record.email,
            'role', supervisor_record.rol_slug,
            'nombre_completo', supervisor_record.nombre_completo
        );
    ELSE
        RETURN NULL;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
-- SECURITY DEFINER permite que la función evada la política RLS momentáneamente (solo para leer el PIN y validarlo).
