import { supabase } from './supabase';
import { notificationsService } from './notificationsService';

export interface AuthRequest {
  id: string;
  created_at: string;
  solicitante_id: string;
  solicitante_nombre: string;
  accion_tipo: string;
  descripcion: string;
  estado: 'pendiente' | 'aprobada' | 'rechazada';
  autorizador_id?: string;
  metadata?: any;
}

// Canal global para eventos instantáneos (Broadcast)
const globalAuthChannel = supabase.channel('global-auth-events');
globalAuthChannel.subscribe();

export const authRequestService = {
  // Crear una nueva solicitud (Cajero)
  async createRequest(req: Partial<AuthRequest>) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('No hay sesión activa');

    const { data, error } = await supabase
      .from('solicitudes_autorizacion')
      .insert([{
        ...req,
        solicitante_id: user.id,
        solicitante_nombre: user.email?.split('@')[0] || 'Cajero',
        estado: 'pendiente'
      }])
      .select()
      .single();

    if (error) throw error;

    // ✅ EMISIÓN ULTRA-RÁPIDA (BROADCAST)
    // No espera a la DB, se envía de inmediato a todos los navegadores abiertos
    globalAuthChannel.send({
      type: 'broadcast',
      event: 'new_request',
      payload: data
    });

    // ✅ Notificación persistente
    await notificationsService.notify(
      'auth_request',
      `🔐 Firma Requerida: ${user.email?.split('@')[0] || 'Cajero'}`,
      `Solicitud de autorización para: ${req.accion_tipo}`,
      { solicitud_id: data.id, solicitante: user.email }
    );

    return data;
  },

  // Escuchar cambios en una solicitud específica (Cajero espera)
  subscribeToRequest(requestId: string, onUpdate: (req: AuthRequest) => void) {
    return supabase
      .channel(`auth-req-${requestId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'solicitudes_autorizacion', filter: `id=eq.${requestId}` },
        (payload) => onUpdate(payload.new as AuthRequest)
      )
      .subscribe();
  },

  // Obtener solicitudes pendientes de las últimas 12 horas (Supervisor)
  async getPendingRequests() {
    const twelveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();
    
    const { data, error } = await supabase
      .from('solicitudes_autorizacion')
      .select('*')
      .eq('estado', 'pendiente')
      .gte('created_at', twelveHoursAgo)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data as AuthRequest[];
  },

  // Escuchar nuevas solicitudes entrantes (Supervisor escucha)
  // NOTA: No usar filter en INSERT — Supabase Realtime no lo soporta sin replica identity configurada
  subscribeToNewRequests(onNew: (req: AuthRequest) => void) {
    return supabase
      .channel('new-auth-requests')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'solicitudes_autorizacion' },
        (payload) => {
          const req = payload.new as AuthRequest;
          if (req.estado === 'pendiente') onNew(req);
        }
      )
      .on(
        'broadcast',
        { event: 'new_request' },
        (payload) => {
          // El broadcast llega ANTES que el postgres_changes
          onNew(payload.payload as AuthRequest);
        }
      )
      .subscribe();
  },

  // Aprobar o rechazar solicitud (Supervisor actua)
  async respondToRequest(requestId: string, status: 'aprobada' | 'rechazada', autorizadorId: string) {
    const { error } = await supabase
      .from('solicitudes_autorizacion')
      .update({ estado: status, autorizador_id: autorizadorId })
      .eq('id', requestId);

    if (error) throw error;
  }
};
