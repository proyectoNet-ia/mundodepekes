import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Faltan las credenciales de Supabase en el archivo .env');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Desactivar REALTIME globalmente para optimizar el rendimiento y evitar errores de red (WebSockets wss://)
const originalChannel = supabase.channel.bind(supabase);
supabase.channel = (name: string, opts?: any) => {
  const channel = originalChannel(name, opts);
  
  channel.subscribe = (callback?: (status: any, err?: any) => void) => {
    console.info(`[Realtime] Suscripción al canal "${name}" omitida (Realtime desactivado).`);
    if (callback) {
      setTimeout(() => callback('SUBSCRIBED'), 0);
    }
    return channel;
  };
  
  channel.unsubscribe = () => {
    return Promise.resolve('ok');
  };
  
  channel.send = async () => {
    return 'ok';
  };
  
  return channel;
};
