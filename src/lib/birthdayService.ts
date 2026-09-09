import { supabase } from './supabase';

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
    arqueo_id?: string;
    extras_liquidados?: any[];
    cant_ninos?: number;
}

export interface NinoCumpleanos {
    id: string;
    cumpleanos_id: string;
    nombre_nino: string;
    hora_ingreso: string;
    refresco_entregado: boolean;
    paquete_id?: string;
    costo_unitario?: number;
    paquetes?: {
        nombre: string;
        area: string;
    };
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

    async updateEvento(id: string, updates: Partial<Cumpleanos>) {
        try {
            const { data, error } = await supabase
                .from('eventos_cumpleanos')
                .update(updates)
                .eq('id', id)
                .select()
                .single();
            
            if (error) {
                if (error.message.includes('column') || error.message.includes('schema cache')) {
                    console.warn("⚠️ Las columnas nuevas no existen en Supabase. Intentando fallback sin paquete_id ni area.");
                    const { paquete_id, area, ...fallbackUpdates } = updates as any;
                    const { data: fbData, error: fbError } = await supabase
                        .from('eventos_cumpleanos')
                        .update(fallbackUpdates)
                        .eq('id', id)
                        .select()
                        .single();
                    if (fbError) throw fbError;
                    return fbData as Cumpleanos;
                }
                throw error;
            }
            return data as Cumpleanos;
        } catch (err) {
            console.error("Error en updateEvento:", err);
            throw err;
        }
    },

    async cambiarEstado(
        id: string, 
        nuevoEstado: Cumpleanos['estado'], 
        totalFinal: number = 0, 
        arqueoId?: string, 
        extrasLiquidados?: any[],
        cantNinos?: number
    ) {
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

        if (nuevoEstado === 'liquidado') {
            if (arqueoId) {
                updateData.arqueo_id = arqueoId;
            }
            if (extrasLiquidados) {
                updateData.extras_liquidados = extrasLiquidados;
            }
            if (cantNinos !== undefined) {
                updateData.cant_ninos = cantNinos;
            }
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
            .select('*, paquetes(nombre, area)')
            .eq('cumpleanos_id', cumpleanosId)
            .order('hora_ingreso', { ascending: true });
        
        if (error) throw error;
        return data as NinoCumpleanos[];
    },

    async ingresarNino(cumpleanosId: string, nombreNino: string, descuentaRefresco: boolean = true, paqueteId?: string, costoUnitario?: number) {
        // Registrar al niño
        const { data, error } = await supabase
            .from('ninos_cumpleanos')
            .insert({
                cumpleanos_id: cumpleanosId,
                nombre_nino: nombreNino,
                refresco_entregado: descuentaRefresco,
                paquete_id: paqueteId || null,
                costo_unitario: costoUnitario || 0
            })
            .select()
            .single();
            
        if (error) throw error;



        return data as NinoCumpleanos;
    },

    async eliminarNino(ninoId: string, _refresco_entregado: boolean, _nombreNino: string) {


        const { error } = await supabase
            .from('ninos_cumpleanos')
            .delete()
            .eq('id', ninoId);
            
        if (error) throw error;
    },

    async updateNino(ninoId: string, nombreNino: string, paqueteId: string, costoUnitario: number) {
        const { error } = await supabase
            .from('ninos_cumpleanos')
            .update({ 
                nombre_nino: nombreNino,
                paquete_id: paqueteId,
                costo_unitario: costoUnitario
            })
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
                es_privado: false,
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
    },

    async getTransaccionLiquidacion(evento: Cumpleanos) {
        if (!evento.arqueo_id) return null;
        try {
            // 1. Buscar por bitácora de auditoría vinculada al festejo
            const { data: logs } = await supabase
                .from('bitacora_auditoria')
                .select('*')
                .ilike('descripcion', `%${evento.nombre_festejado}%`)
                .order('fecha', { ascending: false })
                .limit(5);

            if (logs && logs.length > 0) {
                for (const log of logs) {
                    const txId = log.metadatos?.transaction_id;
                    if (txId) {
                        const { data: tx } = await supabase
                            .from('transacciones')
                            .select('*')
                            .eq('id', txId)
                            .single();
                        if (tx) return tx;
                    }
                }
            }

            // 2. Fallback: buscar transacción en el arqueo con el paquete_id
            if (evento.paquete_id) {
                const { data: txs } = await supabase
                    .from('transacciones')
                    .select('*')
                    .eq('arqueo_id', evento.arqueo_id)
                    .eq('paquete_id', evento.paquete_id)
                    .order('created_at', { ascending: false })
                    .limit(1);
                if (txs && txs.length > 0) return txs[0];
            }
        } catch (e) {
            console.error("Error al buscar transacción de liquidación:", e);
        }
        return null;
    },

    async ajustarLiquidacionAdmin(
        eventoId: string, 
        params: {
            nombre_festejado?: string;
            nombre_cliente?: string;
            telefono_cliente?: string;
            anticipo_pagado?: number;
            metodo_pago_anticipo?: string;
            metodo_pago_liquidacion?: string;
            adminName?: string;
            adminId?: string;
        }
    ) {
        const { AuditService } = await import('./auditService');
        
        // 1. Obtener datos actuales del evento
        const { data: currentEvent, error: evErr } = await supabase
            .from('eventos_cumpleanos')
            .select('*')
            .eq('id', eventoId)
            .single();
            
        if (evErr) throw evErr;

        // 2. Actualizar evento
        const updateEventData: any = {};
        if (params.nombre_festejado !== undefined) updateEventData.nombre_festejado = params.nombre_festejado;
        if (params.nombre_cliente !== undefined) updateEventData.nombre_cliente = params.nombre_cliente;
        if (params.telefono_cliente !== undefined) updateEventData.telefono_cliente = params.telefono_cliente;
        if (params.anticipo_pagado !== undefined) updateEventData.anticipo_pagado = params.anticipo_pagado;
        if (params.metodo_pago_anticipo !== undefined) updateEventData.metodo_pago_anticipo = params.metodo_pago_anticipo;

        const { error: updErr } = await supabase
            .from('eventos_cumpleanos')
            .update(updateEventData)
            .eq('id', eventoId);
            
        if (updErr) throw updErr;

        // 3. Si se especificó cambio de método de pago de liquidación, actualizar la transacción
        let txUpdated: any = null;
        if (params.metodo_pago_liquidacion && currentEvent.arqueo_id) {
            const tx = await this.getTransaccionLiquidacion(currentEvent);
            if (tx) {
                const { data: updatedTx, error: txErr } = await supabase
                    .from('transacciones')
                    .update({ metodo_pago: params.metodo_pago_liquidacion })
                    .eq('id', tx.id)
                    .select()
                    .single();
                if (!txErr) txUpdated = updatedTx;
            }
        }

        // 4. Registrar en bitácora de auditoría
        await AuditService.log({
            usuario_id: params.adminId,
            accion: 'ADMIN' as any,
            modulo: 'ADMIN',
            descripcion: `Ajuste administrativo de cumpleaños (${currentEvent.nombre_festejado}) por ${params.adminName || 'Admin'}`,
            metadatos: {
                evento_id: eventoId,
                cambios: {
                    ...params,
                    transaccion_id: txUpdated?.id,
                    metodo_liquidacion_nuevo: params.metodo_pago_liquidacion
                }
            }
        });

        return true;
    }
};
