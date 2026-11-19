import { supabase } from './supabase';

export interface Package {
  id: string;
  nombre: string;
  area: 'Mundo de Pekes' | 'Trampolín Park' | 'Área Mixta' | string;
  duracion_minutos: number;
  precio: number;
  activo: boolean;
  es_privado: boolean;  // false = público (portal + caja) | true = privado (solo caja / eventos)
}

const PACKAGES_CACHE_TTL_MS = 5 * 60 * 1000;
const packagesCache: Record<string, { data: Package[]; expiresAt: number }> = {};
const inFlightPackages: Record<string, Promise<Package[]> | undefined> = {};

const invalidatePackagesCache = () => {
  delete packagesCache.active;
  delete packagesCache.all;
};

export const getPackages = async (onlyActive = true, forceRefresh = false): Promise<Package[]> => {
  if (!navigator.onLine) {
    const cached = localStorage.getItem('cache_paquetes');
    if (cached) return JSON.parse(cached);
  }

  const cacheKey = onlyActive ? 'active' : 'all';
  if (!forceRefresh && packagesCache[cacheKey] && Date.now() < packagesCache[cacheKey].expiresAt) {
    return packagesCache[cacheKey].data;
  }

  if (!forceRefresh && inFlightPackages[cacheKey]) {
    return inFlightPackages[cacheKey]!;
  }

  inFlightPackages[cacheKey] = (async () => {
    let query = supabase
      .from('paquetes')
      .select('id, nombre, area, duracion_minutos, precio, activo, es_privado');
    
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
        activo: p.activo,
        es_privado: p.es_privado ?? false,
      }));

      packagesCache[cacheKey] = { data: formatted, expiresAt: Date.now() + PACKAGES_CACHE_TTL_MS };
      // Guardar en caché para supervivencia offline
      localStorage.setItem('cache_paquetes', JSON.stringify(formatted));
      return formatted;
    } catch (err) {
      console.warn('Fallo al obtener paquetes. Recurriendo a caché...', err);
      if (packagesCache[cacheKey]) return packagesCache[cacheKey].data;
      const cached = localStorage.getItem('cache_paquetes');
      return cached ? JSON.parse(cached) : [];
    } finally {
      delete inFlightPackages[cacheKey];
    }
  })();

  return inFlightPackages[cacheKey]!;
};

export const createPackage = async (pkg: Omit<Package, 'id'>) => {
  const { data, error } = await supabase
    .from('paquetes')
    .insert([pkg])
    .select()
    .single();

  if (error) throw error;
  invalidatePackagesCache();
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
  invalidatePackagesCache();
  return data;
};

export const togglePackageStatus = async (id: string, currentStatus: boolean) => {
  const { error } = await supabase
    .from('paquetes')
    .update({ activo: !currentStatus })
    .eq('id', id);

  if (error) throw error;
  invalidatePackagesCache();
  return true;
};

export const deletePackage = async (id: string) => {
  const { error } = await supabase
    .from('paquetes')
    .delete()
    .eq('id', id);

  if (error) throw error;
  invalidatePackagesCache();
  return true;
};
