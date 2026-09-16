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
    let isDone = false;

    const handleUpdate = (req: AuthRequest) => {
      if (isDone) return;
      if (req && req.id === requestId && req.estado !== 'pendiente') {
        isDone = true;
        clearInterval(pollInterval);
        onUpdate(req);
      }
    };

    // 1. Canal dedicado para Postgres Changes + Broadcast
    const reqChannel = supabase
      .channel(`auth-req-${requestId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'solicitudes_autorizacion', filter: `id=eq.${requestId}` },
        (payload) => handleUpdate(payload.new as AuthRequest)
      )
      .on(
        'broadcast',
        { event: 'request_response' },
        (payload) => {
          if (payload.payload?.id === requestId) {
            handleUpdate(payload.payload as AuthRequest);
          }
        }
      )
      .subscribe();

    // 2. Escuchar en el canal global de broadcast
    const globalBroadcastHandler = (payload: any) => {
      if (payload.payload?.id === requestId) {
        handleUpdate(payload.payload as AuthRequest);
      }
    };
    globalAuthChannel.on('broadcast', { event: 'request_response' }, globalBroadcastHandler);

    // 3. Resilient Polling Fallback (cada 1.5s por si WebSockets o Realtime sufren delay)
    const pollInterval = setInterval(async () => {
      if (isDone) return;
      try {
        const { data } = await supabase
          .from('solicitudes_autorizacion')
          .select('*')
          .eq('id', requestId)
          .single();

        if (data && data.estado !== 'pendiente') {
          handleUpdate(data as AuthRequest);
        }
      } catch (err) {
        // Silencioso durante polling
      }
    }, 1500);

    return {
      unsubscribe: () => {
        isDone = true;
        clearInterval(pollInterval);
        reqChannel.unsubscribe();
      }
    };
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
          onNew(payload.payload as AuthRequest);
        }
      )
      .subscribe();
  },

  // Aprobar o rechazar solicitud (Supervisor actua)
  async respondToRequest(requestId: string, status: 'aprobada' | 'rechazada', autorizadorId: string) {
    const { data, error } = await supabase
      .from('solicitudes_autorizacion')
      .update({ estado: status, autorizador_id: autorizadorId })
      .eq('id', requestId)
      .select()
      .single();

    if (error) throw error;

    // ✅ EMISIÓN ULTRA-RÁPIDA DE RESPUESTA EN CANAL GLOBAL Y ESPECÍFICO
    globalAuthChannel.send({
      type: 'broadcast',
      event: 'request_response',
      payload: data
    });

    const specificChannel = supabase.channel(`auth-req-${requestId}`);
    specificChannel.subscribe((subStatus) => {
      if (subStatus === 'SUBSCRIBED') {
        specificChannel.send({
          type: 'broadcast',
          event: 'request_response',
          payload: data
        });
      }
    });

    // Marcar como leídas las notificaciones asociadas a solicitudes de firma
    try {
      await supabase
        .from('notificaciones')
        .update({ read: true })
        .eq('type', 'auth_request')
        .eq('read', false);
    } catch (e) {
      console.warn('Error al marcar notificaciones como leídas:', e);
    }

    return data;
  }
};
