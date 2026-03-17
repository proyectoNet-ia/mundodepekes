import { supabase } from './supabase';

export const getSalesSummary = async () => {
  const { data, error } = await supabase
    .from('transacciones')
    .select('total, creado_at');

  if (error) {
    console.error(error);
    return [];
  }

  // Group by day for the chart
  const groups: Record<string, number> = {};
  data.forEach(t => {
    const day = new Date(t.creado_at).toLocaleDateString('es-ES', { weekday: 'short' });
    groups[day] = (groups[day] || 0) + Number(t.total);
  });

  return Object.entries(groups).map(([name, ventas]) => ({ name, ventas }));
};

export const getTopMetrics = async () => {
  const { data: trans } = await supabase.from('transacciones').select('total');
  const { count: customers } = await supabase.from('clientes').select('*', { count: 'exact', head: true });
  
  const totalIncome = trans?.reduce((acc, t) => acc + Number(t.total), 0) || 0;
  const avgTicket = trans?.length ? totalIncome / trans.length : 0;

  return {
    totalIncome,
    avgTicket,
    customerCount: customers || 0
  };
};
