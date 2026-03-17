import { supabase } from './supabase';

export interface SystemSettings {
  mundo_pekes: number;
  trampolin: number;
}

export const getSystemSettings = async (): Promise<SystemSettings> => {
  const { data, error } = await supabase
    .from('config_sistema')
    .select('valor')
    .eq('clave', 'capacidades')
    .single();

  if (error) {
    console.error('Error fetching settings:', error);
    return { mundo_pekes: 30, trampolin: 35 }; // Fallback
  }

  return data.valor as SystemSettings;
};

export const updateSystemSettings = async (settings: SystemSettings) => {
  const { error } = await supabase
    .from('config_sistema')
    .upsert({ clave: 'capacidades', valor: settings });

  if (error) {
    throw error;
  }
};
