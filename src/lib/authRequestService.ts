import { supabase } from './supabase';
import { notificationsService } from './notificationsService';

export interface AuthRequest {
  id: string;
  created_at: string;
  solicitante_id: string;
  solicitante_nombre: string;
  accion_tipo: string;
  descripcion: string;
  estado: 'pendiente' | 'aprobada' | 'rechazada' | 'cancelada';
  autorizador_id?: string;
  metadata?: any;
}

const AUTH_CHANNEL_NAME = 'global-auth-events';

// Helper para emisión de eventos broadcast instantáneos
const sendAuthBroadcast = (event: string, payload: any) => {
  try {
    supabase.channel(AUTH_CHANNEL_NAME).send({
      type: 'broadcast',
      event,
      payload
    });
  } catch (err) {
    console.debug('Error enviando broadcast de autorización:', err);
  }
};

export const authRequestService = {
  // Crear una nueva solicitud (Cajero / Gerente)
  async createRequest(req: Partial<AuthRequest>) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('No hay sesión activa');

    // Resolver alias amigable para el solicitante
    let aliasSolicitante = req.solicitante_nombre || '';
    if (!aliasSolicitante) {
      try {
        const { authService } = await import('./authService');
        const profile = await authService.getCurrentUser();
        aliasSolicitante = profile?.nombre_completo || '';
      } catch (e) {}
    }
    if (!aliasSolicitante) {
      const em = (user.email || '').toLowerCase();
      if (em.includes('gerente')) aliasSolicitante = 'Gerente Operativo';
      else if (em.includes('admin_roster')) aliasSolicitante = 'Andrea Bañales';
      else if (em.includes('admin')) aliasSolicitante = 'Fernando Admin';
      else if (em.includes('cajero')) aliasSolicitante = 'Fanny';
      else if (em.includes('andrea1')) aliasSolicitante = 'Andrea Rodríguez';
      else if (em.includes('supervisor')) aliasSolicitante = 'Supervisor de Turno';
      else aliasSolicitante = user.email?.split('@')[0] || 'Cajero';
    }

    const { data, error } = await supabase
      .from('solicitudes_autorizacion')
      .insert([{
        ...req,
        solicitante_id: user.id,
        solicitante_nombre: aliasSolicitante,
        estado: 'pendiente'
      }])
      .select('id, created_at, solicitante_id, solicitante_nombre, accion_tipo, descripcion, estado, autorizador_id, metadata')
      .single();

    if (error) throw error;

    // ✅ EMISIÓN ULTRA-RÁPIDA (BROADCAST EN CANAL GLOBAL UNIFICADO)
    sendAuthBroadcast('new_request', data);

    // ✅ Notificación persistente con detalles de cantidad y tipo
    await notificationsService.notify(
      'auth_request',
      `🔐 Firma Requerida: ${aliasSolicitante}`,
      req.descripcion || `Solicitud de autorización para: ${req.accion_tipo}`,
      { solicitud_id: data.id, solicitante: user.email, solicitante_id: user.id }
    );

    return data;
  },

  // Cancelar una solicitud pendiente (Cajero / Gerente cancela para usar PIN)
  async cancelRequest(requestId: string) {
    try {
      const { data, error } = await supabase
        .from('solicitudes_autorizacion')
        .update({ estado: 'cancelada' })
        .eq('id', requestId)
        .select('id, created_at, solicitante_id, solicitante_nombre, accion_tipo, descripcion, estado, autorizador_id, metadata')
        .maybeSingle();

      if (error) throw error;

      // ✅ Emisión de cancelación en canal global
      sendAuthBroadcast('request_cancelled', data || { id: requestId, estado: 'cancelada' });

      // Marcar como leídas las notificaciones asociadas
      await supabase
        .from('notificaciones')
        .update({ read: true })
        .eq('type', 'auth_request')
        .eq('read', false);

      return data;
    } catch (e) {
      console.warn('Error al cancelar solicitud remota:', e);
      return null;
    }
  },

  // Escuchar cambios en una solicitud específica (Cajero / Gerente espera)
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

    // 2. Resilient Polling Fallback (cada 1.5s con selector específico de columnas)
    const pollInterval = setInterval(async () => {
      if (isDone) return;
      try {
        const { data, error } = await supabase
          .from('solicitudes_autorizacion')
          .select('id, created_at, solicitante_id, solicitante_nombre, accion_tipo, descripcion, estado, autorizador_id, metadata')
          .eq('id', requestId)
          .maybeSingle();

        if (!error && data && data.estado !== 'pendiente') {
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
        supabase.removeChannel(reqChannel);
      }
    };
  },

  // Obtener solicitudes pendientes de las últimas 12 horas (Supervisor / Admin)
  async getPendingRequests() {
    const twelveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();
    
    const { data, error } = await supabase
      .from('solicitudes_autorizacion')
      .select('id, created_at, solicitante_id, solicitante_nombre, accion_tipo, descripcion, estado, autorizador_id, metadata')
      .eq('estado', 'pendiente')
      .gte('created_at', twelveHoursAgo)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data as AuthRequest[];
  },

  // Escuchar nuevas solicitudes entrantes y cancelaciones (Supervisor / Admin escucha en tiempo real)
  subscribeToNewRequests(onNew: (req: AuthRequest) => void, onUpdateOrCancel?: (req: AuthRequest) => void) {
    const channel = supabase.channel(AUTH_CHANNEL_NAME);
    return channel
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'solicitudes_autorizacion' },
        (payload) => {
          const req = payload.new as AuthRequest;
          if (req.estado === 'pendiente') onNew(req);
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'solicitudes_autorizacion' },
        (payload) => {
          const req = payload.new as AuthRequest;
          if (onUpdateOrCancel) onUpdateOrCancel(req);
        }
      )
      .on(
        'broadcast',
        { event: 'new_request' },
        (payload) => {
          if (payload.payload && payload.payload.estado === 'pendiente') {
            onNew(payload.payload as AuthRequest);
          }
        }
      )
      .on(
        'broadcast',
        { event: 'request_cancelled' },
        (payload) => {
          if (payload.payload && onUpdateOrCancel) {
            onUpdateOrCancel(payload.payload as AuthRequest);
          }
        }
      )
      .subscribe();
  },

  // Aprobar o rechazar solicitud (Supervisor / Admin actúa)
  async respondToRequest(requestId: string, status: 'aprobada' | 'rechazada', autorizadorId: string) {
    const { data, error } = await supabase
      .from('solicitudes_autorizacion')
      .update({ estado: status, autorizador_id: autorizadorId })
      .eq('id', requestId)
      .select('id, created_at, solicitante_id, solicitante_nombre, accion_tipo, descripcion, estado, autorizador_id, metadata')
      .single();

    if (error) throw error;

    // ✅ EMISIÓN ULTRA-RÁPIDA EN CANAL GLOBAL Y ESPECÍFICO
    sendAuthBroadcast('request_response', data);

    const specificChannel = supabase.channel(`auth-req-${requestId}`);
    specificChannel.subscribe((subStatus) => {
      if (subStatus === 'SUBSCRIBED') {
        specificChannel.send({
          type: 'broadcast',
          event: 'request_response',
          payload: data
        }).then(() => {
          setTimeout(() => supabase.removeChannel(specificChannel), 2000);
        });
      }
    });

    // Marcar como leídas las notificaciones asociadas
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

