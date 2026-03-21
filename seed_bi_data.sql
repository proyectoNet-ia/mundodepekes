
-- SCRIPT DE GENERACIÓN DE DATOS MASIVOS PARA BI (30 DÍAS)
-- Incluye gastos diarios para probar rentabilidad

DO $seed$
DECLARE
    v_start_date DATE := CURRENT_DATE - INTERVAL '30 days';
    v_current_d DATE;
    v_client_id UUID;
    v_pkg1_id UUID := gen_random_uuid();
    v_pkg2_id UUID := gen_random_uuid();
    v_pkg3_id UUID := gen_random_uuid();
    v_t_id UUID;
    v_n_id UUID;
    v_daily_sales INTEGER;
    v_sale_hour INTEGER;
    v_sale_minute INTEGER;
    v_sale_timestamp TIMESTAMPTZ;
    v_i INTEGER;
    v_pkg_selector INTEGER;
    v_selected_pkg_id UUID;
    v_selected_pkg_price NUMERIC;
    v_selected_pkg_name TEXT;
    v_selected_pkg_area TEXT;
    v_selected_pkg_duration INTEGER;
BEGIN
    -- 1. Limpiar datos previos
    TRUNCATE sesiones, transacciones, gastos_diarios CASCADE;
    DELETE FROM ninos;
    DELETE FROM clientes;
    DELETE FROM paquetes;

    -- 2. Insertar Paquetes Base
    INSERT INTO paquetes (id, nombre, area, duracion_minutos, precio, activo)
    VALUES 
        (v_pkg1_id, 'Express Pekes', 'Mundo Pekes', 30, 120, true),
        (v_pkg2_id, 'Super Salto', 'Trampolin', 60, 200, true),
        (v_pkg3_id, 'Diversión Total', 'Mixto', 120, 350, true);

    -- 3. Crear Clientes (Tutores) Ficticios
    FOR v_i IN 1..40 LOOP
        v_client_id := gen_random_uuid();
        INSERT INTO clientes (id, nombre, telefono, email, visitas_acumuladas)
        VALUES (v_client_id, 'Cliente Proyectado ' || v_i, '555' || LPAD(v_i::text, 4, '0'), 'test' || v_i || '@pekes.com', floor(random() * 15));

        v_n_id := gen_random_uuid();
        INSERT INTO ninos (id, nombre, edad, cliente_id)
        VALUES (v_n_id, 'Peke ' || v_i, floor(random() * 9) + 2, v_client_id);
    END LOOP;

    -- 4. Generar Operaciones Diarias
    v_current_d := v_start_date;
    WHILE v_current_d <= CURRENT_DATE LOOP
        
        -- A: Insertar Gastos Diarios Aleatorios
        -- Gastos fijos (Nómina) cada 15 días
        IF EXTRACT(DAY FROM v_current_d) IN (15, 30) THEN
            INSERT INTO gastos_diarios (id, fecha, categoria, monto, descripcion)
            VALUES (gen_random_uuid(), v_current_d, 'Sueldos', 1500 + floor(random() * 500), 'Nómina Quincenal Staff');
        END IF;

        -- Gastos variables diarios (Insumos/Servicios)
        INSERT INTO gastos_diarios (id, fecha, categoria, monto, descripcion)
        VALUES (gen_random_uuid(), v_current_d, 'Insumos', 150 + floor(random() * 300), 'Insumos de limpieza y snacks');

        IF EXTRACT(DOW FROM v_current_d) = 1 THEN -- Los lunes se paga renta/luz promediado
            INSERT INTO gastos_diarios (id, fecha, categoria, monto, descripcion)
            VALUES (gen_random_uuid(), v_current_d, 'Servicios', 800 + floor(random() * 200), 'Servicios Semanales (Luz/Internet)');
        END IF;

        -- B: Generar Ventas
        IF EXTRACT(DOW FROM v_current_d) IN (0, 5, 6) THEN
            v_daily_sales := 25 + floor(random() * 20);
        ELSE
            v_daily_sales := 8 + floor(random() * 10);
        END IF;

        FOR v_i IN 1..v_daily_sales LOOP
            SELECT c.id, n.id INTO v_client_id, v_n_id 
            FROM clientes c 
            JOIN ninos n ON n.cliente_id = c.id 
            ORDER BY random() LIMIT 1;
            
            v_pkg_selector := floor(random() * 3);
            IF v_pkg_selector = 0 THEN 
                v_selected_pkg_id := v_pkg1_id; v_selected_pkg_price := 120; v_selected_pkg_name := 'Express Pekes'; v_selected_pkg_area := 'Mundo Pekes'; v_selected_pkg_duration := 30;
            ELSIF v_pkg_selector = 1 THEN 
                v_selected_pkg_id := v_pkg2_id; v_selected_pkg_price := 200; v_selected_pkg_name := 'Super Salto'; v_selected_pkg_area := 'Trampolin'; v_selected_pkg_duration := 60;
            ELSE 
                v_selected_pkg_id := v_pkg3_id; v_selected_pkg_price := 350; v_selected_pkg_name := 'Diversión Total'; v_selected_pkg_area := 'Mixto'; v_selected_pkg_duration := 120;
            END IF;

            v_sale_hour := CASE WHEN random() > 0.3 THEN 15 + floor(random() * 5) ELSE 10 + floor(random() * 5) END;
            v_sale_minute := floor(random() * 60);
            v_sale_timestamp := v_current_d::timestamptz + (v_sale_hour || ' hours ' || v_sale_minute || ' minutes')::interval;

            v_t_id := gen_random_uuid();
            INSERT INTO transacciones (id, cliente_id, total, metodo_pago, fecha)
            VALUES (v_t_id, v_client_id, v_selected_pkg_price, (CASE WHEN random() > 0.6 THEN 'Tarjeta' ELSE 'Efectivo' END), v_sale_timestamp);

            INSERT INTO sesiones (id, transaccion_id, nino_id, paquete_id, hora_inicio, hora_fin, area_actual, estado, created_at)
            VALUES (
                gen_random_uuid(), v_t_id, v_n_id, v_selected_pkg_id, 
                v_sale_timestamp, v_sale_timestamp + (v_selected_pkg_duration || ' minutes')::interval, 
                v_selected_pkg_area, 'finalizada', v_sale_timestamp
            );
        END LOOP;

        v_current_d := v_current_d + 1;
    END LOOP;

END $seed$;
