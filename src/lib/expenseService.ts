import { supabase } from './supabase';

export interface Gasto {
    id: string;
    fecha: string;
    categoria: 'Servicios' | 'Sueldos' | 'Mantenimiento' | 'Insumos' | 'Otros';
    monto: number;
    descripcion: string;
}

export const getGastos = async (days = 30) => {
    const dateLimit = new Date();
    dateLimit.setDate(dateLimit.getDate() - days);
    
    const { data, error } = await supabase
        .from('gastos_diarios')
        .select('*')
        .gte('fecha', dateLimit.toISOString().split('T')[0])
        .order('fecha', { ascending: false });
    
    if (error) throw error;
    return data as Gasto[];
};

export const addGasto = async (gasto: Omit<Gasto, 'id'>) => {
    const { data, error } = await supabase
        .from('gastos_diarios')
        .insert([gasto])
        .select()
        .single();
    if (error) throw error;
    return data;
};

export const deleteGasto = async (id: string) => {
    const { error } = await supabase
        .from('gastos_diarios')
        .delete()
        .eq('id', id);
    if (error) throw error;
};
