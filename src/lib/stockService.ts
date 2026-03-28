import { supabase } from './supabase';

export interface StockItem {
    id: string;
    nombre: string;
    categoria: string;
    cantidad: number;
    minimo_alert: number;
    precio_venta: number;
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

    async recordMovement(itemId: string, qty: number, type: 'entrada' | 'salida' | 'ajuste', reason: string) {
        // 1. Get current stock
        const { data: item, error: fetchError } = await supabase
            .from('inventario')
            .select('cantidad')
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
    },

    async createItem(item: Omit<StockItem, 'id'>) {
        const { data, error } = await supabase
            .from('inventario')
            .insert(item)
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
            .delete()
            .eq('id', id);
        
        if (error) throw error;
    }
};
