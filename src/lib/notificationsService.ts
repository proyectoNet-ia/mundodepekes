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

const localBroadcast = typeof window !== 'undefined' && 'BroadcastChannel' in window 
    ? new BroadcastChannel('mundodepekes_local_notifs') 
    : null;

export const notificationsService = {
    /**
     * Registra una nueva notificación en DB y la emite localmente entre pestañas
     */
    async notify(type: NotificationType, title: string, message: string, metadata?: any) {
        try {
            // 🚫 DEDUPLICACIÓN INTELIGENTE:
            // Para alertas operativas de inventario/caja, evitar alertas duplicadas sin leer.
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
            
            // ✅ Emisión local instantánea (sin WebSockets)
            localBroadcast?.postMessage({ type: 'new_notification', payload: data });

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
        try {
            const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
            const { data, error } = await supabase
                .from('notificaciones')
                .select('id, created_at, type, title, message, user_id, read, metadata')
                .gte('created_at', twentyFourHoursAgo)
                .order('created_at', { ascending: false })
                .limit(limit);
            
            if (error) return [];
            return (data || []) as Notification[];
        } catch {
            return [];
        }
    },

    /**
     * Marca una notificación como leída
     */
    async markAsRead(id: string) {
        try {
            const { error } = await supabase
                .from('notificaciones')
                .update({ read: true })
                .eq('id', id);
            if (error) throw error;
        } catch (err) {
            console.warn('Error marcando notificación como leída:', err);
        }
    },

    /**
     * Marca todas las notificaciones pendientes como leídas
     */
    async markAllAsRead() {
        try {
            const { error } = await supabase
                .from('notificaciones')
                .update({ read: true })
                .eq('read', false);
            
            if (error) throw error;
        } catch (err) {
            console.warn('Error marcando todas las notificaciones como leídas:', err);
        }
    },

    /**
     * Escucha notificaciones locales entre pestañas
     */
    subscribe(callback: (notification: Notification) => void) {
        if (!localBroadcast) {
            return { unsubscribe: () => {} };
        }

        const handler = (event: MessageEvent) => {
            if (event.data?.type === 'new_notification' && event.data.payload) {
                callback(event.data.payload as Notification);
            }
        };

        localBroadcast.addEventListener('message', handler);

        return {
            unsubscribe: () => {
                localBroadcast.removeEventListener('message', handler);
            }
        };
    }
};

