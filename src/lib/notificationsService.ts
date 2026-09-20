import { supabase } from './supabase';

export type NotificationType = 'cash_open' | 'cash_close' | 'low_stock' | 'expense' | 'auth_request';

export interface Notification {
    id: string;
    created_at: string;
    type: NotificationType;
    title: string;
    message: string;
    user_id?: string;
    read: boolean;
    metadata?: any;
}

const NOTIF_CHANNEL_NAME = 'global-notif-events';

// Helper para emisión de notificaciones instantáneas vía broadcast
const sendNotifBroadcast = (event: string, payload: any) => {
    try {
        supabase.channel(NOTIF_CHANNEL_NAME).send({
            type: 'broadcast',
            event,
            payload
        });
    } catch (err) {
        console.debug('Error enviando broadcast de notificación:', err);
    }
};

export const notificationsService = {
    /**
     * Registra una nueva notificación en DB y la emite en tiempo real
     */
    async notify(type: NotificationType, title: string, message: string, metadata?: any) {
        try {
            // 🚫 DEDUPLICACIÓN INTELIGENTE:
            // Para alertas operativas de inventario/caja, evitar alertas duplicadas sin leer.
            // Para solicitudes de firma ('auth_request'), no bloquear si pertenecen a solicitudes distintas.
            if (type !== 'auth_request') {
                const { data: existing } = await supabase
                    .from('notificaciones')
                    .select('id')
                    .eq('type', type)
                    .eq('title', title)
                    .eq('read', false)
                    .limit(1)
                    .maybeSingle();

                if (existing) {
                    return { success: true, skipped: true };
                }
            }

            const { data: authData } = await supabase.auth.getUser();
            const userId = authData?.user?.id || null;
            
            const { data, error } = await supabase
                .from('notificaciones')
                .insert([{
                    type,
                    title,
                    message,
                    user_id: userId,
                    metadata,
                    read: false
                }])
                .select('id, created_at, type, title, message, user_id, read, metadata')
                .single();

            if (error) throw error;
            
            // ✅ Emisión ultra-rápida (Broadcast en canal unificado)
            sendNotifBroadcast('new_notification', data);

            return { success: true, notification: data };
        } catch (error) {
            console.error('Error al emitir notificación:', error);
            return { success: false, error };
        }
    },

    /**
     * Obtiene las notificaciones más recientes (Últimas 24 horas)
     */
    async getRecent(limit = 20) {
        const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const { data, error } = await supabase
            .from('notificaciones')
            .select('id, created_at, type, title, message, user_id, read, metadata')
            .gte('created_at', twentyFourHoursAgo)
            .order('created_at', { ascending: false })
            .limit(limit);
        
        if (error) return [];
        return data as Notification[];
    },

    /**
     * Marca una notificación como leída
     */
    async markAsRead(id: string) {
        const { error } = await supabase
            .from('notificaciones')
            .update({ read: true })
            .eq('id', id);
        if (error) throw error;
    },

    /**
     * Marca todas las notificaciones pendientes como leídas
     */
    async markAllAsRead() {
        const { error } = await supabase
            .from('notificaciones')
            .update({ read: true })
            .eq('read', false);
        
        if (error) throw error;
    },

    /**
     * Escucha notificaciones en tiempo real
     */
    subscribe(callback: (notification: Notification) => void) {
        return supabase
            .channel(NOTIF_CHANNEL_NAME)
            .on(
                'postgres_changes', 
                { event: 'INSERT', schema: 'public', table: 'notificaciones' }, 
                payload => {
                    callback(payload.new as Notification);
                }
            )
            .on(
                'broadcast',
                { event: 'new_notification' },
                (payload) => {
                    if (payload.payload) {
                        callback(payload.payload as Notification);
                    }
                }
            )
            .subscribe();
    }
};

