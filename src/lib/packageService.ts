import { supabase } from './supabase';

export interface Package {
  id: string;
  nombre: string;
  area: string;
  duracion_minutos: number;
  precio: number;
  activo: boolean;
}

export const getPackages = async (onlyActive = true): Promise<Package[]> => {
  if (!navigator.onLine) {
    const cached = localStorage.getItem('cache_paquetes');
    if (cached) return JSON.parse(cached);
  }

  let query = supabase.from('paquetes').select('*');
  
  if (onlyActive) {
    query = query.eq('activo', true);
  }

  try {
    const { data, error } = await query.order('precio', { ascending: true });

    if (error) throw error;

    const formatted = (data || []).map(p => ({
      id: p.id,
      nombre: p.nombre,
      area: p.area,
      duracion_minutos: p.duracion_minutos,
      precio: Number(p.precio),
      activo: p.activo
    }));

    // Guardar en caché para supervivencia offline
    localStorage.setItem('cache_paquetes', JSON.stringify(formatted));
    return formatted;
  } catch (err) {
    console.warn('Fallo al obtener paquetes. Recurriendo a caché...', err);
    const cached = localStorage.getItem('cache_paquetes');
    return cached ? JSON.parse(cached) : [];
  }
};

export const createPackage = async (pkg: Omit<Package, 'id'>) => {
  const { data, error } = await supabase
    .from('paquetes')
    .insert([pkg])
    .select()
    .single();

  if (error) throw error;
  return data;
};

export const updatePackage = async (id: string, pkg: Partial<Package>) => {
  const { data, error } = await supabase
    .from('paquetes')
    .update(pkg)
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
};

export const togglePackageStatus = async (id: string, currentStatus: boolean) => {
  const { error } = await supabase
    .from('paquetes')
    .update({ activo: !currentStatus })
    .eq('id', id);

  if (error) throw error;
  return true;
};
