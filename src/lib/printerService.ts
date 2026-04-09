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
}

export class PrinterService {
    /**
     * Formatea el ticket de venta para comando RAW (Epson/Térmica)
     */
    static formatEpsonTicket(data: EpsonTicketData): string {
        const now = new Date().toLocaleString();
        
        let lines = [
            "\x1B\x61\x01", // Centrar
            "\x1B\x45\x01MUNDO DE PEKES\x1B\x45\x00", // Negrita ON/OFF
            "DIRECCION: PLAZA NEA LOCAL 9",
            `USUARIO: ${data.staffEmail || 'admin@mundodepekes.com'}`,
            `${now}`,
            "\x1B\x61\x00", // Alinear izquierda
            "--------------------------------"
        ];

        data.items.forEach((item, index) => {
            lines.push(`Peke ${index + 1}: ${item.nino}`);
            const durationStr = item.duracion ? ` (${PrinterService.formatDuration(item.duracion)})` : '';
            lines.push(`Paquete: ${item.nombre}${durationStr}`);
            lines.push(`Precio: $ ${item.precio.toFixed(2)}`);
            if (item.hora_entrada && item.hora_salida) {
                lines.push(`Horario: ${item.hora_entrada} a ${item.hora_salida}`);
            }
            lines.push("--------------------------------");
        });

        lines.push(`Tutor: ${data.cliente}`);
        // Solo imprimir el número principal si hay múltiples separados por coma
        const primaryPhone = data.telefono?.split(',')[0]?.trim() || '';
        lines.push(`Telefono: ${primaryPhone}`);
        lines.push(`ID Transaccion: ${data.folio}`);
        if (data.paymentMethod) {
            lines.push(`Metodo de Pago: ${data.paymentMethod.toUpperCase()}`);
        }
        lines.push("");

        lines.push("Accesorios Adicionales");
        lines.push("CANT  CONCEPTO        P.UNIT  IMP.");
        lines.push("--------------------------------");

        if (data.accesorios && data.accesorios.length > 0) {
            data.accesorios.forEach(acc => {
                const qty = acc.cantidad.toString().padEnd(6);
                const concept = acc.concepto.substring(0, 15).padEnd(16);
                const pUnit = acc.pUnit.toFixed(0).padStart(6);
                const imp = acc.importe.toFixed(0).padStart(4);
                lines.push(`${qty}${concept}${pUnit}${imp}`);
            });
        } else {
            lines.push("No se incluyeron accesorios");
        }

        lines.push("--------------------------------");
        lines.push(`TOTAL: $ ${data.total.toFixed(2)}`.padStart(32));
        lines.push("");
        lines.push("\x1B\x61\x01"); // Centrar
        lines.push(data.mensaje || "Muchas gracias por su compra");
        lines.push("\x1D\x56\x41\x03"); // Corte de papel

        return lines.join("\n");
    }

    /**
     * Formatea un ticket genérico de punto de venta (Solo productos)
     */
    static formatGenericPOSTicket(data: GenericPOSTicketData): string {
        const now = new Date().toLocaleString();
        
        let lines = [
            "\x1B\x61\x01", // Centrar
            "\x1B\x45\x01MUNDO DE PEKES (TIENDA)\x1B\x45\x00",
            "DIRECCION: PLAZA NEA LOCAL 9",
            `CAJERO: ${data.staffEmail || 'admin@mundodepekes.com'}`,
            `${now}`,
            "\x1B\x61\x00", 
            "--------------------------------",
            "CANT  CONCEPTO        P.UNIT  IMP.",
            "--------------------------------"
        ];

        data.items.forEach(item => {
            const qty = item.cantidad.toString().padEnd(6);
            const concept = item.nombre.substring(0, 15).padEnd(16);
            const pUnit = item.precio.toFixed(0).padStart(6);
            const imp = item.importe.toFixed(0).padStart(4);
            lines.push(`${qty}${concept}${pUnit}${imp}`);
        });

        lines.push("--------------------------------");
        lines.push(`TOTAL: $ ${data.total.toFixed(2)}`.padStart(32));
        lines.push("");
        lines.push(`METODO PAGO: ${data.paymentMethod.toUpperCase()}`);
        lines.push(`FOLIO: ${data.folio}`);
        lines.push("");
        lines.push("\x1B\x61\x01"); // Centrar
        lines.push("¡Gracias por su compra!");
        lines.push("\x1D\x56\x41\x03"); // Corte de papel

        return lines.join("\n");
    }

    /**
     * Formatea la pulsera para Zebra (ZPL)
     * Basado en la imagen: Vertical, Nombre grande, ID, Zona y Horas.
     */
    static formatZebraWristband(data: ZebraWristbandData): string {
        const formattedDur = this.formatDuration(data.duracion);
        return `
^XA
^PW400
^LL800
^LS0
^FO50,50^A0N,40,40^FD${data.nino.toUpperCase()}^FS
^FO50,110^A0N,30,30^FDID Peke: ${data.folio}^FS
^FO50,160^A0N,30,30^FDZona: ${data.area}^FS
^FO50,210^A0N,25,25^FDHora Entrada: ${data.horaEntrada}^FS
^FO50,250^A0N,25,25^FDHora Salida: ${data.horaSalida}^FS
^FO50,290^A0N,30,30^FDPaquete: ${data.paquete}^FS
^FO50,330^A0N,25,25^FDDuracion: ${formattedDur}^FS
^XZ
        `.trim();
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
                // Enviar a agente local (ej: Node.js o QZ Tray)
                await fetch(deviceSettings.address, {
                    method: 'POST',
                    headers: { 'Content-Type': 'text/plain' },
                    body: content
                });
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
}
