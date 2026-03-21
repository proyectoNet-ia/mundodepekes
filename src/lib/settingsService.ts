import { supabase } from './supabase';

export interface SystemSettings {
  mundo_pekes: number;
  trampolin: number;
  horarios?: {
    [key: string]: string; // "lunes": "20:00", etc.
  };
  fidelizacion_activa: boolean;
  fidelizacion_visitas: number;
  fidelizacion_minutos: number;
  nombre_negocio: string;
  texto_ticket: string;
  edad_minima: number;
  edad_maxima: number;
}

const DEFAULT_SETTINGS: SystemSettings = {
  mundo_pekes: 30,
  trampolin: 35,
  horarios: {
    "lunes": "20:00",
    "martes": "20:00",
    "miercoles": "20:00",
    "jueves": "20:00",
    "viernes": "20:00",
    "sabado": "21:00",
    "domingo": "21:00"
  },
  fidelizacion_activa: true,
  fidelizacion_visitas: 10,
  fidelizacion_minutos: 60,
  nombre_negocio: 'Mundo de Pekes',
  texto_ticket: '¡Gracias por visitarnos! No olvides tus calcetines para la próxima.',
  edad_minima: 1,
  edad_maxima: 12
};

export const getSystemSettings = async (): Promise<SystemSettings> => {
  const { data, error } = await supabase
    .from('config_sistema')
    .select('valor')
    .eq('clave', 'capacidades')
    .single();

  if (error) {
    console.error('Error fetching settings:', error);
    return DEFAULT_SETTINGS; // Fallback
  }

  return { ...DEFAULT_SETTINGS, ...(data.valor as any) };
};

export const updateSystemSettings = async (settings: SystemSettings) => {
  const { error } = await supabase
    .from('config_sistema')
    .upsert({ clave: 'capacidades', valor: settings });

  if (error) {
    throw error;
  }
};
