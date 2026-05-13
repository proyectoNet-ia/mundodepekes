import { supabasePublic } from './supabasePublic';

export interface PresaleChild {
  nombre: string;
  edad: number;
  paquete_id: string;
  paquete_nombre: string;
  area: string;
  duracion_minutos: number;
  precio: number;
}

/** Crea una nueva preventa desde el portal público via función SECURITY DEFINER */
export const createPresale = async (data: any) => {
  const { data: result, error } = await supabasePublic.rpc('crear_preventa_publica', {
    p_tutor_nombre:    data.tutor_nombre,
    p_tutor_telefono:  data.tutor_telefono,
    p_tutor_email:     data.tutor_email || null,
    p_ninos:           data.ninos,
    p_total_estimado:  data.total_estimado,
    p_tipo:            data.tipo || 'preventa', // 'registro' o 'preventa'
  });

  if (error) {
    console.error('❌ Error RPC:', error);
    throw new Error(error.message || 'Error al crear la preventa');
  }

  return result;
};

/** Obtiene los paquetes activos PÚBLICOS */
export const getPublicPackages = async () => {
  const { data, error } = await supabasePublic
    .from('paquetes')
    .select('id, nombre, area, duracion_minutos, precio')
    .eq('activo', true)
    .eq('es_privado', false)
    .order('precio', { ascending: true });

  if (error) throw error;
  return data || [];
};

/** Verifica si un número de teléfono ya existe */
export const isCustomerRegistered = async (phone: string): Promise<boolean> => {
  const cleanPhone = phone.replace(/\D/g, '');
  if (cleanPhone.length < 10) return false;
  const pattern = `%${cleanPhone.substring(0, 3)}%${cleanPhone.substring(3, 6)}%${cleanPhone.substring(6)}%`;
  const { data } = await supabasePublic
    .from('clientes')
    .select('id')
    .or(`telefono.ilike.${pattern},telefono.ilike.%${cleanPhone}%`)
    .limit(1);
  return !!(data && data.length > 0);
};
