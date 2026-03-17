import { supabase } from './supabase';

export interface Package {
  id: string;
  nombre: string;
  area: string;
  duracion_minutos: number;
  precio: number;
  activo: boolean;
}

export const getPackages = async (): Promise<Package[]> => {
  const { data, error } = await supabase
    .from('paquetes')
    .select('*')
    .eq('activo', true);

  if (error) {
    console.error('Error fetching packages:', error);
    return [];
  }

  return data.map(p => ({
    id: p.id,
    nombre: p.nombre,
    area: p.area,
    duracion_minutos: p.duracion_minutos,
    precio: Number(p.precio),
    activo: p.activo
  }));
};
