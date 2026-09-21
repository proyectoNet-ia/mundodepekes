import { supabase } from './supabase';

export interface DynamicPin {
  id: string;
  pin_codigo: string;
  creado_por?: string;
  creador_nombre?: string;
  motivo: string;
  vigencia_minutos: number;
  expira_en: string;
  usado: boolean;
  usado_por?: string;
  usuario_consumidor_nombre?: string;
  usado_en?: string;
  accion_autorizada?: string;
  folio_referencia?: string;
  revocado: boolean;
  created_at: string;
}

export interface CreatePinResult {
  success: boolean;
  id?: string;
  pin?: string;
  motivo?: string;
  vigencia_minutos?: number;
  expira_en?: string;
  created_at?: string;
  error?: string;
}

export const dynamicPinService = {
  /**
   * Genera un nuevo PIN dinámico OTP de 1 solo uso en Supabase.
   */
  async createPin(motivo = 'Autorización General', vigenciaMinutos = 15): Promise<CreatePinResult> {
    try {
      const { data, error } = await supabase.rpc('generar_pin_dinamico', {
        p_motivo: motivo,
        p_vigencia_minutos: vigenciaMinutos
      });

      if (error) {
        console.error('Error al generar PIN dinámico:', error);
        return { success: false, error: error.message };
      }

      return data as CreatePinResult;
    } catch (err: any) {
      return { success: false, error: err.message || 'Error inesperado al generar PIN.' };
    }
  },

  /**
   * Obtiene la lista de PINs dinámicos generados hoy/recientes (solo Administradores).
   */
  async getRecentPins(): Promise<DynamicPin[]> {
    try {
      const { data, error } = await supabase
        .from('pines_dinamicos')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(30);

      if (error) {
        console.warn('Error al obtener PINs recientes:', error);
        return [];
      }

      return data || [];
    } catch (err) {
      console.warn('Fallo al consultar historial de PINs:', err);
      return [];
    }
  },

  /**
   * Cancela/revoca un PIN dinámico antes de que sea usado.
   */
  async revokePin(pinId: string): Promise<boolean> {
    try {
      const { data, error } = await supabase.rpc('revocar_pin_dinamico', {
        p_pin_id: pinId
      });

      if (error) throw error;
      return data?.success ?? false;
    } catch (err) {
      console.error('Error al revocar PIN:', err);
      return false;
    }
  },

  /**
   * Construye el enlace para enviar el PIN formateado directamente por WhatsApp.
   */
  buildWhatsAppShareUrl(pin: string, motivo = 'Autorización', expiraEnDate?: Date): string {
    const horaExpira = expiraEnDate 
      ? expiraEnDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) 
      : '15 minutos';

    const mensaje = `🔐 *Mundo de Pekes - PIN de Autorización*\n\n` +
      `Tu código de autorización de *1 solo uso* es:\n\n` +
      `👉 *${pin}*\n\n` +
      `📋 *Motivo:* ${motivo}\n` +
      `⏳ *Válido hasta:* ${horaExpira}\n` +
      `⚠️ _Este PIN se desactivará automáticamente tras ser ingresado._`;

    return `https://wa.me/?text=${encodeURIComponent(mensaje)}`;
  }
};
