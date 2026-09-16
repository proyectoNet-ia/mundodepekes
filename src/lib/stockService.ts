import { supabase } from './supabase';
import { notificationsService } from './notificationsService';

export interface StockItem {
    id: string;
    nombre: string;
    categoria: string;
    cantidad: number;
    minimo_alert: number;
    precio_venta: number;
    activo?: boolean;
}

export interface InventoryMovement {
    id: string;
    item_id: string;
    tipo: 'entrada' | 'salida' | 'ajuste';
    cantidad: number;
    motivo: string;
    created_at: string;
    inventario?: { nombre: string };
    usuario_nombre?: string;
    usuario_email?: string;
    usuario_rol?: string;
}

export const stockService = {
    async getInventory(): Promise<StockItem[]> {
        if (!navigator.onLine) {
            const cached = localStorage.getItem('cache_inventario');
            if (cached) return JSON.parse(cached);
            return [];
        }

        try {
            const { data, error } = await supabase
                .from('inventario')
                .select('*')
                .eq('activo', true)
                .order('nombre');
            
            if (error) throw error;
            
            // Guardar en caché local
            localStorage.setItem('cache_inventario', JSON.stringify(data || []));
            return data || [];
        } catch (e) {
            console.warn('Fallo al obtener inventario. Recurriendo a caché...', e);
            const cached = localStorage.getItem('cache_inventario');
            return cached ? JSON.parse(cached) : [];
        }
    },

    async getMovements(limit = 500, startDate?: string, endDate?: string): Promise<InventoryMovement[]> {
        let query = supabase
            .from('movimientos_inventario')
            .select('*, inventario(nombre)')
            .order('created_at', { ascending: false });
            
        if (startDate) {
            query = query.gte('created_at', `${startDate}T00:00:00`);
        }
        if (endDate) {
            query = query.lte('created_at', `${endDate}T23:59:59.999`);
        }
        
        query = query.limit(limit);
        
        const { data, error } = await query;
        if (error) throw error;
        return data || [];
    },

    async recordMovement(
        itemId: string, 
        qty: number, 
        type: 'entrada' | 'salida' | 'ajuste', 
        reason: string, 
        isSync = false,
        userInfo?: { nombre?: string; email?: string; rol?: string }
    ) {
        let userMeta = userInfo;
        if (!userMeta) {
            try {
                const { authService } = await import('./authService');
                const curr = await authService.getCurrentUser();
                if (curr) {
                    userMeta = {
                        nombre: curr.nombre_completo || curr.email.split('@')[0],
                        email: curr.email,
                        rol: curr.role
                    };
                }
            } catch (err) {
                // Silencioso si auth no está listo
            }
        }

        if (!navigator.onLine && !isSync) {
            const { syncService } = await import('./syncService');
            await syncService.enqueue('stock_adjustment', { itemId, qty, type, reason, userMeta });
            return;
        }

        try {
            // 1. Get current stock
            const { data: item, error: fetchError } = await supabase
                .from('inventario')
                .select('cantidad, nombre, minimo_alert')
                .eq('id', itemId)
                .single();
            
            if (fetchError) throw fetchError;

            const newQty = type === 'entrada' ? item.cantidad + qty : item.cantidad - qty;

            // 2. Update stock
            const { error: updateError } = await supabase
                .from('inventario')
                .update({ cantidad: newQty })
                .eq('id', itemId);
            
            if (updateError) throw updateError;

            // 3. Log movement con trazabilidad de usuario
            const insertPayload: any = {
                item_id: itemId,
                tipo: type,
                cantidad: qty,
                motivo: reason
            };
            if (userMeta?.nombre) insertPayload.usuario_nombre = userMeta.nombre;
            if (userMeta?.email) insertPayload.usuario_email = userMeta.email;
            if (userMeta?.rol) insertPayload.usuario_rol = userMeta.rol;

            let { error: logError } = await supabase
                .from('movimientos_inventario')
                .insert(insertPayload);
            
            // Fallback resiliente en caso de que la migración SQL aún esté pendiente en Supabase
            if (logError && logError.message?.includes('usuario_')) {
                const fallback = await supabase
                    .from('movimientos_inventario')
                    .insert({
                        item_id: itemId,
                        tipo: type,
                        cantidad: qty,
                        motivo: reason
                    });
                logError = fallback.error;
            }
            
            if (logError) throw logError;

            // 4. Check for low stock notification
            if (type === 'salida' && newQty <= (item.minimo_alert || 5)) {
                await notificationsService.notify(
                    'low_stock',
                    '📦 Stock Crítico',
                    `El producto "${item.nombre}" se está agotando (Restan: ${newQty} unidades).`,
                    { item_id: itemId, current_stock: newQty }
                );
            }
        } catch (e) {
            if (isSync) throw e;
            console.warn('⚠️ Error al registrar movimiento. Guardando en cola offline:', e);
            const { syncService } = await import('./syncService');
            await syncService.enqueue('stock_adjustment', { itemId, qty, type, reason, userMeta });
        }
    },

    async createItem(item: Omit<StockItem, 'id'>) {
        const { data, error } = await supabase
            .from('inventario')
            .insert({ ...item, activo: true })
            .select()
            .single();
        
        if (error) throw error;
        return data;
    },

    async updateItem(id: string, updates: Partial<StockItem>) {
        const { data, error } = await supabase
            .from('inventario')
            .update(updates)
            .eq('id', id)
            .select()
            .single();
        
        if (error) throw error;
        return data;
    },

    async deleteItem(id: string) {
        const { error } = await supabase
            .from('inventario')
            .update({ activo: false })
            .eq('id', id);
        
        if (error) throw error;
    }
};
