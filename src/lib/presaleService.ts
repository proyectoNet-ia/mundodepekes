import { supabase } from './supabase';
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

export interface Presale {
  id: string;
  created_at: string;
  expires_at: string;
  estado: 'pendiente' | 'confirmada' | 'expirada' | 'cancelada';
  tutor_nombre: string;
  tutor_telefono: string;
  tutor_email?: string;
  ninos: PresaleChild[];
  total_estimado: number;
  cliente_id?: string;
  telefono_verificado?: boolean;
  notas?: string; // Almacena el tipo de solicitud: 'registration' | 'presale'
}

export interface CreatePresaleInput {
  tutor_nombre: string;
  tutor_telefono: string;
  tutor_email?: string;
  ninos: PresaleChild[];
  total_estimado: number;
  telefono_verificado?: boolean;
}

/** Crea una nueva preventa desde el portal público (usa cliente sin auth para evitar lock contention) */
export const createPresale = async (data: CreatePresaleInput): Promise<Presale> => {
  // Detectar si el cliente ya existe en la BD
  const primaryPhone = data.tutor_telefono.replace(/\D/g, '');
  const { data: existing } = await supabasePublic
    .from('clientes')
    .select('id')
    .ilike('telefono', `%${primaryPhone}%`)
    .maybeSingle();

  const { data: presale, error } = await supabasePublic
    .from('preventas')
    .insert({
      tutor_nombre: data.tutor_nombre,
      tutor_telefono: data.tutor_telefono,
      tutor_email: data.tutor_email || null,
      ninos: data.ninos,
      total_estimado: data.total_estimado,
      cliente_id: existing?.id || null,
      estado: 'pendiente',
      telefono_verificado: data.telefono_verificado || false,
      // expires_at se genera por defecto en la BD (now() + 30 min)
    })
    .select()
    .single();

  if (error || !presale) throw error || new Error('Error al crear la preventa');
  return presale as Presale;
};

/** Obtiene todas las preventas pendientes (para el Dashboard del cajero) */
export const getPendingPresales = async (): Promise<Presale[]> => {
  const { data, error } = await supabase
    .from('preventas')
    .select('*')
    .eq('estado', 'pendiente')
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: true });

  if (error) throw error;
  return (data || []) as Presale[];
};

/** Marca una preventa como confirmada (cajero procesó el cobro) */
export const confirmPresale = async (id: string): Promise<void> => {
  const { error } = await supabase
    .from('preventas')
    .update({ estado: 'confirmada' })
    .eq('id', id);
  if (error) throw error;
};

/** Cancela una preventa (cajero la rechaza) */
export const cancelPresale = async (id: string): Promise<void> => {
  const { error } = await supabase
    .from('preventas')
    .update({ estado: 'cancelada' })
    .eq('id', id);
  if (error) throw error;
};

/** Marca como expiradas las preventas vencidas (se puede llamar periódicamente) */
export const expireOldPresales = async (): Promise<void> => {
  await supabase
    .from('preventas')
    .update({ estado: 'expirada' })
    .eq('estado', 'pendiente')
    .lt('expires_at', new Date().toISOString());
};

/** Suscripción Realtime a la tabla preventas */
export const subscribeToPresales = (callback: () => void) => {
  return supabase
    .channel('presales-dashboard')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'preventas' },
      callback
    )
    .subscribe();
};

/** Obtiene los paquetes activos PÚBLICOS (usa cliente sin auth para evitar lock contention) */
export const getPublicPackages = async () => {
  const { data, error } = await supabasePublic
    .from('paquetes')
    .select('id, nombre, area, duracion_minutos, precio')
    .eq('activo', true)
    .eq('es_privado', false)          // Solo paquetes públicos en el portal
    .order('precio', { ascending: true });

  if (error) throw error;
  return data || [];
};

/** Verifica si un número de teléfono ya existe en la tabla de clientes */
export const isCustomerRegistered = async (phone: string): Promise<boolean> => {
  const cleanPhone = phone.replace(/\D/g, '');
  if (cleanPhone.length < 10) return false;

  // Buscamos con un patrón que ignore posibles formatos intermedios (espacios, guiones, etc.)
  const pattern = `%${cleanPhone.substring(0, 3)}%${cleanPhone.substring(3, 6)}%${cleanPhone.substring(6)}%`;

  const { data, error } = await supabasePublic
    .from('clientes')
    .select('id')
    .or(`telefono.ilike.${pattern},telefono.ilike.%${cleanPhone}%,telefono.ilike.%${cleanPhone.substring(cleanPhone.length - 10)}`)
    .limit(1);

  if (error) {
    console.error('Error checking customer registration:', error);
    return false;
  }
  return data && data.length > 0;
};

/** Registra un cliente y sus niños de forma permanente (Solo Registro) */
export const registerCustomerOnly = async (data: { tutor_nombre: string, tutor_telefono: string, ninos: { nombre: string, edad: number }[] }) => {
  const primaryPhone = data.tutor_telefono.replace(/\D/g, '');
  
  // 1. Buscar o Crear el tutor
  let tutorId: string;
  const { data: existing } = await supabasePublic
    .from('clientes')
    .select('id')
    .ilike('telefono', `%${primaryPhone}%`)
    .maybeSingle();

  if (existing) {
    tutorId = existing.id;
    // Opcional: Actualizar nombre si es diferente
    await supabasePublic.from('clientes').update({ nombre: data.tutor_nombre }).eq('id', tutorId);
  } else {
    const { data: newTutor, error: tError } = await supabasePublic
      .from('clientes')
      .insert({ nombre: data.tutor_nombre, telefono: data.tutor_telefono })
      .select()
      .maybeSingle();
    if (tError) {
      if (tError.code === '42501' || tError.message.includes('policy')) {
        throw new Error('Permiso denegado: La tabla "clientes" no permite registros públicos. Activa la política RLS para INSERT.');
      }
      throw tError;
    }
    if (!newTutor) throw new Error('No se pudo crear el registro del tutor.');
    tutorId = newTutor.id;
  }

  // 2. Registrar a los niños
  const ninosToInsert = data.ninos.map(n => ({
    nombre: n.nombre,
    edad: n.edad,
    tutor_id: tutorId
  }));

  const { error: nError } = await supabasePublic
    .from('ninos')
    .insert(ninosToInsert);

  if (nError) throw nError;

  return { success: true, tutorId };
};
