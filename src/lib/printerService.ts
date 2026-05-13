/**
 * PrinterService - Maneja formatos para EPSON (ESC/POS) y ZEBRA (ZPL)
 * [v1.1 - Ticket Formatting Fix]
 */

export interface EpsonTicketData {
    folio: string;
    cliente: string;
    telefono: string;
    staffEmail?: string;
    items: { 
        nino: string; 
        idPeke?: string;
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

export interface ArqueoTicketData {
    folio: string;
    fechaApertura: string;
    fechaCierre: string;
    staffEmail: string;
    montoInicial: number;
    ventasEfectivo: number;
    ventasTarjeta: number;
    gastos: { concepto: string; monto: number }[];
    totalGastos: number;
    esperadoEfectivo: number;
    realEfectivo: number;
    esperadoTarjeta: number;
    realTarjeta: number;
    diferenciaEfectivo: number;
    diferenciaTarjeta: number;
    totalVentas: number;
}

export class PrinterService {
    static normalizeString(str: string): string {
        if (!str) return '';
        return str
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[ñÑ]/g, 'n')
            .replace(/[^\x20-\x7E]/g, '');
    }

    static formatDuration(minutes: number): string {
        if (!minutes || minutes <= 0) return '0m';
        const hours = Math.floor(minutes / 60);
        const mins = minutes % 60;
        if (hours > 0) {
            return `${hours}h ${mins > 0 ? `${mins}m` : ''}`.trim();
        }
        return `${mins}m`;
    }

    static formatEpsonTicket(data: EpsonTicketData, isClientCopy: boolean = false): string {
        const d = new Date();
        const now = `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
        const n = (s: string) => PrinterService.normalizeString(s);
        const width = 32;
        
        let lines = [
            '\x1B\x40',     // Reset
            '\x1B\x74\x11', // CP850
            '\x1B\x61\x01'  // Center
        ];

        if (isClientCopy) {
            lines.push('\x1B\x21\x30*** COPIA CLIENTE ***\x1B\x21\x00');
            lines.push('');
        }

        lines.push('\x1B\x45\x01MUNDO DE PEKES\x1B\x45\x00');
        lines.push('Plaza NEA Local 9');
        lines.push('--------------------------------');
        lines.push(now);
        lines.push(`Cajero: ${n(data.staffEmail || 'admin')}`);
        lines.push('--------------------------------');
        lines.push('\x1B\x61\x00'); // Left

        data.items.forEach((item) => {
            const pekeIdLabel = item.idPeke ? ` [${item.idPeke}]` : '';
            lines.push(`PEKE: ${n(item.nino).toUpperCase()}${pekeIdLabel}`);
            const durationStr = item.duracion ? ` (${PrinterService.formatDuration(item.duracion)})` : '';
            lines.push(`PAQUETE: ${n(item.nombre)}${durationStr}`);
            lines.push('\x1B\x45\x01' + `PRECIO: $ ${item.precio.toFixed(2)}`.padStart(width) + '\x1B\x45\x00');
            if (item.hora_entrada && item.hora_salida) {
                lines.push(`HORARIO: ${item.hora_entrada} - \x1B\x45\x01${item.hora_salida}\x1B\x45\x00`);
            }
            lines.push('- - - - - - - - - - - - - - - - ');
        });

        lines.push(`TUTOR: ${n(data.cliente).toUpperCase()}`);
        const primaryPhone = data.telefono?.split(',')[0]?.trim() || '';
        lines.push(`TELEFONO: ${primaryPhone}`);
        lines.push(`ID VENTA: ${data.folio}`);
        if (data.paymentMethod) {
            lines.push(`PAGO: ${n(data.paymentMethod).toUpperCase()}`);
        }
        lines.push('');

        if (data.accesorios && data.accesorios.length > 0) {
            lines.push('ACCESORIOS');
            lines.push('CANT DESCRIPCION           IMP.');
            lines.push('--------------------------------');
            data.accesorios.forEach(acc => {
                const qty = acc.cantidad.toString().padEnd(5);
                const concept = n(acc.concepto).substring(0, 16).padEnd(17);
                const imp = `$ ${acc.importe.toFixed(2)}`.padStart(10);
                lines.push(`${qty}${concept}${imp}`);
            });
            lines.push('--------------------------------');
        }

        lines.push('\x1B\x45\x01' + `TOTAL: $ ${data.total.toFixed(2)}`.padStart(width) + '\x1B\x45\x00');
        lines.push('');
        lines.push('\x1B\x61\x01'); // Center
        lines.push(n(data.mensaje || 'Gracias por jugar con nosotros'));
        lines.push('Recuerda presentar tu ticket');
        lines.push('para retirar al peke.');
        lines.push('\x1D\x56\x41\x03'); // Cut

        return lines.join('\n');
    }

    static formatGenericPOSTicket(data: GenericPOSTicketData, isClientCopy: boolean = false): string {
        const d = new Date();
        const now = `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
        const n = (s: string) => PrinterService.normalizeString(s);

        let lines = [
            '\x1B\x40',
            '\x1B\x74\x11',
            '\x1B\x61\x01'
        ];

        if (isClientCopy) {
            lines.push('\x1B\x21\x30*** COPIA CLIENTE ***\x1B\x21\x00');
            lines.push('');
        }

        lines.push('\x1B\x45\x01MUNDO DE PEKES TIENDA\x1B\x45\x00');
        lines.push('Plaza NEA Local 9');
        lines.push('--------------------------------');
        lines.push(now);
        lines.push(`Cajero: ${n(data.staffEmail || 'admin')}`);
        lines.push('--------------------------------');
        lines.push('\x1B\x61\x00');
        lines.push('CANT  CONCEPTO            IMP. ');
        lines.push('--------------------------------');

        data.items.forEach(item => {
            const qty = item.cantidad.toString().padEnd(6);
            const concept = n(item.nombre).substring(0, 15).padEnd(16);
            const pUnit = item.precio.toFixed(0).padStart(6);
            const imp = item.importe.toFixed(0).padStart(4);
            lines.push(`${qty}${concept}${pUnit}${imp}`);
        });

        lines.push('--------------------------------');
        lines.push(`TOTAL: $ ${data.total.toFixed(2)}`.padStart(32));
        lines.push('');
        lines.push(`METODO PAGO: ${n(data.paymentMethod || 'EFECTIVO').toUpperCase()}`);
        lines.push(`FOLIO: ${data.folio}`);
        lines.push('');
        lines.push('\x1B\x61\x01');
        lines.push('Gracias por su compra');
        lines.push('\x1D\x56\x41\x03');

        return lines.join('\n');
    }

    static formatArqueoTicket(data: ArqueoTicketData): string {
        const n = (s: string) => PrinterService.normalizeString(s);
        const width = 38; // Aprovechar mejor el ancho
        
        let lines = [
            '\x1B\x40', '\x1B\x74\x11', '\x1B\x61\x01',
            '\x1B\x45\x01ARQUEO DE CAJA\x1B\x45\x00',
            '\x1B\x45\x01MUNDO DE PEKES\x1B\x45\x00',
            '--------------------------------------',
        ];

        lines.push(`Cajero: ${n(data.staffEmail)}`);
        lines.push(`Apertura: ${data.fechaApertura}`);
        lines.push(`Cierre:   ${data.fechaCierre}`);
        lines.push('--------------------------------------');
        lines.push('\x1B\x61\x00'); // Left
        
        lines.push('RESUMEN DE VENTAS');
        lines.push('EFECTIVO:'.padEnd(25) + `$ ${data.ventasEfectivo.toFixed(2)}`.padStart(13));
        lines.push('TARJETA:'.padEnd(25) + `$ ${data.ventasTarjeta.toFixed(2)}`.padStart(13));
        lines.push('\x1B\x45\x01' + 'TOTAL VENTAS:'.padEnd(25) + `$ ${data.totalVentas.toFixed(2)}`.padStart(13) + '\x1B\x45\x00');

        if (data.gastos.length > 0) {
            lines.push('GASTOS DEL TURNO:');
            data.gastos.forEach(g => {
                lines.push(` - ${n(g.concepto).substring(0, 22).padEnd(23)} $ ${g.monto.toFixed(2)}`.padStart(13));
            });
            lines.push('TOTAL GASTOS:'.padEnd(25) + `$ ${data.totalGastos.toFixed(2)}`.padStart(13));
        }

        lines.push('--------------------------------------');
        lines.push('FONDO INICIAL:'.padEnd(25) + `$ ${data.montoInicial.toFixed(2)}`.padStart(13));
        lines.push('EFECTIVO ESPERADO:'.padEnd(25) + `$ ${data.esperadoEfectivo.toFixed(2)}`.padStart(13));
        lines.push('EFECTIVO REAL:'.padEnd(25) + `$ ${data.realEfectivo.toFixed(2)}`.padStart(13));
        
        const diffEfe = data.diferenciaEfectivo;
        const diffEfeLabel = diffEfe === 0 ? 'OK' : diffEfe > 0 ? 'SOBRANTE' : 'FALTANTE';
        lines.push('\x1B\x45\x01' + `DIF. EFECTIVO (${diffEfeLabel}):`.padEnd(25) + `$ ${diffEfe.toFixed(2)}`.padStart(13) + '\x1B\x45\x00');

        lines.push('--------------------------------------');
        lines.push('TARJETA ESPERADA:'.padEnd(25) + `$ ${data.esperadoTarjeta.toFixed(2)}`.padStart(13));
        lines.push('TARJETA REAL:'.padEnd(25) + `$ ${data.realTarjeta.toFixed(2)}`.padStart(13));
        
        const diffTar = data.diferenciaTarjeta;
        const diffTarLabel = diffTar === 0 ? 'OK' : diffTar > 0 ? 'SOBRANTE' : 'FALTANTE';
        lines.push('\x1B\x45\x01' + `DIF. TARJETA (${diffTarLabel}):`.padEnd(25) + `$ ${diffTar.toFixed(2)}`.padStart(13) + '\x1B\x45\x00');
        
        lines.push('--------------------------------------');
        lines.push('\x1B\x61\x01');
        lines.push('FIRMA CAJERO:');
        lines.push('');
        lines.push('__________________________');
        lines.push('\x1D\x56\x41\x03');

        return lines.join('\n');
    }

    static formatZebraWristband(data: ZebraWristbandData): string {
        const formattedDur = this.formatDuration(data.duracion);
        const n = (s: string) => PrinterService.normalizeString(s);

        return `^XA^PW300^LL1200^LS0^CI28
^FO240,20^FB1100,1,,R^A0R,60,60^FD${n(data.nino).toUpperCase()}^FS
^FO190,20^FB1100,1,,R^A0R,30,30^FDTUTOR: ${n(data.tutor || '').toUpperCase()}^FS
^FO155,20^FB1100,1,,R^A0R,28,28^FDID: ${data.folio} TEL: ${data.telefono || ''}^FS
^FO125,20^FB1100,1,,R^A0R,25,25^FDENT: ${data.horaEntrada} SAL: ${data.horaSalida} PKG: ${formattedDur}^FS
^FO95,20^FB1100,1,,R^A0R,25,25^FDZONA: ${n(data.area).toUpperCase()}^FS
^XZ`.trim();
    }

    static async printRaw(content: string, deviceRole: 'TICKET' | 'WRISTBAND') {
        const settingsRaw = localStorage.getItem('printer_settings');
        const settings = settingsRaw ? JSON.parse(settingsRaw) : null;
        const deviceSettings = deviceRole === 'TICKET' ? settings?.ticketPrinter : settings?.wristbandPrinter;
        const connectionType = deviceSettings?.connection || 'WEBUSB';
        
        try {
            if (connectionType === 'PROXY' && deviceSettings?.address) {
                const endpoint = deviceRole === 'WRISTBAND'
                    ? `${deviceSettings.address}/print-wristband`
                    : `${deviceSettings.address}/print`;

                const payload = {
                    content,
                    printerName: deviceSettings.printerName || ''
                };

                await fetch(endpoint, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
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
