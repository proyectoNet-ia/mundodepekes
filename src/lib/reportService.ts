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
            const blob = doc.output('blob');
            saveAs(blob, `${filename}.pdf`);
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
    static async generateClosureReport(session: any, _summary: any, type: 'PDF' | 'EXCEL') {
        const { data: dbSession, error: sError } = await supabase
            .from('arqueos_caja')
            .select('*')
            .eq('id', session.id)
            .single();

        if (sError || !dbSession) {
            console.error('Error fetching arqueo details:', sError);
            throw new Error('No se pudo encontrar el arqueo en la base de datos.');
        }

        const title = `Reporte de Cierre de Caja - Folio ${session.id.substring(0, 8)}`;
        const filename = `cierre_${session.id.substring(0, 8)}`;
        const start = dbSession.fecha_apertura;
        const end = dbSession.fecha_cierre || new Date().toISOString();

        // 1. Obtener Transacciones Detalladas y Mix de Paquetes vinculadas al Arqueo
        const { data: trans } = await supabase
            .from('transacciones')
            .select(`
                *,
                clientes(nombre),
                sesiones(paquetes(nombre))
            `)
            .eq('arqueo_id', session.id)
            .order('fecha', { ascending: true });

        const packageMix: Record<string, number> = {};
        let efectivo = 0;
        let tarjeta = 0;
        let cancelados_count = 0;
        let cancelados_monto = 0;
        const cancelledFolios = new Set<string>();
        const cancelledIds = new Set<string>();
        const cancelledDetailsMap: Record<string, { total: number; time: string; details: string[] }> = {};

        trans?.forEach(t => {
            if (t.estado === 'pagado') {
                if (t.metodo_pago?.toLowerCase().includes('efectivo')) {
                    efectivo += Number(t.total) || 0;
                } else {
                    tarjeta += Number(t.total) || 0;
                }
                t.sesiones?.forEach((s: any) => {
                    const name = s.paquetes?.nombre || 'Boleto POS / Otros';
                    packageMix[name] = (packageMix[name] || 0) + 1;
                });
            } else if (t.estado === 'cancelado') {
                cancelados_count += 1;
                cancelados_monto += Number(t.total) || 0;
                
                const folio = t.id.substring(0, 8).toUpperCase();
                cancelledFolios.add(folio);
                cancelledIds.add(t.id);
                
                const time = new Date(t.fecha).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                const accessDetails = t.sesiones?.map((s: any) => `1x ${s.paquetes?.nombre || 'Acceso'}`).join(', ') || '';
                
                cancelledDetailsMap[folio] = {
                    total: Number(t.total) || 0,
                    time: time,
                    details: accessDetails ? [accessDetails] : []
                };
            }
        });

        // 3. Obtener Gastos del Turno
        const { data: shiftExpenses } = await supabase
            .from('gastos_diarios')
            .select('*')
            .eq('arqueo_id', session.id);

        const gastos = shiftExpenses?.reduce((acc, e) => acc + (Number(e.monto) || 0), 0) || 0;

        // 4. Obtener Productos Vendidos en el Corte
        let soldProducts: { nombre: string; cantidad: number; categoria?: string }[] = [];
        try {
            const { data: movs } = await supabase
                .from('movimientos_inventario')
                .select(`
                    cantidad,
                    tipo,
                    motivo,
                    created_at,
                    inventario (
                        nombre,
                        categoria
                    )
                `)
                .in('tipo', ['salida', 'entrada'])
                .gte('created_at', start)
                .lte('created_at', end);

            const map: Record<string, { cantidad: number; categoria?: string }> = {};
            movs?.forEach((mov: any) => {
                const motivo = mov.motivo || '';
                const isSalidaVenta = mov.tipo === 'salida' && (motivo.toLowerCase().includes('venta') || motivo.toLowerCase().includes('pos'));
                const isEntradaAnulacion = mov.tipo === 'entrada' && (motivo.toLowerCase().includes('anulaci') || motivo.toLowerCase().includes('cancelad'));

                if (!isSalidaVenta && !isEntradaAnulacion) {
                    return; 
                }
                const nombre = mov.inventario?.nombre || 'Producto Desconocido';
                const categoriaDb = mov.inventario?.categoria || 'General';
                const qty = Number(mov.cantidad) || 0;
                
                let isCancelledSale = false;
                let relatedFolio = '';

                if (isEntradaAnulacion) {
                    const match = motivo.match(/Folio:\s*([A-Za-z0-9]+)/i);
                    if (match && match[1]) {
                        relatedFolio = match[1].toUpperCase();
                        isCancelledSale = true;
                    }
                } else if (isSalidaVenta) {
                    for (const id of cancelledIds) {
                        if (motivo.includes(id)) {
                            relatedFolio = id.substring(0,8).toUpperCase();
                            isCancelledSale = true;
                            break;
                        }
                    }
                    if (!isCancelledSale) {
                        for (const fol of cancelledFolios) {
                            if (motivo.includes(fol)) {
                                relatedFolio = fol;
                                isCancelledSale = true;
                                break;
                            }
                        }
                    }
                }

                if (isCancelledSale && relatedFolio && cancelledDetailsMap[relatedFolio]) {
                    // Only use the 'salida' to populate details to avoid duplication
                    if (isSalidaVenta) {
                        cancelledDetailsMap[relatedFolio].details.push(`${qty}x ${nombre}`);
                    }
                    // Skip counting it in the soldProducts summary
                    return;
                }

                const finalQty = isEntradaAnulacion ? -qty : qty;

                let categoria = categoriaDb;
                const c = (categoriaDb || '').toLowerCase();
                const n = (nombre || '').toLowerCase();
                
                if (c.includes('ropa') || c.includes('calcet') || n.includes('calcet') || n.includes('sock') || n.includes('media')) {
                    categoria = 'Ropa';
                } else if (c.includes('bebida') || c.includes('refresco') || c.includes('agua') || 
                           n.includes('agua') || n.includes('refresco') || n.includes('powerade') || 
                           n.includes('ciel') || n.includes('coca') || n.includes('sprite') || n.includes('fanta') || n.includes('jugo')) {
                    categoria = 'Bebidas';
                }

                if (map[nombre]) {
                    map[nombre].cantidad += finalQty;
                } else {
                    map[nombre] = { cantidad: finalQty, categoria };
                }
            });

            const getCategoryPriority = (catName: string, prodName: string) => {
              const c = (catName || '').toLowerCase();
              const p = (prodName || '').toLowerCase();
              
              if (c.includes('calcet') || p.includes('calcet') || p.includes('sock') || p.includes('media')) return 1;
              if (c.includes('agua') || p.includes('agua') || p.includes('ciel') || p.includes('bonafont') || p.includes('epura')) return 2;
              if (c.includes('refresco') || c.includes('bebida') || p.includes('coca') || p.includes('fanta') || p.includes('sprite') || p.includes('mundet') || p.includes('sidral') || p.includes('pepsi') || p.includes('lata') || p.includes('powerade') || p.includes('jugo')) return 3;
              if (c.includes('papas') || c.includes('churrum') || c.includes('sabrita') || c.includes('snack') || c.includes('dulce') || p.includes('papas') || p.includes('sabrita') || p.includes('chocolate')) return 4;
              return 5;
            };

            soldProducts = Object.entries(map)
                .filter(([_, details]) => details.cantidad > 0)
                .map(([nombre, details]) => ({
                nombre,
                cantidad: details.cantidad,
                categoria: details.categoria || 'General'
            })).sort((a, b) => {
              const priorityA = getCategoryPriority(a.categoria, a.nombre);
              const priorityB = getCategoryPriority(b.categoria, b.nombre);
              
              if (priorityA !== priorityB) {
                return priorityA - priorityB;
              }
              return a.nombre.localeCompare(b.nombre);
            });
        } catch (err) {
            console.error('Error fetching sold products for report:', err);
        }

        // Calcular totales de Bebidas y Ropa/Calcetines para incluirlos en el reporte
        let totalBebidas = 0;
        let totalRopa = 0;
        soldProducts.forEach(p => {
            const cat = (p.categoria || '').toLowerCase();
            const name = (p.nombre || '').toLowerCase();
            
            if (cat.includes('ropa') || cat.includes('calcet') || name.includes('calcet') || name.includes('sock') || name.includes('media')) {
                totalRopa += p.cantidad;
            } else if (cat.includes('bebida') || cat.includes('refresco') || cat.includes('agua') || 
                       name.includes('agua') || name.includes('refresco') || name.includes('powerade') || 
                       name.includes('ciel') || name.includes('coca') || name.includes('sprite') || name.includes('fanta') || name.includes('jugo')) {
                totalBebidas += p.cantidad;
            }
        });

        const summaryData: Record<string, any>[] = [
            { concepto: 'Fondo Inicial', monto: `$ ${(Number(dbSession.monto_inicial) || 0).toFixed(2)}` },
            { concepto: 'Ventas en Efectivo (+)', monto: `$ ${efectivo.toFixed(2)}` },
            { concepto: 'SALDO NETO ESPERADO EN EFECTIVO', monto: `$ ${(Number(dbSession.monto_inicial) + efectivo - gastos).toFixed(2)}` },
            { concepto: 'Efectivo Real Contado', monto: `$ ${dbSession.monto_final_real != null ? Number(dbSession.monto_final_real).toFixed(2) : '---'}` },
            { concepto: 'Diferencia Efectivo (+/-)', monto: `$ ${(dbSession.monto_final_real != null ? (Number(dbSession.monto_final_real) - (Number(dbSession.monto_inicial) + efectivo - gastos)) : 0).toFixed(2)}` },
            { concepto: '----------------------------', monto: '------------' },
            { concepto: 'Ventas Tarjeta Esperadas', monto: `$ ${tarjeta.toFixed(2)}` },
            { concepto: 'Vouchers Tarjeta (Físico)', monto: `$ ${dbSession.monto_final_tarjeta_real != null ? Number(dbSession.monto_final_tarjeta_real).toFixed(2) : '---'}` },
            { concepto: 'Diferencia Tarjeta (+/-)', monto: `$ ${(dbSession.monto_final_tarjeta_real != null ? (Number(dbSession.monto_final_tarjeta_real) - tarjeta) : 0).toFixed(2)}` },
            { concepto: '----------------------------', monto: '------------' },
            { concepto: 'Operaciones Anuladas (Cant)', monto: `${cancelados_count} transacciones` },
            { concepto: 'Monto Total Anulado (Ref)', monto: `$ ${cancelados_monto.toFixed(2)}` },
            { concepto: 'Observaciones', monto: dbSession.observaciones || 'Sin notas' },
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
            
            // Tabla 2.2: Productos Vendidos
            const prodY = (doc as any).lastAutoTable.finalY + 15;
            doc.text('PRODUCTOS VENDIDOS EN EL CORTE', 14, prodY);
            
            const prodRows = soldProducts.map(p => [p.nombre, p.categoria || 'General', p.cantidad]);
            if (prodRows.length > 0) {
                prodRows.push(['------------------------------------------------', '--------------------', '-----']);
                prodRows.push(['TOTAL BEBIDAS VENDIDAS', 'Resumen', totalBebidas]);
                prodRows.push(['TOTAL ROPA / CALCETINES VENDIDOS', 'Resumen', totalRopa]);
            }

            autoTable(doc, {
                startY: prodY + 4,
                head: [['Producto', 'Categoría', 'Cantidad']],
                body: prodRows,
                theme: 'grid',
                headStyles: { fillColor: [79, 70, 229] }
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

            // Tabla 2.6: Detalle de Tickets Cancelados
            const cancelledFolios = Object.keys(cancelledDetailsMap);
            if (cancelledFolios.length > 0) {
                const cancelY = (doc as any).lastAutoTable.finalY + 15;
                doc.setTextColor(30, 41, 59);
                doc.text('DETALLE DE TICKETS CANCELADOS', 14, cancelY);
                autoTable(doc, {
                    startY: cancelY + 4,
                    head: [['Hora', 'Folio', 'Monto', 'Productos / Accesos']],
                    body: cancelledFolios.map(folio => {
                        const info = cancelledDetailsMap[folio];
                        return [
                            info.time,
                            folio,
                            `$ ${info.total.toFixed(2)}`,
                            info.details.length > 0 ? info.details.join(' | ') : 'Sin productos'
                        ];
                    }),
                    theme: 'striped',
                    headStyles: { fillColor: [220, 38, 38] }, // Red for cancellations
                    alternateRowStyles: { fillColor: [254, 242, 242] }
                });
            }

            // Tabla 3: Detalle de Transacciones (Salto de página si es necesario)
            doc.addPage();
            doc.setTextColor(30, 41, 59);
            doc.text('LISTADO DETALLADO DE TRANSACCIONES', 14, 20);
            autoTable(doc, {
                startY: 25,
                head: [['Hora', 'ID Folio', 'Cliente', 'Método / Estado', 'Total']],
                body: (trans || []).map(t => [
                    new Date(t.fecha).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                    t.id.substring(0, 8).toUpperCase(),
                    t.clientes?.nombre || 'Venta POS',
                    t.estado === 'cancelado' ? 'CANCELADO' : t.metodo_pago.toUpperCase(),
                    t.estado === 'cancelado' ? `(Anulado) $ ${t.total.toFixed(2)}` : `$ ${t.total.toFixed(2)}`
                ]),
                theme: 'striped',
                headStyles: { fillColor: [249, 115, 22] },
                alternateRowStyles: { fillColor: [240, 249, 255] }
            });

            const blob = doc.output('blob');
            saveAs(blob, `${filename}.pdf`);
        } else {
            // Excel detallado con 3 hojas
            const workbook = new ExcelJS.Workbook();
            
            const wsRes = workbook.addWorksheet('Resumen de Arqueo');
            wsRes.columns = [{header: 'Concepto', key: 'c', width: 30}, {header: 'Valor', key: 'v', width: 20}];
            wsRes.addRows(summaryData.map(d => ({c: d.concepto, v: d.monto})));

            const wsMix = workbook.addWorksheet('Mix de Paquetes');
            wsMix.columns = [{header: 'Paquete', key: 'p', width: 30}, {header: 'Cantidad', key: 'q', width: 15}];
            wsMix.addRows(Object.entries(packageMix).map(([p, q]) => ({p, q})));

            const wsProd = workbook.addWorksheet('Productos Vendidos');
            wsProd.columns = [
                {header: 'Producto', key: 'n', width: 30},
                {header: 'Categoría', key: 'c', width: 25},
                {header: 'Cantidad', key: 'q', width: 15}
            ];
            wsProd.addRows(soldProducts.map(p => ({n: p.nombre, c: p.categoria || 'General', q: p.cantidad})));
            if (soldProducts.length > 0) {
                wsProd.addRow({n: '------------------------------------------------', c: '--------------------', q: '-----'});
                wsProd.addRow({n: 'TOTAL BEBIDAS VENDIDAS', c: 'Resumen', q: totalBebidas});
                wsProd.addRow({n: 'TOTAL ROPA / CALCETINES VENDIDOS', c: 'Resumen', q: totalRopa});
            }

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
                {header: 'Cliente', key: 'c', width: 25},
                {header: 'Método/Estado', key: 'm', width: 15},
                {header: 'Total Cobrado', key: 't', width: 15}
            ];
            wsTrans.addRows((trans || []).map(t => ({
                f: new Date(t.fecha).toLocaleString(),
                id: t.id.substring(0, 8).toUpperCase(),
                c: t.clientes?.nombre || 'Venta POS',
                m: t.estado === 'cancelado' ? 'CANCELADO' : t.metodo_pago,
                t: t.estado === 'cancelado' ? 0 : t.total
            })));

            const cancelledFoliosEx = Object.keys(cancelledDetailsMap);
            if (cancelledFoliosEx.length > 0) {
                const wsCancel = workbook.addWorksheet('Tickets Cancelados');
                wsCancel.columns = [
                    {header: 'Hora', key: 'h', width: 15},
                    {header: 'Folio', key: 'f', width: 15},
                    {header: 'Monto', key: 'm', width: 15},
                    {header: 'Productos / Accesos', key: 'p', width: 60}
                ];
                cancelledFoliosEx.forEach(folio => {
                    const info = cancelledDetailsMap[folio];
                    wsCancel.addRow({
                        h: info.time,
                        f: folio,
                        m: info.total,
                        p: info.details.length > 0 ? info.details.join(' | ') : 'Sin productos'
                    });
                });
            }

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

                const blob = doc.output('blob');
                saveAs(blob, `${filename}.pdf`);
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
