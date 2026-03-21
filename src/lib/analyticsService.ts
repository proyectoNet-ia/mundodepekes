import { supabase } from './supabase';

export const getFullAnalytics = async (days = 7): Promise<any> => {
  const dateLimit = new Date();
  dateLimit.setDate(dateLimit.getDate() - days);
  const since = dateLimit.toISOString();

  // 1. Fetching Data
  const [
    { data: trans, error: tErr },
    { data: sessions, error: sErr },
    { data: customers, count: custCount, error: cErr },
    { data: expenses, error: eErr },
    { data: shiftHistory, error: hErr }
  ] = await Promise.all([
    supabase.from('transacciones').select('total, fecha, metodo_pago').gte('fecha', since),
    supabase.from('sesiones').select('paquete_id, area_actual, hora_inicio, paquetes(nombre)').gte('hora_inicio', since),
    supabase.from('clientes').select('id, visitas_acumuladas', { count: 'exact' }),
    supabase.from('gastos_diarios').select('monto, fecha, categoria, arqueo_id').gte('fecha', since.split('T')[0]),
    supabase.from('arqueos_caja').select('id, fecha_apertura, monto_inicial, monto_final_efectivo_esperado, monto_final_real').neq('estado', 'abierta').gte('fecha_apertura', since)
  ]);

  if (tErr || sErr || cErr || eErr || hErr) throw tErr || sErr || cErr || eErr || hErr;

  // 1.1 Fixed Costs Config (Master)
  const { data: configData } = await supabase
    .from('config_sistema')
    .select('valor')
    .eq('clave', 'fixed_costs_config')
    .single();
  const fixedConfig = configData?.valor || [];
  const fixedMonthlyTotal = fixedConfig.reduce((acc: number, item: any) => acc + (Number(item.monto) || 0), 0);

  // 1.2 Expenses processing (Logs are only for 'Salidas Autorizadas')
  const totalLogs = expenses?.reduce((acc, exp) => acc + Number(exp.monto), 0) || 0;
  // Final Expenses = Recurring Fixed + Variable Logs
  const totalExpenses = fixedMonthlyTotal + totalLogs;

  // 2. Processing Sales Trend (Daily - Sorted)
  const weekdays = ['dom', 'lun', 'mar', 'mie', 'jue', 'vie', 'sab'];
  const dailySums: Record<number, number> = {};
  const dailyExpensesMap: Record<number, number> = {};
  
  trans?.forEach(t => {
    const dayIndex = new Date(t.fecha).getDay();
    dailySums[dayIndex] = (dailySums[dayIndex] || 0) + Number(t.total);
  });

  expenses?.forEach(e => {
    const dayIndex = new Date(e.fecha).getDay();
    dailyExpensesMap[dayIndex] = (dailyExpensesMap[dayIndex] || 0) + Number(e.monto);
  });

  const sortedSales = weekdays.map((name, index) => ({
    name: name.toUpperCase(),
    ventas: dailySums[index] || 0,
    gastos: dailyExpensesMap[index] || 0,
    utilidad: (dailySums[index] || 0) - (dailyExpensesMap[index] || 0)
  }));
  
  const chronologicalSales = [...sortedSales.slice(1), sortedSales[0]];

  // 3. Area Distribution
  const areaMap: Record<string, number> = {};
  sessions?.forEach(s => {
    const area = s.area_actual || 'General';
    areaMap[area] = (areaMap[area] || 0) + 1;
  });

  // 4. Package Popularity (Contextual)
  const pkgData: Record<string, {name: string, area: string, count: number}> = {};
  sessions?.forEach((s: any) => {
    const pkgName = s.paquetes?.nombre || 'Paquete Único';
    if (!pkgData[pkgName]) {
       pkgData[pkgName] = { 
          name: pkgName, 
          area: s.area_actual || 'General', 
          count: 0 
       };
    }
    pkgData[pkgName].count += 1;
  });

  const packagePopularity = Object.values(pkgData).sort((a, b) => {
    // Sort by Area (A-Z)
    if (a.area < b.area) return -1;
    if (a.area > b.area) return 1;
    // Then by count (Desc)
    return b.count - a.count;
  });

  // 5. Hourly Traffic (Optimized for 12 PM - 9 PM)
  const hourlyMap: Record<string, number> = {};
  for(let i=12; i<=21; i++) {
     const hourLabel = i > 12 ? `${i-12} PM` : (i === 12 ? '12 PM' : `${i} AM`);
     hourlyMap[hourLabel] = 0;
  }

  sessions?.forEach(s => {
    const hour = new Date(s.hora_inicio).getHours();
    if (hour >= 12 && hour <= 21) {
      const key = hour > 12 ? `${hour-12} PM` : (hour === 12 ? '12 PM' : `${hour} AM`);
      hourlyMap[key] = (hourlyMap[key] || 0) + 1;
    }
  });

  // 6. Cash Accuracy (Audit)
  const auditHistory = shiftHistory?.map(sh => {
    const gastosTurno = expenses?.filter(e => e.arqueo_id === sh.id).reduce((acc, g) => acc + Number(g.monto), 0) || 0;
    const inicial = Number(sh.monto_inicial);
    const ventas = Number(sh.monto_final_efectivo_esperado);
    const real = Number(sh.monto_final_real);

    const esperadoTotal = (inicial + ventas) - gastosTurno;
    const diff = real - esperadoTotal;
    
    return {
      id: sh.id,
      date: new Date(sh.fecha_apertura).toLocaleDateString([], { day: '2-digit', month: 'short' }),
      time: new Date(sh.fecha_apertura).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      fullDate: sh.fecha_apertura,
      inicial,
      ventas,
      gastos: gastosTurno,
      real,
      esperado: esperadoTotal,
      diff: Number(diff.toFixed(2))
    };
  }).reverse() || [];

  // 7. Metrics & Monthly ROI Calculation
  const totalIncome = trans?.reduce((acc, t) => acc + Number(t.total), 0) || 0;
  const netProfit = totalIncome - totalExpenses;
  const profitMargin = totalIncome > 0 ? (netProfit / totalIncome) * 100 : 0;
  const avgTicket = trans?.length ? totalIncome / trans.length : 0;
  
  // Custom Monthly ROI Stats (Current Month)
  const today = new Date();
  const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1).toISOString();
  
  const [ { data: mTrans }, { data: mExp } ] = await Promise.all([
    supabase.from('transacciones').select('total').gte('fecha', startOfMonth),
    supabase.from('gastos_diarios').select('monto').gte('fecha', startOfMonth.split('T')[0])
  ]);

  const monthlyIncome = mTrans?.reduce((acc, t) => acc + Number(t.total), 0) || 0;
  const monthlyExpenses = mExp?.reduce((acc, e) => acc + Number(e.monto), 0) || 0;

  const returningCount = customers?.filter(c => c.visitas_acumuladas > 1).length || 0;
  const returningRate = custCount ? (returningCount / custCount) * 100 : 0;

  return {
    salesByDay: chronologicalSales,
    areaDistribution: Object.entries(areaMap).map(([name, count]) => ({ name, count })),
    packagePopularity,
    hourlyTraffic: Object.entries(hourlyMap).map(([hour, count]) => ({ hour, count })),
    auditHistory,
    monthlyStats: {
      income: monthlyIncome,
      expenses: monthlyExpenses
    },
    metrics: {
      totalIncome,
      totalExpenses,
      netProfit,
      profitMargin,
      avgTicket,
      customerCount: custCount || 0,
      totalVisits: sessions?.length || 0,
      returningRate,
      fixedMonthlyTotal // Exported for UI use
    }
  };
};

export const getMonthlyROI = async (month: number, year: number) => {
    // month is 0-indexed (0=Jan, 11=Dec)
    const startOfMonth = new Date(year, month, 1).toISOString();
    const endOfMonth = new Date(year, month + 1, 0, 23, 59, 59).toISOString();
    
    const [ { data: mTrans }, { data: mExp } ] = await Promise.all([
      supabase.from('transacciones').select('total').gte('fecha', startOfMonth).lte('fecha', endOfMonth),
      supabase.from('gastos_diarios').select('monto').gte('fecha', startOfMonth).lte('fecha', endOfMonth)
    ]);
  
    const income = mTrans?.reduce((acc, t) => acc + Number(t.total), 0) || 0;
    const expenses = mExp?.reduce((acc, e) => acc + Number(e.monto), 0) || 0;
  
    return { income, expenses };
};

export const getSalesSummary = async () => {
    const data = await getFullAnalytics(7);
    return data.salesByDay;
};

export const getTopMetrics = async () => {
    const data = await getFullAnalytics(30);
    return data.metrics;
};
export const getFixedCosts = async () => {
    const { data, error } = await supabase
        .from('config_sistema')
        .select('valor')
        .eq('clave', 'fixed_costs_config')
        .single();
    if (error && error.code !== 'PGRST116') throw error;
    return data?.valor || [];
};

export const getFinancialHealth = async (): Promise<any> => {
    const { data, error } = await supabase.rpc('get_financial_health_summary');
    if (error) throw error;
    return data;
};

export const saveFixedCosts = async (items: any[]) => {
    const { error } = await supabase
        .from('config_sistema')
        .upsert({ clave: 'fixed_costs_config', valor: items });
    if (error) throw error;
};
