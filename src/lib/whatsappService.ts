import { supabasePublic } from './supabasePublic';

const WHATSAPP_API_URL = import.meta.env.VITE_WHATSAPP_API_URL || '';
const WHATSAPP_TOKEN   = import.meta.env.VITE_WHATSAPP_TOKEN   || '';

export const whatsappService = {
  /**
   * Verifica si un número ya ha sido validado previamente en el sistema (clientes).
   */
  async isAlreadyVerified(telefono: string): Promise<boolean> {
    try {
      const cleanPhone = telefono.replace(/\D/g, '');
      const { data, error } = await supabasePublic
        .from('clientes')
        .select('whatsapp_verificado')
        .eq('telefono', cleanPhone)
        .eq('whatsapp_verificado', true)
        .maybeSingle();

      if (error) {
          console.warn('No se pudo verificar estatus previo:', error);
          return false;
      }
      return !!data;
    } catch (e) {
      return false;
    }
  },

  /**
   * Genera un código de 6 dígitos, lo guarda en la BD y lo envía por WhatsApp.
   */
  async sendVerificationCode(telefono: string): Promise<{ success: boolean; error?: string }> {
    try {
      // 1. Limpiar teléfono (solo números)
      const cleanPhone = telefono.replace(/\D/g, '');
      if (cleanPhone.length < 10) throw new Error('Número de teléfono inválido');

      // 2. Generar y guardar código usando el sistema seguro (RPC) para Rate Limiting
      const { data, error: dbError } = await supabasePublic.rpc('generar_codigo_whatsapp', {
          telefono_input: cleanPhone
      });

      if (dbError) throw dbError;
      if (!data.success) throw new Error(data.error || 'No se pudo generar el código');

      const code = data.codigo;

      // 3. Enviar vía API de WhatsApp (Simulado si no hay URL configurada)
      if (!WHATSAPP_API_URL || !WHATSAPP_TOKEN) {
        console.warn('⚠️ WhatsApp API no configurada. Código de verificación (DEBUG):', code);
        // En desarrollo, podemos retornar éxito pero avisar que es simulado
        return { success: true }; 
      }

      // Ejemplo de integración con una API genérica (tipo UltraMsg o Evolution API)
      const message = `*¡Hola!* Bienvenido a *Mundo de Pekes* 🌈✨\n\nTu código de seguridad para el pre-registro es:\n👉 *${code}*\n\nIngrésalo en el portal para continuar con tu registro. ¡Te esperamos para jugar! 🎢`;
      
      const response = await fetch(`${WHATSAPP_API_URL}/sendMessage`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${WHATSAPP_TOKEN}` // Depende del proveedor
        },
        body: JSON.stringify({
          to: cleanPhone,
          body: message
        })
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.message || 'Error al enviar mensaje de WhatsApp');
      }

      return { success: true };
    } catch (error: any) {
      console.error('WhatsApp Service Error:', error);
      return { success: false, error: error.message };
    }
  },

  /**
   * Verifica si el código ingresado coincide con el guardado en la BD.
   */
  async verifyCode(telefono: string, code: string): Promise<{ success: boolean; error?: string }> {
    try {
      const cleanPhone = telefono.replace(/\D/g, '');

      // 1. Delegar verificación al backend (Controla intentos y expiración)
      const { data, error } = await supabasePublic.rpc('verificar_codigo_whatsapp', {
          telefono_input: cleanPhone,
          codigo_input: code
      });

      if (error) throw error;
      if (!data.success) return { success: false, error: data.error };

      return { success: true };
    } catch (error: any) {
      console.error('WhatsApp Verification Error:', error);
      return { success: false, error: error.message };
    }
  }
};
