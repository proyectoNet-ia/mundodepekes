# Plan: Eliminación Total del Bloque 4 (Firmas Remotas) y Migración a PIN 100% Local

## 1. Diagnóstico
- El Bloque 4 (firmas remotas) generaba canales WebSockets dinámicos y sondeos de 1.5s, provocando errores de autenticación de WebSocket y saturación de conexiones en Postgres.
- El 100% de las autorizaciones operativas (descuentos, cancelaciones, cortesías) pueden validarse al instante de forma local con el PIN de 4 dígitos del Supervisor/Admin.

## 2. Acciones Propuestas

### A. Simplificación de `AuthPinModal.tsx`
- Eliminar la pestaña "Remoto" y todas las llamadas a `authRequestService`.
- Dejar el modal de autorización 100% enfocado en el teclado numérico de PIN físico in situ.

### B. Limpieza de `RemoteAuthBell.tsx`
- Eliminar la pestaña de firmas remotas (`auth`) y las suscripciones a `authRequestService`.
- La campanita ahora gestiona exclusivamente notificaciones operativas (Apertura/Cierre de Caja y Stock Crítico).

### C. Desactivar WebSockets en `notificationsService.ts`
- Reemplazar las conexiones WebSocket por `BroadcastChannel` local (para sincronizar pestañas del mismo equipo sin salir a internet).
