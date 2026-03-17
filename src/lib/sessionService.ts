import { supabase } from './supabase';

export interface ActiveSession {
  id: string;
  childName: string;
  packageName: string;
  startTime: string;
  endTime: string;
  rawStartTime: Date;
  rawEndTime: Date;
  area: string;
  tutorContact: string;
}

export const getActiveSessions = async (): Promise<ActiveSession[]> => {
  const { data, error } = await supabase
    .from('sesiones')
    .select(`
      id,
      hora_inicio,
      hora_fin,
      area_actual,
      ninos (
        nombre,
        clientes (telefono)
      ),
      paquetes (nombre)
    `)
    .eq('estado', 'activo');

  if (error) {
    console.error('Error fetching sessions:', error);
    return [];
  }

  return data.map((s: any) => ({
    id: s.id,
    childName: s.ninos?.nombre || 'Desconocido',
    packageName: s.paquetes?.nombre || 'Paquete',
    startTime: new Date(s.hora_inicio).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    endTime: new Date(s.hora_fin).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    rawStartTime: new Date(s.hora_inicio),
    rawEndTime: new Date(s.hora_fin),
    area: s.area_actual,
    tutorContact: s.ninos?.clientes?.telefono || 'N/A'
  }));
};

export const finishSession = async (sessionId: string) => {
  const { error } = await supabase
    .from('sesiones')
    .update({ estado: 'finalizado' })
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
