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

export const notificationsService = {
    /**
     * Registra una nueva notificación en DB y la emite en tiempo real
     */
    async notify(type: NotificationType, title: string, message: string, metadata?: any) {
        try {
            // 🚫 DEDUPLICACIÓN INTELIGENTE: No enviar si hay una alerta igual sin leer
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
                .select()
                .single();

            if (error) throw error;
            return { success: true, notification: data };
        } catch (error) {
            console.error('Error al emitir notificación:', error);
            return { success: false, error };
        }
    },

    /**
     * Obtiene las notificaciones más recientes
     */
    async getRecent(limit = 20) {
        const { data, error } = await supabase
            .from('notificaciones')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(limit);
        
        if (error) return [];
        return data as Notification[];
    },

    /**
     * Marca una notificación como leída
     */
    async markAsRead(id: string) {
        await supabase
            .from('notificaciones')
            .update({ read: true })
            .eq('id', id);
    },

    /**
     * Escucha notificaciones en tiempo real
     */
    subscribe(callback: (notification: Notification) => void) {
        return supabase
            .channel('public:notificaciones')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notificaciones' }, payload => {
                callback(payload.new as Notification);
            })
            .subscribe();
    }
};
