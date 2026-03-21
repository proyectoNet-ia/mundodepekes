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
        hora_entrada?: string;
        hora_salida?: string;
    }[];
    accesorios?: { cantidad: number; concepto: string; pUnit: number; importe: number }[];
    subtotal: number;
    iva: number;
    total: number;
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
            lines.push(`Paquete: ${item.nombre}`);
            lines.push(`Precio: $ ${item.precio.toFixed(2)}`);
            if (item.hora_entrada && item.hora_salida) {
                lines.push(`Horario: ${item.hora_entrada} a ${item.hora_salida}`);
            }
            lines.push("--------------------------------");
        });

        lines.push(`Tutor: ${data.cliente}`);
        lines.push(`Telefono: ${data.telefono}`);
        lines.push(`ID Transaccion: ${data.folio}`);
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
^XZ
        `.trim();
    }

    /**
     * Envía comandos RAW a la impresora (Simulación usando iframe para demo)
     */
    static async printRaw(content: string, printerType: 'EPSON' | 'ZEBRA') {
        console.log(`[PRINTING ${printerType}]`, content);
        
        // Simulación de ventana de impresión
        const printWindow = window.open('', '_blank', 'width=300,height=400');
        if (printWindow) {
            printWindow.document.write('<pre>' + content + '</pre>');
            printWindow.document.close();
            // En un entorno real, aquí se usaría una extensión de Chrome o API de impresión térmica
            // printWindow.print(); 
        }
        
        return true;
    }
}
