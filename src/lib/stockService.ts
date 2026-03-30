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

    async getMovements(limit = 10): Promise<InventoryMovement[]> {
        const { data, error } = await supabase
            .from('movimientos_inventario')
            .select('*, inventario(nombre)')
            .order('created_at', { ascending: false })
            .limit(limit);
        
        if (error) throw error;
        return data || [];
    },

    async recordMovement(itemId: string, qty: number, type: 'entrada' | 'salida' | 'ajuste', reason: string, isSync = false) {
        if (!navigator.onLine && !isSync) {
            const { syncService } = await import('./syncService');
            await syncService.enqueue('stock_adjustment', { itemId, qty, type, reason });
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

            // 3. Log movement
            const { error: logError } = await supabase
                .from('movimientos_inventario')
                .insert({
                    item_id: itemId,
                    tipo: type,
                    cantidad: qty,
                    motivo: reason
                });
            
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
            await syncService.enqueue('stock_adjustment', { itemId, qty, type, reason });
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
