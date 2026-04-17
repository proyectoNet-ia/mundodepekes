# 🖨️ Agente de Impresión Local - Mundo de Pekes

Servidor Express ultraligero que recibe comandos ESC/POS del navegador
y los envía a la impresora USB conectada a Windows.

## Requisitos

- **Node.js v18+** — [Descargar aquí](https://nodejs.org)
- Impresora térmica conectada por USB (Epson, Bixolon, etc.)
- La impresora debe estar instalada en Windows (visible en "Dispositivos e impresoras")

## Instalación (primera vez)

```bash
cd print-agent
npm install
```

## Iniciar el agente

### Opción 1: Doble clic (recomendado)
Haz doble clic en **`INICIAR_AGENTE.bat`**

### Opción 2: Desde terminal
```bash
cd print-agent
node index.js
```

### Opción 3: Con impresora específica
```bash
PRINTER_NAME="EPSON TM-T20" node index.js
```

## Endpoints

| Método | Ruta        | Descripción                        |
|--------|-------------|------------------------------------|
| GET    | `/health`   | Estado del agente                  |
| GET    | `/printers` | Lista de impresoras en Windows     |
| POST   | `/print`    | Imprimir ticket (JSON o texto raw) |
| POST   | `/config`   | Cambiar impresora activa           |

## Configuración en el sistema

1. Iniciar este agente (dejar la ventana abierta)
2. En Mundo de Pekes → **Backoffice → Configuración → Impresoras**
3. Seleccionar **"USB / Agente Local"**
4. URL: `http://localhost:3000` (default)
5. Click **"Verificar Conexión"** → debe aparecer en verde ✓
6. Click **"Detectar Impresoras"** y seleccionar la correcta
7. Click **"Imprimir Ticket de Prueba"**

## Auto-inicio con Windows (opcional)

Para que el agente inicie automáticamente con Windows:

1. Presiona `Win+R`, escribe `shell:startup`
2. Crea un acceso directo a `INICIAR_AGENTE.bat` en esa carpeta

## Solución de problemas

| Problema | Solución |
|----------|----------|
| "Agente no detectado" | Verificar que `INICIAR_AGENTE.bat` esté corriendo |
| Impresora no aparece | Verificar que esté instalada en Windows (Panel de Control → Dispositivos) |
| Ticket sale en blanco | La impresora puede no ser compatible con ESC/POS, verificar el modelo |
| Error de permisos | Ejecutar el .bat como Administrador |
