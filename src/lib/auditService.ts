import { supabase } from './supabase';

export interface AuditLog {
    usuario_id?: string;
    accion: 'APERTURA' | 'CIERRE' | 'ANULACION' | 'RETIRO_PARCIAL' | 'STOCK_ADJUST' | 'DISCREPANCIA';
    modulo: 'TESORERIA' | 'STOCK' | 'VENTAS' | 'ADMIN';
    descripcion: string;
    metadatos?: any;
    severidad?: 'INFO' | 'WARN' | 'CRITICAL';
}

export class AuditService {
    /**
     * Registra un evento en la bitácora de auditoría
     */
    static async log(entry: AuditLog) {
        try {
            const { error } = await supabase
                .from('bitacora_auditoria')
                .insert([{
                    ...entry,
                    fecha: new Date().toISOString()
                }]);

            if (error) throw error;
            console.log(`[Audit] Log registrado: ${entry.accion} - ${entry.modulo}`);
        } catch (error) {
            console.error('[Audit] Error registrando log:', error);
        }
    }

    /**
     * Obtiene los últimos eventos de auditoría
     */
    static async getRecentLogs(limit = 20) {
        const { data, error } = await supabase
            .from('bitacora_auditoria')
            .select('*')
            .order('fecha', { ascending: false })
            .limit(limit);

        if (error) throw error;
        return data;
    }
}
