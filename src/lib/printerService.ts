/**
 * PrinterService - Maneja formatos para EPSON (ESC/POS) y ZEBRA (ZPL)
 */

export interface EpsonTicketData {
    folio: string;
    cliente: string;
    telefono: string;
    staffEmail?: string;
    items: { 
        nino: string; 
        nombre: string; 
        precio: number;
        duracion?: number; // Minutes
        hora_entrada?: string;
        hora_salida?: string;
    }[];
    accesorios?: { cantidad: number; concepto: string; pUnit: number; importe: number }[];
    subtotal: number;
    iva: number;
    total: number;
    paymentMethod?: string;
    mensaje?: string;
}

export interface GenericPOSTicketData {
    folio: string;
    items: {
        nombre: string;
        precio: number;
        cantidad: number;
        importe: number;
    }[];
    subtotal: number;
    iva: number;
    total: number;
    paymentMethod: string;
    staffEmail?: string;
}

export interface ZebraWristbandData {
    nino: string;
    idPeke: string;
    paquete: string;
    area: string;
    duracion: number; // Minutes
    horaEntrada: string;
    horaSalida: string;
    folio: string;
    telefono?: string;
    tutor?: string;
}

export class PrinterService {
    /**
     * Elimina acentos y caracteres especiales para máxima compatibilidad con impresoras
     */
    static normalizeString(str: string): string {
        if (!str) return '';
        return str
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "") // Eliminar diacríticos
            .replace(/[ñÑ]/g, "n")           // Reemplazar ñ por n
            .replace(/[^\x20-\x7E]/g, "");    // Quedarse solo con ASCII imprimible
    }

    /**
     * Helper para formatear minutos en formato humano (Xh Ym)
     */
    static formatDuration(minutes: number): string {
        if (!minutes || minutes <= 0) return '0m';
        const hours = Math.floor(minutes / 60);
        const mins = minutes % 60;
        if (hours > 0) {
            return `${hours}h ${mins > 0 ? `${mins}m` : ''}`.trim();
        }
        return `${mins}m`;
    }

    /**
     * Formatea el ticket de venta para comando RAW (Epson/Térmica)
     */
    static formatEpsonTicket(data: EpsonTicketData, isClientCopy: boolean = false): string {
        const d = new Date();
        const now = `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
        const n = (s: string) => PrinterService.normalizeString(s);

        // El ancho estándar de 58mm es 32 caracteres. Para 80mm es 42-48.
        const width = 32; 
        
        let lines = [
            "\x1B\x40",     // Reset / Reestablecer
            "\x1B\x74\x11", // Seleccionar tabla de caracteres Latin-1 (CP850)
            "\x1B\x61\x01", // Centrar
        ];

        if (isClientCopy) {
            lines.push("\x1B\x21\x30*** COPIA CLIENTE ***\x1B\x21\x00");
            lines.push("");
        }

        lines.push("\x1B\x45\x01MUNDO DE PEKES\x1B\x45\x00"); // Negrita ON/OFF
            "Plaza NEA Local 9",
            "--------------------------------",
            `${now}`,
            `Cajero: ${n(data.staffEmail || 'admin')}`,
            "--------------------------------",
            "\x1B\x61\x00", // Alinear izquierda
        ];

        data.items.forEach((item) => {
            lines.push(`PEKE: ${n(item.nino).toUpperCase()}`);
            const durationStr = item.duracion ? ` (${PrinterService.formatDuration(item.duracion)})` : '';
            lines.push(`PAQUETE: ${n(item.nombre)}${durationStr}`);
            lines.push("\x1B\x45\x01" + `PRECIO: $ ${item.precio.toFixed(2)}`.padStart(width) + "\x1B\x45\x00");
            if (item.hora_entrada && item.hora_salida) {
                lines.push(`HORARIO: ${item.hora_entrada} - ${item.hora_salida}`);
            }
            lines.push("- - - - - - - - - - - - - - - - ");
        });

        lines.push(`TUTOR: ${n(data.cliente).toUpperCase()}`);
        const primaryPhone = data.telefono?.split(',')[0]?.trim() || '';
        lines.push(`TELEFONO: ${primaryPhone}`);
        lines.push(`ID VENTA: ${data.folio}`);
        if (data.paymentMethod) {
            lines.push(`PAGO: ${n(data.paymentMethod).toUpperCase()}`);
        }
        lines.push("");

        if (data.accesorios && data.accesorios.length > 0) {
            lines.push("ACCESORIOS");
            lines.push("CANT DESCRIPCION           IMP.");
            lines.push("--------------------------------");
            data.accesorios.forEach(acc => {
                const qty = acc.cantidad.toString().padEnd(5);
                const concept = n(acc.concepto).substring(0, 16).padEnd(17);
                const imp = `$ ${acc.importe.toFixed(2)}`.padStart(10);
                lines.push(`${qty}${concept}${imp}`);
            });
            lines.push("--------------------------------");
        }

        lines.push("\x1B\x45\x01" + `TOTAL: $ ${data.total.toFixed(2)}`.padStart(width) + "\x1B\x45\x00");
        lines.push("");
        lines.push("\x1B\x61\x01"); // Centrar
        lines.push(n(data.mensaje || "Gracias por jugar con nosotros"));
        lines.push("Recuerda presentar tu ticket");
        lines.push("para retirar al peke.");
        lines.push("\x1D\x56\x41\x03"); // Corte de papel

        return lines.join("\n");
    }

    /**
     * Formatea un ticket genérico de punto de venta (Solo productos)
     */
    static formatGenericPOSTicket(data: GenericPOSTicketData, isClientCopy: boolean = false): string {
        const d = new Date();
        const now = `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
        const n = (s: string) => PrinterService.normalizeString(s);

        let lines = [
            "\x1B\x40",     // Reset
            "\x1B\x74\x11", // Seleccionar tabla de caracteres CP850
            "\x1B\x61\x01", // Centrar
        ];

        if (isClientCopy) {
            lines.push("\x1B\x21\x30*** COPIA CLIENTE ***\x1B\x21\x00");
            lines.push("");
        }

        lines.push("\x1B\x45\x01MUNDO DE PEKES TIENDA\x1B\x45\x00");
            "Plaza NEA Local 9",
            "--------------------------------",
            `${now}`,
            `Cajero: ${n(data.staffEmail || 'admin')}`,
            "--------------------------------",
            "\x1B\x61\x00", 
            "CANT  CONCEPTO            IMP. ",
            "--------------------------------"
        ];

        data.items.forEach(item => {
            const qty = item.cantidad.toString().padEnd(6);
            const concept = n(item.nombre).substring(0, 15).padEnd(16);
            const pUnit = item.precio.toFixed(0).padStart(6);
            const imp = item.importe.toFixed(0).padStart(4);
            lines.push(`${qty}${concept}${pUnit}${imp}`);
        });

        lines.push("--------------------------------");
        lines.push(`TOTAL: $ ${data.total.toFixed(2)}`.padStart(32));
        lines.push("");
        lines.push(`METODO PAGO: ${n(data.paymentMethod || 'EFECTIVO').toUpperCase()}`);
        lines.push(`FOLIO: ${data.folio}`);
        lines.push("");
        lines.push("\x1B\x61\x01"); // Centrar
        lines.push("Gracias por su compra");
        lines.push("\x1D\x56\x41\x03"); // Corte de papel

        return lines.join("\n");
    }

    /**
     * Formatea la pulsera para Zebra (ZPL)
     * Optimizada para ZD510-300dpi (300 dots = 1 pulgada ancho)
     */
    static formatZebraWristband(data: ZebraWristbandData): string {
        const formattedDur = this.formatDuration(data.duracion);
        const n = (s: string) => PrinterService.normalizeString(s);

        // Diseñado para imprimir a lo largo de la pulsera (Rotated 90 deg)
        // Se omitio el codigo de barras a peticion del usuario para dar prioridad al texto
        return `^XA^PW300^LL1200^LS0^CI28
^FO205,100^A0R,60,60^FD${n(data.nino).toUpperCase()}^FS
^FO150,100^A0R,30,30^FDTUTOR: ${n(data.tutor || '').toUpperCase()}^FS
^FO115,100^A0R,28,28^FDID: ${data.folio} TEL: ${data.telefono || ''}^FS
^FO85,100^A0R,25,25^FDENT: ${data.horaEntrada} SAL: ${data.horaSalida} PKG: ${formattedDur}^FS
^FO55,100^A0R,25,25^FDZONA: ${n(data.area).toUpperCase()}^FS
^XZ`.trim();
    }

    /**
     * Envía comandos RAW a la impresora basándose en la configuración local
     */
    static async printRaw(content: string, deviceRole: 'TICKET' | 'WRISTBAND') {
        const settingsRaw = localStorage.getItem('printer_settings');
        const settings = settingsRaw ? JSON.parse(settingsRaw) : null;
        
        const deviceSettings = deviceRole === 'TICKET' ? settings?.ticketPrinter : settings?.wristbandPrinter;
        const connectionType = deviceSettings?.connection || 'WEBUSB';
        
        console.log(`[PRINT_SERVICE] Printing ${deviceRole} via ${connectionType}`);

        try {
            if (connectionType === 'PROXY' && deviceSettings?.address) {
                // Rutas según tipo de dispositivo:
                //   TICKET    -> POST /print            (ESC/POS → Epson TM-T20II)
                //   WRISTBAND -> POST /print-wristband  (ZPL     → Zebra ZD510)
                const endpoint = deviceRole === 'WRISTBAND'
                    ? `${deviceSettings.address}/print-wristband`
                    : `${deviceSettings.address}/print`;

                const payload = {
                    content,
                    printerName: deviceSettings.printerName || ''
                };
                const res = await fetch(endpoint, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                    signal: AbortSignal.timeout(8000)
                });
                if (!res.ok) {
                    const err = await res.json().catch(() => ({ error: 'Error desconocido' }));
                    throw new Error(err.error || `HTTP ${res.status}`);
                }
            } else if (connectionType === 'NETWORK' && deviceSettings?.address) {
                // Enviar vía raw socket (requiere un proxy o backend intermedio si no hay WebSockets)
                console.warn('Network printing requires a local gateway.');
            } else {
                // Por defecto o WebUSB
                // Si ejecutamos en Chrome, podríamos intentar WebUSB aquí
                // Para efectos de esta demo, mostramos previsualización profesional
                const printWindow = window.open('', '_blank', 'width=400,height=600');
                if (printWindow) {
                    printWindow.document.write(`
                        <html>
                            <head>
                                <title>Impresión de ${deviceRole}</title>
                                <style>
                                    body { font-family: 'Courier New', Courier, monospace; font-size: 14px; padding: 20px; }
                                    pre { white-space: pre-wrap; word-wrap: break-word; }
                                    .actions { margin-bottom: 20px; no-print: true; }
                                    @media print { .actions { display: none; } }
                                </style>
                            </head>
                            <body>
                                <div class="actions">
                                    <button onclick="window.print()">[ IMPRIMIR EN ${deviceRole} ]</button>
                                    <button onclick="window.close()">Cerrar</button>
                                </div>
                                <pre>${content}</pre>
                            </body>
                        </html>
                    `);
                    printWindow.document.close();
                }
            }
            return true;
        } catch (error) {
            console.error('Error in print service:', error);
            return false;
        }
    }

    /**
     * Verifica si el agente local de impresión está corriendo
     */
    static async checkProxyHealth(address?: string): Promise<{ ok: boolean; printer?: string }> {
        const url = address || 'http://localhost:3000';
        try {
            const res = await fetch(`${url}/health`, { signal: AbortSignal.timeout(3000) });
            if (res.ok) {
                const data = await res.json();
                return { ok: true, printer: data.printer };
            }
            return { ok: false };
        } catch {
            return { ok: false };
        }
    }
}
