import { createClient } from '@supabase/supabase-js';

/**
 * Cliente Supabase PÚBLICO — solo para el portal de pre-registro.
 *
 * Diferencias vs el cliente principal (supabase.ts):
 *  - Sin persistencia de sesión (no toca localStorage)
 *  - Sin auto-refresh del token (evita el Web Lock "steal")
 *  - Sin detección de sesión en URL
 *
 * Esto elimina el AbortError: "Lock broken by another request with the 'steal' option"
 * que ocurre cuando el cliente auth compite con peticiones anónimas simultáneas.
 */
const supabaseUrl     = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Faltan las credenciales de Supabase en el archivo .env');
}

export const supabasePublic = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession:    false,
    autoRefreshToken:  false,
    detectSessionInUrl: false,
    storageKey: 'sb-portal-public-auth', // Clave única → Web Lock separado del admin
  },
});
