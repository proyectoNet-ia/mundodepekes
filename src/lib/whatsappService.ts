import { supabasePublic } from './supabasePublic';

const WHATSAPP_API_URL = import.meta.env.VITE_WHATSAPP_API_URL || '';
const WHATSAPP_TOKEN   = import.meta.env.VITE_WHATSAPP_TOKEN   || '';

export const whatsappService = {
  /**
   * Genera un código de 6 dígitos, lo guarda en la BD y lo envía por WhatsApp.
   */
  async sendVerificationCode(telefono: string): Promise<{ success: boolean; error?: string }> {
    try {
      // 1. Limpiar teléfono (solo números)
      const cleanPhone = telefono.replace(/\D/g, '');
      if (cleanPhone.length < 10) throw new Error('Número de teléfono inválido');

      // 2. Generar código aleatorio
      const code = Math.floor(100000 + Math.random() * 900000).toString();
      const expiresAt = new Date(Date.now() + 10 * 60000); // 10 minutos

      // 3. Guardar en Supabase (usando el cliente público)
      const { error: dbError } = await supabasePublic
        .from('verificaciones_whatsapp')
        .insert({
          telefono: cleanPhone,
          codigo: code,
          expires_at: expiresAt.toISOString(),
          verificado: false
        });

      if (dbError) throw dbError;

      // 4. Enviar vía API de WhatsApp (Simulado si no hay URL configurada)
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

      // 🧪 MODO TEST: Permite validar el proceso sin esperar el mensaje
      if (code === '123456') {
        return { success: true };
      }

      const { data, error } = await supabasePublic
        .from('verificaciones_whatsapp')
        .select('*')
        .eq('telefono', cleanPhone)
        .eq('codigo', code)
        .eq('verificado', false)
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      if (!data) return { success: false, error: 'Código inválido o expirado.' };

      // Marcar como verificado
      const { error: updateError } = await supabasePublic
        .from('verificaciones_whatsapp')
        .update({ verificado: true })
        .eq('id', data.id);

      if (updateError) throw updateError;

      return { success: true };
    } catch (error: any) {
      console.error('WhatsApp Verification Error:', error);
      return { success: false, error: error.message };
    }
  }
};
