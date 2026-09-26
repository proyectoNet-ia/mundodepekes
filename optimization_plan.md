# Plan de Auditoría y Emergencia — Bucle Activo en Corte 26 de Septiembre 2026

## 🚨 1. Diagnóstico de Emergencia en Tiempo Real (Incidente Activo)

### Estado Crítico
El bucle offline en la terminal física de caja (Fanny) **continúa activo e insertando una transacción fantasma de $90.00 cada 30 segundos** en este instante.

### Causa Raíz
1. **Falta de Despliegue a Producción:** Las correcciones de código realizadas ayer en [`src/lib/syncService.ts`](file:///Volumes/Win%20HD/Proyecto%20NET/Mundo%20de%20Pekes/src/lib/syncService.ts) y [`src/lib/salesService.ts`](file:///Volumes/Win%20HD/Proyecto%20NET/Mundo%20de%20Pekes/src/lib/salesService.ts) quedaron en el entorno local y no se subieron al repositorio remoto (`origin/main`).
2. **Persistencia en IndexedDB del Navegador Físico:** La terminal de la cajera no recargó la aplicación ni purgó la base `MundoPekesOffline`, por lo que el bundle antiguo en memoria continuó disparando reintentos infinitos hacia Supabase.

---

## 2. Impacto Cuantitativo en Cortes de Caja (26 Septiembre 2026)

| Arqueo ID | Horario (UTC) | Estado Actual | Transacciones Paulina ($90) | Monto Fantasma Tarjeta | Tarjeta Real Declarada |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `091a2e7f-7103-4b64-b97d-8d04939f5178` | 03:20 – 19:22 | `auditoria` | 41 duplicados | $3,690.00 | $0.00 |
| `e0ad7919-287a-4453-af22-bff6a36b0249` | 19:24 – 21:25 | `auditoria` | 236 duplicados | $21,240.00 | $345.00 |
| `a56a9e53-9066-4d71-8deb-8b0de8a57149` | 21:27 – Activo | `abierta` (En curso) | >96 duplicados y subiendo | >$8,640.00 | En curso |

**Total de transacciones fantasma generadas hoy:** >373 transacciones (más de **$33,570.00 MXN** artificiales).

---

## 3. Plan de Contención y Resolución Inmediata

### Paso 1: Detener la Inserción Inmediatamente (Contención en Terminal)
En el navegador de la sucursal de Fanny:
1. Abrir consola (`F12` > Console).
2. Ejecutar:
   ```javascript
   indexedDB.deleteDatabase('MundoPekesOffline'); location.reload();
   ```

### Paso 2: Blindaje Definitivo en Base de Datos (Supabase SQL)
Crear un candado en la tabla `transacciones` para impedir inserciones repetidas de vouchers ya procesados o duplicados inmediatos:
```sql
CREATE OR REPLACE FUNCTION prevent_duplicate_transactions()
RETURNS TRIGGER AS $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM transacciones
        WHERE cliente_id = NEW.cliente_id
          AND total = NEW.total
          AND metodo_pago = NEW.metodo_pago
          AND fecha > (NOW() - INTERVAL '10 minutes')
    ) THEN
        RAISE EXCEPTION 'Transacción duplicada rechazada por seguridad de auditoría';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

### Paso 3: Limpieza y Conciliación de Arqueos de Hoy (Script de Depuración)
1. Eliminar todas las transacciones duplicadas de Paulina de hoy en los arqueos `091a2e7f`, `e0ad7919` y `a56a9e53`.
2. Recalcular y cerrar los dos arqueos en auditoría con su valor legítimo:
   - Arqueo `091a2e7f`: Tarjeta esperada = **$0.00**, Estado = `corte_cerrado`.
   - Arqueo `e0ad7919`: Tarjeta esperada = **$345.00** (Folio 015345), Efectivo esperado = **$1,274.00**, Estado = `corte_cerrado`.
3. Limpiar las transacciones fantasma del arqueo abierto actual para dejar únicamente las transacciones reales.

### Paso 4: Despliegue de Código a Producción
Hacer commit y push a `origin/main` con los blindajes de `salesService.ts` y `syncService.ts` para que la versión en producción contenga el límite de 3 reintentos.
