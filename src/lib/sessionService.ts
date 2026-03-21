import { supabase } from './supabase';
import { OfflineDB } from './offlineDb';

export interface ActiveSession {
  id: string;
  childId: string;
  childName: string;
  packageName: string;
  startTime: string;
  endTime: string;
  rawStartTime: Date;
  rawEndTime: Date;
  area: string;
  tutorContact: string;
  tutorName: string;
  tutorEmail?: string;
  tutorVisits?: number;
  observaciones?: string;
  enListaNegra?: boolean;
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
        ninos ( id, nombre, observaciones, en_lista_negra, clientes (telefono, nombre, email, visitas_acumuladas) ),
        paquetes (nombre)
      `)
      .eq('estado', 'activo');

    if (error) throw error;

    activeFromDb = data.map((s: any) => ({
      id: s.id,
      childId: s.ninos?.id,
      childName: s.ninos?.nombre || 'Desconocido',
      packageName: s.paquetes?.nombre || 'Paquete',
      startTime: new Date(s.hora_inicio).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      endTime: new Date(s.hora_fin).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      rawStartTime: new Date(s.hora_inicio),
      rawEndTime: new Date(s.hora_fin),
      area: s.area_actual,
      tutorContact: s.ninos?.clientes?.telefono || 'N/A',
      tutorName: s.ninos?.clientes?.nombre || 'Tutor',
      tutorEmail: s.ninos?.clientes?.email,
      tutorVisits: s.ninos?.clientes?.visitas_acumuladas || 0,
      observaciones: s.ninos?.observaciones,
      enListaNegra: s.ninos?.en_lista_negra
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

  // 2. Fusionar con Ventas Pendientes Offline invisibles
  const pendingSales = await OfflineDB.getPendingSales();
  const offlineSessions: ActiveSession[] = [];
  
  for (const p of pendingSales) {
      const ts = p.timestamp;
      const data = p.data;
      
      data.children?.forEach((c: any, i: number) => {
          const startTime = new Date(ts);
          const endTime = new Date(ts + c.duration * 60000);
          
          offlineSessions.push({
             id: `OFFLINE-SES-${p.id}-${i}`,
             childId: `OFFLINE-NINO-${i}`,
             childName: c.name,
             packageName: `Paquete (${c.duration}m)`,
             startTime: startTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
             endTime: endTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
             rawStartTime: startTime,
             rawEndTime: endTime,
             area: c.area || 'Mundo Pekes',
             tutorContact: data.customer?.phone || 'N/A',
             tutorName: data.customer?.name || 'Cliente Offline',
             observaciones: '☁️ Pendiente de Subir a Nube',
             enListaNegra: false
          });
      });
  }

  // Devolvermos todo: lo que esté en nube/caché + lo recién vendido en colas offline
  return [...activeFromDb, ...offlineSessions];
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
