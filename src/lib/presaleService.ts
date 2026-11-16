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
  const pending = (data || []) as Presale[];
  if (pending.length === 0) return [];

  // Auto-filtrar y confirmar preventas cuyos clientes/niños ya fueron ingresados hoy
  try {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const { data: recentSessions } = await supabase
      .from('sesiones')
      .select('hora_inicio, ninos(nombre, clientes(nombre, telefono))')
      .gte('hora_inicio', startOfToday.toISOString());

    if (recentSessions && recentSessions.length > 0) {
      const toAutoConfirm: string[] = [];
      const normalize = (s?: string) =>
        (s || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      const last10 = (p?: string) => {
        const d = (p || '').replace(/\D/g, '');
        return d.length >= 10 ? d.slice(-10) : d;
      };

      const filtered = pending.filter(presale => {
        const presaleTime = new Date(presale.created_at).getTime() - 5 * 60 * 1000;
        const pPhone10 = last10(presale.tutor_telefono);
        const pTutorName = normalize(presale.tutor_nombre);
        const pChildNames = (presale.ninos || []).map(n => normalize(n.nombre)).filter(Boolean);

        const alreadyEntered = recentSessions.some((s: any) => {
          const sessionTime = new Date(s.hora_inicio).getTime();
          if (sessionTime < presaleTime) return false;

          const ninoObj = Array.isArray(s.ninos) ? s.ninos[0] : s.ninos;
          const clienteObj = ninoObj?.clientes
            ? Array.isArray(ninoObj.clientes)
              ? ninoObj.clientes[0]
              : ninoObj.clientes
            : null;

          const sPhone10 = last10(clienteObj?.telefono);
          const sTutorName = normalize(clienteObj?.nombre);
          const sChildName = normalize(ninoObj?.nombre);

          if (pPhone10 && sPhone10 && pPhone10.length === 10 && pPhone10 === sPhone10) return true;
          if (pTutorName && sTutorName && pTutorName === sTutorName) return true;
          if (sChildName && pChildNames.includes(sChildName)) return true;
          return false;
        });

        if (alreadyEntered) {
          toAutoConfirm.push(presale.id);
          return false;
        }
        return true;
      });

      if (toAutoConfirm.length > 0) {
        supabase
          .from('preventas')
          .update({ estado: 'confirmada' })
          .in('id', toAutoConfirm)
          .then(() => {});
      }

      return filtered;
    }
  } catch (e) {
    console.warn('Error cruzando preventas con sesiones activas:', e);
  }

  return pending;
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
  const digits = data.tutor_telefono.replace(/\D/g, '');
  const phone10 = digits.length >= 10 ? digits.slice(-10) : digits;
  
  // 1. Buscar o Crear el tutor usando los últimos 10 dígitos y limit(1)
  let tutorId: string;
  const { data: existingRows } = await supabase
    .from('clientes')
    .select('id')
    .ilike('telefono', `%${phone10}%`)
    .limit(1);

  const existing = existingRows && existingRows.length > 0 ? existingRows[0] : null;

  if (existing) {
    tutorId = existing.id;
    await supabase.from('clientes').update({ nombre: data.tutor_nombre.trim() }).eq('id', tutorId);
  } else {
    const { data: newTutorRows, error: tError } = await supabase
      .from('clientes')
      .insert({ nombre: data.tutor_nombre.trim(), telefono: data.tutor_telefono.trim() })
      .select('id')
      .limit(1);
    if (tError) {
      if (tError.code === '42501' || tError.message.includes('policy')) {
        throw new Error('Permiso denegado: La tabla "clientes" no permite registros públicos. Activa la política RLS para INSERT.');
      }
      throw tError;
    }
    const newTutor = newTutorRows && newTutorRows.length > 0 ? newTutorRows[0] : null;
    if (!newTutor) throw new Error('No se pudo crear el registro del tutor.');
    tutorId = newTutor.id;
  }

  // 2. Registrar a los niños evitando duplicados para el mismo tutor
  const { data: existingChildren } = await supabase
    .from('ninos')
    .select('id, nombre')
    .eq('cliente_id', tutorId);

  const existingNames = new Set(
    (existingChildren || []).map((c: any) => (c.nombre || '').trim().toLowerCase())
  );

  const ninosToInsert = data.ninos
    .filter(n => n.nombre && !existingNames.has(n.nombre.trim().toLowerCase()))
    .map(n => ({
      nombre: n.nombre.trim(),
      edad: n.edad,
      cliente_id: tutorId
    }));

  if (ninosToInsert.length > 0) {
    const { error: nError } = await supabase
      .from('ninos')
      .insert(ninosToInsert);

    if (nError) throw nError;
  }

  return { success: true, tutorId };
};
