# Plan de Optimización y Trazabilidad de Inventarios

## 1. Diagnóstico
- La tabla `movimientos_inventario` carece de columnas para registrar al usuario ejecutor/autorizador (`usuario_nombre`, `usuario_email`, `usuario_rol`).
- La función `stockService.recordMovement` no inserta datos de autoría.
- La vista de historial en `Stock.tsx` no renderiza quién hizo el movimiento.

## 2. Modificaciones Propuestas
1. **Migración SQL (`08_add_user_to_inventory_movements.sql`)**:
   - Agregar columnas `usuario_nombre`, `usuario_email`, `usuario_rol` en `movimientos_inventario`.
2. **Servicio (`stockService.ts`)**:
   - Capturar y guardar datos del usuario ejecutor/autorizador en sesión o validado por PIN.
3. **Sincronización Offline (`syncService.ts`)**:
   - Soporte para metadatos de autoría en la cola IndexedDB.
4. **UI (`Stock.tsx` y `Stock.module.css`)**:
   - Renderizar badge de autor en tarjetas del historial (`👤 Nombre (Rol)`).
