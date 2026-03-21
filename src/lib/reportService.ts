import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { supabase } from './supabase';

export interface ReportColumn {
    header: string;
    dataKey: string;
}

export class ReportService {
    /**
     * Genera y descarga un reporte PDF
     */
    static async exportToPDF(title: string, columns: ReportColumn[], data: any[], filename: string) {
        console.log(`[ReportService] Iniciando generación de PDF: ${title}`);
        try {
            const doc = new jsPDF();
            const now = new Date().toLocaleString();

            // Encabezado
            doc.setFontSize(18);
            doc.setTextColor(249, 115, 22); // Naranja Vibrante UI
            doc.text('MUNDO DE PEKES - ADMIN OS', 14, 20);
            
            doc.setFontSize(14);
            doc.setTextColor(100);
            doc.text(title.toUpperCase(), 14, 30);
            
            doc.setFontSize(10);
            doc.text(`Fecha de generación: ${now}`, 14, 38);

            console.log(`[ReportService] Renderizando tabla con ${data.length} filas...`);
            // Tabla
            autoTable(doc, {
                startY: 45,
                head: [columns.map(col => col.header)],
                body: data.map(row => columns.map(col => row[col.dataKey])),
                theme: 'striped',
                headStyles: { fillColor: [249, 115, 22] }, // Naranja
                alternateRowStyles: { fillColor: [240, 249, 255] }, // Azul muy tenue
                margin: { top: 45 }
            });

            // Pie de página
            const pageCount = (doc as any).internal.getNumberOfPages();
            for (let i = 1; i <= pageCount; i++) {
                doc.setPage(i);
                doc.setFontSize(8);
                doc.text(`Página ${i} de ${pageCount}`, doc.internal.pageSize.width - 30, doc.internal.pageSize.height - 10);
            }

            console.log(`[ReportService] Guardando archivo: ${filename}.pdf`);
            doc.save(`${filename}.pdf`);
            console.log(`[ReportService] PDF generado exitosamente.`);
        } catch (error) {
            console.error('[ReportService] Error fatal generando PDF:', error);
            throw new Error('No se pudo generar el archivo PDF. Verifique los datos.');
        }
    }

    /**
     * Genera y descarga un reporte Excel
     */
    static async exportToExcel(sheetName: string, columns: ReportColumn[], data: any[], filename: string) {
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet(sheetName);

        // Estilo de encabezados
        worksheet.columns = columns.map(col => ({
            header: col.header,
            key: col.dataKey,
            width: 20
        }));

        const headerRow = worksheet.getRow(1);
        headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        headerRow.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFFF6600' } // Naranja PekePark
        };

        // Agregar datos
        worksheet.addRows(data);

        // Generar buffer y guardar
        const buffer = await workbook.xlsx.writeBuffer();
        const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        saveAs(blob, `${filename}.xlsx`);
    }

    /**
     * Reporte específico de Cierre de Caja con máximo detalle
     */
    static async generateClosureReport(session: any, summary: any, type: 'PDF' | 'EXCEL') {
        const title = `Reporte de Cierre de Caja - Folio ${session.id.substring(0, 8)}`;
        const filename = `cierre_${session.id.substring(0, 8)}`;
        const start = session.fecha_apertura;
        const end = session.fecha_cierre || new Date().toISOString();

        // 1. Obtener Transacciones Detalladas
        const { data: trans } = await supabase
            .from('transacciones')
            .select('*')
            .gte('fecha', start)
            .lte('fecha', end)
            .order('fecha', { ascending: true });

        // 2. Obtener Mix de Paquetes
        const { data: detailSessions } = await supabase
            .from('sesiones')
            .select('paquetes(nombre)')
            .gte('hora_inicio', start)
            .lte('hora_inicio', end);

        const packageMix: Record<string, number> = {};
        detailSessions?.forEach((s: any) => {
            const name = s.paquetes?.nombre || 'Único';
            packageMix[name] = (packageMix[name] || 0) + 1;
        });

        // 3. Obtener Gastos del Turno
        const { data: shiftExpenses } = await supabase
            .from('gastos_diarios')
            .select('*')
            .eq('arqueo_id', session.id);

        const summaryData: Record<string, any>[] = [
            { concepto: 'Fondo Inicial', monto: `$ ${session.monto_inicial.toFixed(2)}` },
            { concepto: 'Ventas en Efectivo (+)', monto: `$ ${summary.efectivo.toFixed(2)}` },
            { concepto: 'Ventas con Tarjeta (Ref)', monto: `$ ${summary.tarjeta.toFixed(2)}` },
            { concepto: 'Total Ingresos Brutos', monto: `$ ${(summary.efectivo + summary.tarjeta).toFixed(2)}` },
            { concepto: '----------------------------', monto: '------------' },
            { concepto: 'Gastos / Salidas en Efectivo (-)', monto: `$ ${summary.gastos.toFixed(2)}` },
            { concepto: 'SALDO NETO ESPERADO EN CAJA', monto: `$ ${(session.monto_inicial + summary.efectivo - summary.gastos).toFixed(2)}` },
            { concepto: 'Monto Real Contado', monto: `$ ${session.monto_final_real?.toFixed(2) || '---'}` },
            { concepto: 'Diferencia Arqueo (+/-)', monto: `$ ${(session.monto_final_real - (session.monto_inicial + summary.efectivo - summary.gastos)).toFixed(2)}` },
            { concepto: 'Observaciones', monto: session.observaciones || 'Sin notas' },
        ];

        if (type === 'PDF') {
            const doc = new jsPDF();

            // Header Premium
            doc.setFontSize(18);
            doc.setTextColor(249, 115, 22);
            doc.text('MUNDO DE PEKES - ADMIN OS', 14, 20);
            doc.setFontSize(14);
            doc.setTextColor(30, 41, 59); // Slate Dark
            doc.text(title.toUpperCase(), 14, 30);
            doc.setFontSize(9);
            doc.setTextColor(100);
            doc.text(`Apertura: ${new Date(start).toLocaleString()} | Cierre: ${new Date(end).toLocaleString()}`, 14, 37);

            // Tabla 1: Resumen
            doc.setFontSize(12);
            doc.setTextColor(30, 41, 59);
            doc.text('RESUMEN DE CAJA', 14, 48);
            autoTable(doc, {
                startY: 52,
                head: [['Concepto', 'Valor']],
                body: summaryData.map(d => [d.concepto, d.monto]),
                theme: 'striped',
                headStyles: { fillColor: [249, 115, 22] },
                alternateRowStyles: { fillColor: [240, 249, 255] }
            });

            // Tabla 2: Mix de Paquetes
            const midY = (doc as any).lastAutoTable.finalY + 15;
            doc.setTextColor(30, 41, 59);
            doc.text('MIX DE PAQUETES VENDIDOS', 14, midY);
            autoTable(doc, {
                startY: midY + 4,
                head: [['Paquete', 'Cantidad']],
                body: Object.entries(packageMix).map(([name, qty]) => [name, qty]),
                theme: 'grid',
            });
            
            // Tabla 2.5: Detalle de Gastos
            const expenseY = (doc as any).lastAutoTable.finalY + 15;
            doc.text('DETALLE DE EGRESOS (GASTOS)', 14, expenseY);
            autoTable(doc, {
                startY: expenseY + 4,
                head: [['Hora', 'Concepto', 'Ticket', 'Monto']],
                body: (shiftExpenses || []).map(e => [
                    new Date(e.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                    e.descripcion,
                    e.tiene_comprobante ? 'SI' : 'NO',
                    `$ ${e.monto.toFixed(2)}`
                ]),
                theme: 'striped',
                headStyles: { fillColor: [220, 38, 38] } // Rojo para gastos
            });

            // Tabla 3: Detalle de Transacciones (Salto de página si es necesario)
            doc.addPage();
            doc.setTextColor(30, 41, 59);
            doc.text('LISTADO DETALLADO DE TRANSACCIONES', 14, 20);
            autoTable(doc, {
                startY: 25,
                head: [['Hora', 'ID Folio', 'Cliente', 'Método', 'Total']],
                body: (trans || []).map(t => [
                    new Date(t.fecha).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                    t.id.substring(0, 8).toUpperCase(),
                    t.cliente_id?.substring(0, 8) || 'Venta Rápida',
                    t.metodo_pago.toUpperCase(),
                    `$ ${t.total.toFixed(2)}`
                ]),
                theme: 'striped',
                headStyles: { fillColor: [249, 115, 22] },
                alternateRowStyles: { fillColor: [240, 249, 255] }
            });

            doc.save(`${filename}.pdf`);
        } else {
            // Excel detallado con 3 hojas
            const workbook = new ExcelJS.Workbook();
            
            const wsRes = workbook.addWorksheet('Resumen de Arqueo');
            wsRes.columns = [{header: 'Concepto', key: 'c', width: 30}, {header: 'Valor', key: 'v', width: 20}];
            wsRes.addRows(summaryData.map(d => ({c: d.concepto, v: d.monto})));

            const wsMix = workbook.addWorksheet('Mix de Paquetes');
            wsMix.columns = [{header: 'Paquete', key: 'p', width: 30}, {header: 'Cantidad', key: 'q', width: 15}];
            wsMix.addRows(Object.entries(packageMix).map(([p, q]) => ({p, q})));

            const wsExp = workbook.addWorksheet('Gastos Detallados');
            wsExp.columns = [
                {header: 'Hora', key: 'h', width: 15},
                {header: 'Concepto', key: 'c', width: 35},
                {header: 'Factura/Ticket', key: 't', width: 15},
                {header: 'Importe', key: 'i', width: 15}
            ];
            wsExp.addRows((shiftExpenses || []).map(e => ({
                h: new Date(e.created_at).toLocaleTimeString(),
                c: e.descripcion,
                t: e.tiene_comprobante ? 'SI' : 'NO',
                i: e.monto
            })));

            const wsTrans = workbook.addWorksheet('Transacciones Detalladas');
            wsTrans.columns = [
                {header: 'Fecha/Hora', key: 'f', width: 25},
                {header: 'Folio', key: 'id', width: 15},
                {header: 'Método', key: 'm', width: 15},
                {header: 'Total', key: 't', width: 15}
            ];
            wsTrans.addRows((trans || []).map(t => ({
                f: new Date(t.fecha).toLocaleString(),
                id: t.id.substring(0, 8).toUpperCase(),
                m: t.metodo_pago,
                t: t.total
            })));

            const buffer = await workbook.xlsx.writeBuffer();
            const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
            saveAs(blob, `${filename}.xlsx`);
        }
    }

    /**
     * Reporte específico de Inventario
     */
    static async generateInventoryReport(items: any[], type: 'PDF' | 'EXCEL') {
        const title = 'Reporte de Inventario y Stock';
        const filename = `inventario_${new Date().toISOString().split('T')[0]}`;

        const columns = [
            { header: 'Producto', dataKey: 'nombre' },
            { header: 'Categoría', dataKey: 'categoria' },
            { header: 'Stock Actual', dataKey: 'cantidad' },
            { header: 'Alerta Mínimo', dataKey: 'minimo_alert' },
            { header: 'Precio Venta', dataKey: 'precio_venta' }
        ];

        const formattedData = items.map(item => ({
            ...item,
            precio_venta: `$ ${item.precio_venta.toFixed(2)}`
        }));

        if (type === 'PDF') {
            await this.exportToPDF(title, columns, formattedData, filename);
        } else {
            await this.exportToExcel('Inventario', columns, formattedData, filename);
        }
    }

    /**
     * Reporte específico de Analítica y BI
     */
    static async generateAnalyticsReport(data: { metrics: any, gastos: any[] }, range: number, type: 'PDF' | 'EXCEL') {
        const title = `Reporte de Inteligencia de Negocio (${range} días)`;
        const filename = `bi_analytics_${range}d_${new Date().toISOString().split('T')[0]}`;

        const summaryData: Record<string, any>[] = [
            { concepto: 'Ingresos Brutos', valor: `$ ${data.metrics.totalIncome.toLocaleString('es-MX')}` },
            { concepto: 'Gastos Operativos', valor: `$ ${data.metrics.totalExpenses.toLocaleString('es-MX')}` },
            { concepto: 'Utilidad Neta', valor: `$ ${data.metrics.netProfit.toLocaleString('es-MX')}` },
            { concepto: 'Margen de Utilidad', valor: `${data.metrics.profitMargin.toFixed(1)}%` },
            { concepto: 'Ticket Promedio', valor: `$ ${data.metrics.avgTicket.toLocaleString('es-MX')}` },
        ];

        const columnsSummary = [
            { header: 'Métrica / KPI', dataKey: 'concepto' },
            { header: 'Valor Actual', dataKey: 'valor' }
        ];

        try {
            if (type === 'PDF') {
                const doc = new jsPDF();
                const now = new Date().toLocaleString();

                doc.setFontSize(18);
                doc.setTextColor(249, 115, 22);
                doc.text('MUNDO DE PEKES - ADMIN OS', 14, 20);
                
                doc.setFontSize(14);
                doc.setTextColor(30, 41, 59);
                doc.text(title.toUpperCase(), 14, 30);
                
                doc.setFontSize(10);
                doc.setTextColor(100);
                doc.text(`Fecha de generación: ${now}`, 14, 38);

                // Tabla 1: Resumen
                doc.setFontSize(12);
                doc.setTextColor(30, 41, 59);
                doc.text('RESUMEN FINANCIERO', 14, 48);
                autoTable(doc, {
                    startY: 52,
                    head: [columnsSummary.map(col => col.header)],
                    body: summaryData.map(row => columnsSummary.map(col => row[col.dataKey])),
                    theme: 'striped',
                    headStyles: { fillColor: [249, 115, 22] },
                    alternateRowStyles: { fillColor: [240, 249, 255] }
                });

                // Tabla 2: Listado de Gastos
                const lastY = (doc as any).lastAutoTable.finalY + 15;
                doc.setFontSize(12);
                doc.text('DETALLE DE GASTOS EN EL PERIODO', 14, lastY);
                
                const columnsGastos = [
                    { header: 'Fecha', dataKey: 'fecha' },
                    { header: 'Categoría', dataKey: 'categoria' },
                    { header: 'Descripción', dataKey: 'descripcion' },
                    { header: 'Monto', dataKey: 'monto' }
                ];

                autoTable(doc, {
                    startY: lastY + 4,
                    head: [columnsGastos.map(col => col.header)],
                    body: (data.gastos || []).map(g => [
                        new Date(g.fecha).toLocaleDateString(),
                        g.categoria,
                        g.descripcion || 'Sin descripción',
                        `$ ${(g.monto || 0).toFixed(2)}`
                    ]),
                    theme: 'striped',
                    headStyles: { fillColor: [71, 85, 105] }, // Slate para gastos
                    alternateRowStyles: { fillColor: [240, 249, 255] }
                });

                doc.save(`${filename}.pdf`);
            } else {
                // Excel con dos hojas
                const workbook = new ExcelJS.Workbook();
                
                const wsSummary = workbook.addWorksheet('Resumen');
                wsSummary.columns = columnsSummary.map(col => ({ header: col.header, key: col.dataKey, width: 25 }));
                wsSummary.addRows(summaryData);

                const wsGastos = workbook.addWorksheet('Gastos Detallados');
                wsGastos.columns = [
                    { header: 'Fecha', key: 'fecha', width: 20 },
                    { header: 'Categoría', key: 'categoria', width: 20 },
                    { header: 'Descripción', key: 'descripcion', width: 35 },
                    { header: 'Monto', key: 'monto', width: 15 }
                ];
                wsGastos.addRows((data.gastos || []).map(g => ({
                    fecha: new Date(g.fecha).toLocaleDateString(),
                    categoria: g.categoria,
                    descripcion: g.descripcion,
                    monto: g.monto
                })));

                const buffer = await workbook.xlsx.writeBuffer();
                const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
                saveAs(blob, `${filename}.xlsx`);
            }
        } catch (error) {
            console.error('[ReportService] Error en Analítica:', error);
            throw new Error('Error al procesar los datos de analítica para el reporte.');
        }
    }
}
