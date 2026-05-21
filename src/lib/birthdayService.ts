import { supabase } from './supabase';
import { stockService } from './stockService';

export interface Cumpleanos {
    id: string;
    nombre_festejado: string;
    nombre_cliente: string;
    telefono_cliente: string;
    fecha_evento: string;
    hora_inicio: string;
    anticipo_pagado: number;
    metodo_pago_anticipo: string;
    estado: 'agendado' | 'en_curso' | 'liquidado' | 'cancelado';
    total_final: number;
    precio_por_nino: number;
    paquete_id?: string;
    area?: string;
    created_at: string;
}

export interface NinoCumpleanos {
    id: string;
    cumpleanos_id: string;
    nombre_nino: string;
    hora_ingreso: string;
    refresco_entregado: boolean;
}

export const birthdayService = {
    async getAgendadosYEnCurso() {
        const { data, error } = await supabase
            .from('eventos_cumpleanos')
            .select('*')
            .in('estado', ['agendado', 'en_curso'])
            .order('fecha_evento', { ascending: true })
            .order('hora_inicio', { ascending: true });
        
        if (error) throw error;
        return data as Cumpleanos[];
    },

    async getTodos() {
        const { data, error } = await supabase
            .from('eventos_cumpleanos')
            .select('*')
            .order('fecha_evento', { ascending: false });
        
        if (error) throw error;
        return data as Cumpleanos[];
    },

    async createEvento(evento: Omit<Cumpleanos, 'id' | 'created_at' | 'estado' | 'total_final'>) {
        try {
            const { data, error } = await supabase
                .from('eventos_cumpleanos')
                .insert({ ...evento, estado: 'agendado', total_final: 0 })
                .select()
                .single();
            
            if (error) {
                // Si la columna no existe (migración no ejecutada), reintentamos sin los nuevos campos
                if (error.message.includes('column') || error.message.includes('schema cache')) {
                    console.warn("⚠️ Las columnas nuevas no existen en Supabase. Intentando fallback sin paquete_id ni area.");
                    const { paquete_id, area, ...fallbackEvento } = evento as any;
                    const { data: fbData, error: fbError } = await supabase
                        .from('eventos_cumpleanos')
                        .insert({ ...fallbackEvento, estado: 'agendado', total_final: 0 })
                        .select()
                        .single();
                    if (fbError) throw fbError;
                    return fbData as Cumpleanos;
                }
                throw error;
            }
            if (evento.anticipo_pagado && evento.anticipo_pagado > 0) {
                await birthdayService.registrarTransaccionFinanciera(evento.anticipo_pagado, evento.metodo_pago_anticipo, data.paquete_id, `Anticipo de cumpleaños (Festejado: ${evento.nombre_festejado})`);
            }
            return data as Cumpleanos;
        } catch (err) {
            console.error("Error en createEvento:", err);
            throw err;
        }
    },

    async cambiarEstado(id: string, nuevoEstado: Cumpleanos['estado'], totalFinal: number = 0) {
        const updateData: any = { estado: nuevoEstado, total_final: totalFinal };
        
        if (nuevoEstado === 'en_curso') {
            const ahora = new Date();
            const year = ahora.getFullYear();
            const month = String(ahora.getMonth() + 1).padStart(2, '0');
            const day = String(ahora.getDate()).padStart(2, '0');
            const horas = String(ahora.getHours()).padStart(2, '0');
            const minutos = String(ahora.getMinutes()).padStart(2, '0');
            
            updateData.fecha_evento = `${year}-${month}-${day}`;
            updateData.hora_inicio = `${horas}:${minutos}`;
        }

        const { error } = await supabase
            .from('eventos_cumpleanos')
            .update(updateData)
            .eq('id', id);
        
        if (error) throw error;
    },

    async getDetallesEvento(cumpleanosId: string) {
        const { data, error } = await supabase
            .from('ninos_cumpleanos')
            .select('*')
            .eq('cumpleanos_id', cumpleanosId)
            .order('hora_ingreso', { ascending: true });
        
        if (error) throw error;
        return data as NinoCumpleanos[];
    },

    async ingresarNino(cumpleanosId: string, nombreNino: string, descuentaRefresco: boolean = true) {
        // Registrar al niño
        const { data, error } = await supabase
            .from('ninos_cumpleanos')
            .insert({
                cumpleanos_id: cumpleanosId,
                nombre_nino: nombreNino,
                refresco_entregado: descuentaRefresco
            })
            .select()
            .single();
            
        if (error) throw error;

        // Descontar inventario automáticamente (1 refresco)
        if (descuentaRefresco) {
            try {
                const inventario = await stockService.getInventory();
                const refresco = inventario.find(i => i.nombre.toLowerCase().includes('refresco') || i.categoria.toLowerCase().includes('refresco'));
                
                if (refresco) {
                    await stockService.recordMovement(refresco.id, 1, 'salida', `Consumo automático cumpleaños (Niño: ${nombreNino})`);
                }
            } catch (err) {
                console.error("Error al descontar refresco automáticamente:", err);
            }
        }

        return data as NinoCumpleanos;
    },

    async eliminarNino(ninoId: string, refresco_entregado: boolean, nombreNino: string) {
        // Si se le descontó refresco, lo regresamos al inventario
        if (refresco_entregado) {
            try {
                const inventario = await stockService.getInventory();
                const refresco = inventario.find(i => i.nombre.toLowerCase().includes('refresco') || i.categoria.toLowerCase().includes('refresco'));
                
                if (refresco) {
                    await stockService.recordMovement(refresco.id, 1, 'entrada', `Ajuste por eliminación de niño en cumpleaños (${nombreNino})`);
                }
            } catch (err) {
                console.error("Error al devolver refresco automáticamente:", err);
            }
        }

        const { error } = await supabase
            .from('ninos_cumpleanos')
            .delete()
            .eq('id', ninoId);
            
        if (error) throw error;
    },

    async registrarTransaccionFinanciera(monto: number, metodoPago: string, paqueteId: string | undefined, descripcion: string) {
        if (monto <= 0) return;
        try {
            const { getActiveSession } = await import('./treasuryService');
            const { AuditService } = await import('./auditService');
            
            const session = await getActiveSession();
            if (!session) return; // Si no hay caja abierta, no registramos transacción
            
            const { data, error } = await supabase.from('transacciones').insert({
                total: monto,
                metodo_pago: metodoPago,
                arqueo_id: session.id,
                es_privado: true,
                paquete_id: paqueteId || null
            }).select('id').single();
            
            if (!error && data) {
                await AuditService.log({
                    accion: 'VENTAS' as any,
                    modulo: 'VENTAS',
                    descripcion: `${descripcion} por $ ${monto}`,
                    metadatos: { transaction_id: data.id, arqueo_id: session.id, evento_cumpleanos: true }
                });
            } else if (error) {
                console.error("Error al registrar transaccion financiera de cumpleaños:", error);
            }
        } catch (e) {
            console.error("Fallo al ejecutar registrarTransaccionFinanciera:", e);
        }
    }
};
