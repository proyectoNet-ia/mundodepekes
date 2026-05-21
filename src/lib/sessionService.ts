import { supabase } from './supabase';

export interface ActiveSession {
  id: string;
  childId: string;
  childName: string;
  packageName: string;
  packageId?: string;
  startTime: string;
  endTime: string;
  rawStartTime: Date;
  rawEndTime: Date;
  area: string;
  tutorId?: string;
  tutorContact: string;
  tutorName: string;
  tutorEmail?: string;
  tutorVisits?: number;
  observaciones?: string;
  enListaNegra?: boolean;
  transaccionFolio?: string;
  transaccionId?: string;    // ID completo de la transacción (para agrupar eventos privados)
  transaccionTotal?: number;
  metodoPago?: string;
  esPrivado?: boolean;       // true si el paquete de esta sesión es privado
  isReentry?: boolean;
}

export const getActiveSessions = async (): Promise<ActiveSession[]> => {
  let activeFromDb: ActiveSession[] = [];
  
  // 1. Obtener de DB principal (con tolerancia a fallos)
  try {
    const { data, error } = await supabase
      .from('sesiones')
      .select(`
        id,
        hora_inicio,
        hora_fin,
        area_actual,
        paquete_id,
        ninos ( id, nombre, observaciones, en_lista_negra, clientes (id, telefono, nombre, email, visitas_acumuladas) ),
        paquetes (nombre, es_privado),
        transacciones ( id, total, metodo_pago )
      `)
      .eq('estado', 'activo');

    if (error) throw error;

    activeFromDb = data.map((s: any) => ({
      id: s.id,
      childId: s.ninos?.id,
      childName: s.ninos?.nombre || 'Desconocido',
      packageName: s.paquetes?.nombre || 'Paquete',
      packageId: s.paquete_id,
      startTime: new Date(s.hora_inicio).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      endTime: new Date(s.hora_fin).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      rawStartTime: new Date(s.hora_inicio),
      rawEndTime: new Date(s.hora_fin),
      area: s.area_actual,
      tutorId: s.ninos?.clientes?.id,
      tutorContact: s.ninos?.clientes?.telefono || 'N/A',
      tutorName: s.ninos?.clientes?.nombre || 'Tutor',
      tutorEmail: s.ninos?.clientes?.email,
      tutorVisits: s.ninos?.clientes?.visitas_acumuladas || 0,
      observaciones: s.ninos?.observaciones,
      enListaNegra: s.ninos?.en_lista_negra,
      transaccionId: s.transacciones?.id,
      transaccionFolio: (s.transacciones?.id || '').substring(0, 8).toUpperCase(),
      transaccionTotal: s.transacciones?.total || 0,
      metodoPago: s.transacciones?.metodo_pago || 'N/A',
      esPrivado: s.paquetes?.es_privado ?? false,
    }));

    if (navigator.onLine) {
        localStorage.setItem('cache_sessions', JSON.stringify(activeFromDb));
    }
  } catch (err) {
    console.warn('Fallo red en sesiones. Recurriendo a caché y offline...');
    const cached = localStorage.getItem('cache_sessions');
    if (cached) {
        activeFromDb = JSON.parse(cached).map((s: any) => ({
            ...s,
            rawStartTime: new Date(s.rawStartTime),
            rawEndTime: new Date(s.rawEndTime)
        }));
    }
  }

    // Devolvermos solo lo que esté en nube/caché. 
    // Los pendientes offline se gestionan ahora directamente en el Dashboard via SyncService
    return activeFromDb;
};

export const updateChildInfo = async (childId: string, updates: { observaciones?: string, en_lista_negra?: boolean }) => {
  const { error } = await supabase
    .from('ninos')
    .update(updates)
    .eq('id', childId);

  if (error) throw error;
};

export const finishSession = async (sessionId: string) => {
  const { error } = await supabase
    .from('sesiones')
    .update({ estado: 'finalizado' })
    .eq('id', sessionId);

  if (error) throw error;
};

export const updateSessionTime = async (sessionId: string, newEndTime: Date) => {
  const { error } = await supabase
    .from('sesiones')
    .update({ hora_fin: newEndTime.toISOString() })
    .eq('id', sessionId);

  if (error) throw error;
};

// Real-time subscription helper
export const subscribeToSessions = (callback: () => void) => {
  return supabase
    .channel('active-sessions')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'sesiones' }, callback)
    .subscribe();
};

/**
 * Obtiene los eventos privados (transacciones) del día actual.
 */
export const getActivePrivateEvents = async () => {
    const today = new Date().toISOString().split('T')[0];
    const { data, error } = await supabase
        .from('transacciones')
        .select(`
            id,
            created_at,
            paquete_id,
            es_privado,
            event_start_time,
            event_end_time,
            limite_invitados,
            cliente:clientes(id, nombre, telefono),
            paquete:paquetes(id, nombre, duracion_minutos, area)
        `)
        .eq('es_privado', true)
        .gte('created_at', today)
        .order('created_at', { ascending: false });

    if (error) throw error;
    return data;
};

/**
 * Agrega un niño a un evento privado existente.
 * Si es el primer niño, el tiempo del evento comienza a correr desde ahora.
 */
export const addChildToPrivateEvent = async (params: {
  childName: string;
  childAge: number;
  tutorId: string;
  packageId: string;
  area: string;
  transaccionId: string;
  eventEndTime?: Date; 
  durationMinutes?: number; 
}): Promise<void> => {
  let finalEndTime = params.eventEndTime;

  // 1. Si no hay hora de fin (primer niño), calculamos y actualizamos la transacción
  if (!finalEndTime && params.durationMinutes) {
      const now = new Date();
      finalEndTime = new Date(now.getTime() + params.durationMinutes * 60000);
      
      // Actualizar transacción con el tiempo de inicio/fin del evento
      const { error: updateError } = await supabase
        .from('transacciones')
        .update({
          event_start_time: now.toISOString(),
          event_end_time: finalEndTime.toISOString()
        })
        .eq('id', params.transaccionId);
      
      if (updateError) throw updateError;
  }

  if (!finalEndTime) throw new Error('No se pudo determinar el fin del evento');

  // 2. Obtener o crear el niño
  let { data: child } = await supabase
    .from('ninos')
    .select('id')
    .eq('nombre', params.childName)
    .eq('cliente_id', params.tutorId)
    .single();

  if (!child) {
    const { data: newChild, error } = await supabase
      .from('ninos')
      .insert({ nombre: params.childName, edad: params.childAge, cliente_id: params.tutorId })
      .select().single();
    if (error || !newChild) throw error || new Error('Error al crear niño');
    child = newChild;
  }

  // 3. Crear sesión sincronizada
  const { error: sError } = await supabase
    .from('sesiones')
    .insert({
      transaccion_id: params.transaccionId,
      nino_id: (child as any).id,
      paquete_id: params.packageId,
      hora_inicio: new Date().toISOString(),
      hora_fin: finalEndTime.toISOString(),
      area_actual: params.area,
      estado: 'activo'
    });

  if (sError) throw sError;
};

/**
 * Obtiene la cantidad de paquetes privados programados para hoy que aún no se consumen (no tienen transacción hoy).
 */
export const getScheduledPrivateEventsCount = async (): Promise<number> => {
    try {
        const today = new Date().toISOString().split('T')[0];
        
        // 1. Obtener IDs de paquetes privados programados para hoy
        const { data: scheduledPkgs, error: pError } = await supabase
            .from('paquetes')
            .select('id')
            .eq('fecha_evento', today)
            .eq('activo', true)
            .eq('es_privado', true);
        
        if (pError || !scheduledPkgs || scheduledPkgs.length === 0) return 0;

        // 2. Obtener IDs de paquetes ya vendidos hoy
        const { data: soldToday, error: tError } = await supabase
            .from('transacciones')
            .select('paquete_id')
            .gte('created_at', today)
            .not('paquete_id', 'is', null);

        if (tError) return scheduledPkgs.length;

        const soldIds = new Set(soldToday.map(t => t.paquete_id));
        
        // 3. Contar solo los que NO se han vendido aún
        const pendingCount = scheduledPkgs.filter(p => !soldIds.has(p.id)).length;
        
        return pendingCount;
    } catch {
        return 0;
    }
};

/**
 * Los paquetes ahora se auto-archivan al terminar el evento,
 * por lo que no necesitamos una función específica para "consumir" de una tabla externa.
 * Esta función se mantiene por compatibilidad de firma pero el archivado
 * real ocurre en el Dashboard vía archivePackage.
 */
export const consumeScheduledEvent = async (): Promise<void> => {
    // Implementación vacía ya que usamos el estado 'activo' del paquete
};

/**
 * Obtiene el total de ingresos del día (incluyendo reingresos).
 * Cuenta cada sesión individual, no niños únicos.
 * Retorna: { total: número total de ingresos+reingresos, unique: niños únicos }
 */
export const getTotalChildrenToday = async (): Promise<{ total: number; unique: number }> => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const { data, error } = await supabase
      .from('sesiones')
      .select('nino_id')
      .gte('hora_inicio', today.toISOString())
      .in('estado', ['activo', 'finalizado']);

    if (error) throw error;

    const total = data.length;
    const unique = new Set(data.map((s: any) => s.nino_id)).size;
    return { total, unique };
  } catch {
    return { total: 0, unique: 0 };
  }
};

/**
 * Desactiva un paquete (lo archiva) para que no aparezca en listados.
 */
export const archivePackage = async (packageId: string): Promise<void> => {
    try {
        await supabase
            .from('paquetes')
            .update({ activo: false })
            .eq('id', packageId);
    } catch (e) {
        console.error('Error al archivar paquete:', e);
    }
};
