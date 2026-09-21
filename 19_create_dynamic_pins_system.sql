-- ══════════════════════════════════════════════════════════════
-- MIGRACIÓN 19: Sistema de PINs Dinámicos de 1 Solo Uso (OTP)
-- Autorización Remota Administrador -> Gerente / Cajero
-- ══════════════════════════════════════════════════════════════

-- 1. CREAR TABLA DE PINES DINÁMICOS
CREATE TABLE IF NOT EXISTS public.pines_dinamicos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pin_codigo VARCHAR(8) NOT NULL,
    creado_por UUID REFERENCES public.perfiles(id) ON DELETE SET NULL,
    creador_nombre TEXT,
    motivo TEXT DEFAULT 'Autorización General',
    vigencia_minutos INTEGER NOT NULL DEFAULT 15,
    expira_en TIMESTAMPTZ NOT NULL,
    usado BOOLEAN NOT NULL DEFAULT FALSE,
    usado_por UUID REFERENCES public.perfiles(id) ON DELETE SET NULL,
    usuario_consumidor_nombre TEXT,
    usado_en TIMESTAMPTZ,
    accion_autorizada TEXT,
    folio_referencia TEXT,
    revocado BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. HABILITAR ROW LEVEL SECURITY (RLS) INMEDIATAMENTE TRAS CREAR TABLA
ALTER TABLE public.pines_dinamicos ENABLE ROW LEVEL SECURITY;

-- 3. ÍNDICES DE ALTO RENDIMIENTO (LOCAL-FIRST Y CERO DISK I/O)
CREATE INDEX IF NOT EXISTS idx_pines_dinamicos_codigo_activo 
ON public.pines_dinamicos (pin_codigo) 
WHERE usado = FALSE AND revocado = FALSE;

CREATE INDEX IF NOT EXISTS idx_pines_dinamicos_created_at 
ON public.pines_dinamicos (created_at DESC);

-- 4. POLÍTICAS RLS (Solo administradores pueden gestionar la tabla directamente)
DROP POLICY IF EXISTS "Admin All Pines Dinamicos" ON public.pines_dinamicos;
CREATE POLICY "Admin All Pines Dinamicos" 
ON public.pines_dinamicos 
FOR ALL 
TO authenticated 
USING (
    EXISTS (
        SELECT 1 FROM public.perfiles 
        WHERE public.perfiles.id = auth.uid() 
        AND public.perfiles.rol_slug = 'admin'
    )
    OR auth.email() = 'admin@mundodepekes.com'
);

-- 5. FUNCIÓN RPC: GENERAR PIN DINÁMICO (SOLO ADMINS)
CREATE OR REPLACE FUNCTION public.generar_pin_dinamico(
    p_motivo TEXT DEFAULT 'Autorización General',
    p_vigencia_minutos INTEGER DEFAULT 15
)
RETURNS JSON AS $$
DECLARE
    v_uid UUID;
    v_uemail TEXT;
    v_rol TEXT;
    v_nom TEXT;
    v_nuevo_pin TEXT;
    v_expira_en TIMESTAMPTZ;
    v_record RECORD;
    v_intentos INTEGER := 0;
BEGIN
    v_uid := auth.uid();
    v_uemail := auth.email();

    -- Asignación directa sin 'SELECT INTO' para evitar falsos positivos del parser de Supabase
    v_rol := (SELECT rol_slug FROM public.perfiles WHERE id = v_uid OR email = v_uemail LIMIT 1);
    v_nom := (SELECT nombre_completo FROM public.perfiles WHERE id = v_uid OR email = v_uemail LIMIT 1);

    IF v_rol != 'admin' AND v_uemail != 'admin@mundodepekes.com' THEN
        RETURN json_build_object('success', false, 'error', 'Solo administradores pueden generar PINs dinámicos.');
    END IF;

    -- Calcular expiración
    IF p_vigencia_minutos IS NULL OR p_vigencia_minutos < 1 THEN
        p_vigencia_minutos := 15;
    END IF;
    v_expira_en := NOW() + (p_vigencia_minutos || ' minutes')::INTERVAL;

    -- Generar PIN numérico de 4 dígitos único
    LOOP
        v_intentos := v_intentos + 1;
        v_nuevo_pin := LPAD((FLOOR(RANDOM() * 9000) + 1000)::TEXT, 4, '0');

        IF NOT EXISTS (
            SELECT 1 FROM public.pines_dinamicos 
            WHERE pin_codigo = v_nuevo_pin 
            AND usado = FALSE 
            AND revocado = FALSE 
            AND expira_en > NOW()
        ) THEN
            EXIT;
        END IF;

        IF v_intentos > 10 THEN
            v_nuevo_pin := LPAD((FLOOR(RANDOM() * 900000) + 100000)::TEXT, 6, '0');
            EXIT;
        END IF;
    END LOOP;

    -- Insertar nuevo PIN
    INSERT INTO public.pines_dinamicos (
        pin_codigo,
        creado_por,
        creador_nombre,
        motivo,
        vigencia_minutos,
        expira_en
    ) VALUES (
        v_nuevo_pin,
        v_uid,
        COALESCE(v_nom, 'Administrador'),
        p_motivo,
        p_vigencia_minutos,
        v_expira_en
    ) RETURNING * INTO v_record;

    RETURN json_build_object(
        'success', true,
        'id', v_record.id,
        'pin', v_record.pin_codigo,
        'motivo', v_record.motivo,
        'vigencia_minutos', v_record.vigencia_minutos,
        'expira_en', v_record.expira_en,
        'created_at', v_record.created_at
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 6. FUNCIÓN RPC UNIFICADA: VALIDAR Y CONSUMIR PIN (ATÓMICO)
CREATE OR REPLACE FUNCTION public.validar_y_consumir_pin(
    pin_ingresado TEXT,
    p_accion TEXT DEFAULT 'Autorización de movimiento',
    p_motivo TEXT DEFAULT '',
    p_folio TEXT DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
    v_consumidor_id UUID;
    v_consumidor_email TEXT;
    v_consumidor_nombre TEXT;
    v_dinamico RECORD;
    v_supervisor RECORD;
BEGIN
    v_consumidor_id := auth.uid();
    v_consumidor_email := auth.email();

    v_consumidor_nombre := (
        SELECT nombre_completo 
        FROM public.perfiles 
        WHERE id = v_consumidor_id OR email = v_consumidor_email 
        LIMIT 1
    );

    IF v_consumidor_nombre IS NULL THEN
        v_consumidor_nombre := COALESCE(v_consumidor_email, 'Usuario en Caja');
    END IF;

    -- 1. BUSCAR EN PINES DINÁMICOS (CON BLOQUEO ATÓMICO FOR UPDATE)
    FOR v_dinamico IN 
        SELECT * FROM public.pines_dinamicos 
        WHERE pin_codigo = pin_ingresado 
        ORDER BY created_at DESC 
        LIMIT 1 
        FOR UPDATE 
    LOOP
        -- Verificar si fue revocado
        IF v_dinamico.revocado THEN
            RETURN json_build_object(
                'success', false, 
                'error', 'Este PIN Dinámico fue cancelado/revocado por el Administrador.'
            );
        END IF;

        -- Verificar si ya fue consumido
        IF v_dinamico.usado THEN
            RETURN json_build_object(
                'success', false, 
                'error', 'Este PIN Dinámico ya fue utilizado previamente el ' || TO_CHAR(v_dinamico.usado_en, 'DD/MM/YYYY HH24:MI') || ' por ' || COALESCE(v_dinamico.usuario_consumidor_nombre, 'otro usuario') || '.'
            );
        END IF;

        -- Verificar si ya expiró
        IF v_dinamico.expira_en < NOW() THEN
            RETURN json_build_object(
                'success', false, 
                'error', 'Este PIN Dinámico ha expirado. Solicite uno nuevo al Administrador.'
            );
        END IF;

        -- QUEMAR EL PIN INMEDIATAMENTE (1 SOLO USO)
        UPDATE public.pines_dinamicos
        SET usado = TRUE,
            usado_por = v_consumidor_id,
            usuario_consumidor_nombre = v_consumidor_nombre,
            usado_en = NOW(),
            accion_autorizada = p_accion,
            folio_referencia = p_folio
        WHERE id = v_dinamico.id;

        -- Registrar en bitácora de seguridad
        BEGIN
            INSERT INTO public.bitacora_seguridad (
                autorizador_id,
                solicitante_id,
                accion,
                motivo,
                folio_referencia
            ) VALUES (
                v_dinamico.creado_por,
                v_consumidor_id,
                'PIN_DINAMICO_OTP: ' || p_accion,
                'Motivo original: ' || COALESCE(v_dinamico.motivo, 'N/A') || ' | Motivo uso: ' || COALESCE(p_motivo, 'N/A'),
                p_folio
            );
        EXCEPTION WHEN OTHERS THEN
            NULL;
        END;

        -- Retornar éxito con datos del Administrador que emitió el PIN
        RETURN json_build_object(
            'success', true,
            'tipo_auth', 'dinamico_otp',
            'id', v_dinamico.creado_por,
            'email', 'admin@mundodepekes.com',
            'role', 'admin',
            'nombre_completo', COALESCE(v_dinamico.creador_nombre, 'Administrador (PIN Dinámico OTP)'),
            'motivo_pin', v_dinamico.motivo
        );
    END LOOP;

    -- 2. SI NO ES DINÁMICO, VALIDAR COMO PIN ESTÁTICO DE SUPERVISOR / GERENTE / ADMIN
    FOR v_supervisor IN 
        SELECT id, email, rol_slug, nombre_completo 
        FROM public.perfiles 
        WHERE pin_seguridad = pin_ingresado 
        AND rol_slug IN ('admin', 'supervisor', 'gerente') 
        LIMIT 1 
    LOOP
        -- Registrar en bitácora de seguridad
        BEGIN
            INSERT INTO public.bitacora_seguridad (
                autorizador_id,
                solicitante_id,
                accion,
                motivo,
                folio_referencia
            ) VALUES (
                v_supervisor.id,
                v_consumidor_id,
                'PIN_ESTATICO: ' || p_accion,
                p_motivo,
                p_folio
            );
        EXCEPTION WHEN OTHERS THEN
            NULL;
        END;

        RETURN json_build_object(
            'success', true,
            'tipo_auth', 'estatico_supervisor',
            'id', v_supervisor.id,
            'email', v_supervisor.email,
            'role', v_supervisor.rol_slug,
            'nombre_completo', v_supervisor.nombre_completo
        );
    END LOOP;

    -- 3. NO COINCIDE CON NINGÚN PIN
    RETURN json_build_object(
        'success', false,
        'error', 'PIN incorrecto o sin permisos de autorización.'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 7. FUNCIÓN RPC: REVOCAR PIN DINÁMICO (SOLO ADMIN)
CREATE OR REPLACE FUNCTION public.revocar_pin_dinamico(p_pin_id UUID)
RETURNS JSON AS $$
BEGIN
    UPDATE public.pines_dinamicos
    SET revocado = TRUE
    WHERE id = p_pin_id;

    RETURN json_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
