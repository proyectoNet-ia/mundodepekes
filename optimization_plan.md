# Plan de Optimización: Ejecución del Checklist

Este plan propone la ejecución del checklist de optimización y seguridad para el repositorio.

## 1. Generación de `.cursorrules`
Se creará el archivo `.cursorrules` en la raíz del proyecto conteniendo las directivas generales de desarrollo del entorno, optimización de recursos, seguridad en Supabase y consistencia de UI.

## 2. Auditoría de Consultas Supabase (Búsqueda de `select('*')`)
Se buscarán todas las consultas que utilicen `select('*')` o selectores redundantes en la carpeta `src/` para proponer selectores de columnas específicas.

## 3. Auditoría de Canales en Tiempo Real (Limpieza de memoria)
Se auditará el uso de `supabase.channel()` en el código frontend para asegurar que se llamen a métodos de desmontado/limpieza (ej: `.unsubscribe()`).
