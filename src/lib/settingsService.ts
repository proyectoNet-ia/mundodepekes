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
  categorias_inventario?: string[];
  logo_url?: string;
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
  edad_maxima: 12,
  categorias_inventario: ['Bebidas', 'Alimentos', 'Juguetes', 'Higiene', 'Ropa', 'Accesorios', 'Otros']
};

const SETTINGS_CACHE_TTL_MS = 5 * 60 * 1000;
let settingsCache: { data: SystemSettings; expiresAt: number } | null = null;
let inFlightSettingsPromise: Promise<SystemSettings> | null = null;

export const getSystemSettings = async (forceRefresh = false): Promise<SystemSettings> => {
  if (!forceRefresh && settingsCache && Date.now() < settingsCache.expiresAt) {
    return settingsCache.data;
  }

  if (!forceRefresh && inFlightSettingsPromise) {
    return inFlightSettingsPromise;
  }

  inFlightSettingsPromise = (async () => {
    try {
      const { data, error } = await supabase
        .from('config_sistema')
        .select('valor')
        .eq('clave', 'capacidades')
        .maybeSingle();

      if (error) {
        console.error('Error fetching settings:', error);
        return settingsCache?.data || DEFAULT_SETTINGS;
      }

      const resolved = data ? { ...DEFAULT_SETTINGS, ...(data.valor as any) } : DEFAULT_SETTINGS;
      settingsCache = { data: resolved, expiresAt: Date.now() + SETTINGS_CACHE_TTL_MS };
      return resolved;
    } finally {
      inFlightSettingsPromise = null;
    }
  })();

  return inFlightSettingsPromise;
};

export const updateSystemSettings = async (settings: SystemSettings) => {
  const { error } = await supabase
    .from('config_sistema')
    .upsert({ clave: 'capacidades', valor: settings });

  if (error) {
    throw error;
  }

  settingsCache = { data: settings, expiresAt: Date.now() + SETTINGS_CACHE_TTL_MS };
};
