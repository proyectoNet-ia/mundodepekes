import { supabase } from './supabase';
import { AuditService } from './auditService';
import { notificationsService } from './notificationsService';

export type CashSessionStatus = 'abierta' | 'en_operacion' | 'corte_pendiente' | 'corte_cerrado' | 'auditoria';

export interface CashSession {
  id: string;
  fecha_apertura: string;
  fecha_cierre?: string;
  monto_inicial: number;
  monto_final_efectivo_esperado: number;
  monto_final_tarjeta_esperado: number;
  monto_final_real?: number;
  observaciones?: string;
  estado: CashSessionStatus;
}

export interface Expense {
  id: string;
  fecha: string;
  categoria: string;
  monto: number;
  descripcion: string;
  arqueo_id: string;
  tiene_comprobante: boolean;
  autorizado_por?: string;
}

export const getActiveSession = async (): Promise<CashSession | null> => {
  if (!navigator.onLine) {
    const cached = localStorage.getItem('cache_caja');
    // Si no hay internet, asumimos que la caja está abierta virtualmente para no bloquear al cajero
    return cached ? JSON.parse(cached) : { 
      id: `OFFLINE-${Date.now()}`, 
      estado: 'abierta', 
      monto_inicial: 0,
      fecha_apertura: new Date().toISOString(),
      monto_final_efectivo_esperado: 0,
      monto_final_tarjeta_esperado: 0 
    };
  }

  try {
    const { data, error } = await supabase
      .from('arqueos_caja')
      .select('*')
      .eq('estado', 'abierta')
      .maybeSingle();

    if (error && error.code !== 'PGRST116') {
      console.error('Error fetching cash session:', error);
      return null;
    }

    if (data) {
        localStorage.setItem('cache_caja', JSON.stringify(data));
    } else {
        localStorage.removeItem('cache_caja');
    }
    
    return data;
  } catch (e) {
    console.warn('Fallo red al verificar caja. Usando caché...', e);
    const cached = localStorage.getItem('cache_caja');
    return cached ? JSON.parse(cached) : { 
      id: `OFFLINE-${Date.now()}`, 
      estado: 'abierta', 
      monto_inicial: 0,
      fecha_apertura: new Date().toISOString(),
      monto_final_efectivo_esperado: 0,
      monto_final_tarjeta_esperado: 0 
    };
  }
};

export const openCash = async (montoInicial: number): Promise<CashSession> => {
  const { data, error } = await supabase
    .from('arqueos_caja')
    .insert({
      monto_inicial: montoInicial,
      estado: 'abierta'
    })
    .select()
    .single();

  if (error) throw error;

  await AuditService.log({
    accion: 'APERTURA',
    modulo: 'TESORERIA',
    descripcion: `Apertura de caja con fondo de $ ${montoInicial}`,
    metadatos: { arqueo_id: data.id }
  });

  await notificationsService.notify(
    'cash_open',
    '🔓 Caja Abierta',
    `Se ha iniciado un nuevo turno con un fondo de $${montoInicial}.`,
    { arqueo_id: data.id, monto: montoInicial }
  );

  return data;
};

export const getTransactionsSummary = async (since: string, arqueoId?: string) => {
  let query = supabase
    .from('transacciones')
    .select('total, metodo_pago')
    .eq('estado', 'pagado')
    .gte('fecha', since);

  if (arqueoId) {
    query = query.eq('arqueo_id', arqueoId);
  }

  const { data, error } = await query;

  if (error) throw error;

  const summary = {
    efectivo: 0,
    tarjeta: 0,
    gastos: 0,
    total: 0
  };

  // Cargar también gastos del periodo vinculado al arqueo
  const { data: expenses, error: eError } = await supabase
    .from('gastos_diarios')
    .select('monto')
    .eq('arqueo_id', arqueoId);

  if (eError) console.warn('Error al cargar gastos:', eError);
  summary.gastos = expenses?.reduce((acc, exp) => acc + Number(exp.monto), 0) || 0;

  data?.forEach((t: any) => {
    const amount = Number(t.total);
    if (t.metodo_pago.toLowerCase() === 'efectivo') {
      summary.efectivo += amount;
    } else {
      summary.tarjeta += amount;
    }
  });

  // El saldo neto esperado es (Ingresos) - (Egresos)
  summary.total = (summary.efectivo + summary.tarjeta) - summary.gastos;

  return summary;
};

export const getShiftTransactions = async (arqueoId: string) => {
  const { data, error } = await supabase
    .from('transacciones')
    .select(`
      id,
      total,
      metodo_pago,
      estado,
      fecha,
      clientes(nombre, telefono),
      sesiones(id, paquete_id, ninos(nombre), estado)
    `)
    .eq('arqueo_id', arqueoId)
    .order('fecha', { ascending: false });

  if (error) throw error;
  return data;
};

export const cancelTransaction = async (transactionId: string, authorizer: string, reason: string) => {
  // 1. Cancelar la transacción
  const { error: tError } = await supabase
    .from('transacciones')
    .update({ estado: 'cancelado' })
    .eq('id', transactionId);
  
  if (tError) throw tError;

  // 2. Cancelar sesiones asociadas (si hubiera)
  await supabase
    .from('sesiones')
    .update({ estado: 'cancelado' })
    .eq('transaccion_id', transactionId);

  // 3. Registrar en Auditoría obligatoriamente
  await AuditService.log({
    accion: 'VENTAS' as any,
    modulo: 'TESORERIA',
    descripcion: `Venta anulada por ${authorizer}. Motivo: ${reason}. (Folio: ${transactionId.substring(0,8)})`,
    metadatos: { transaction_id: transactionId, authorizer, reason, action: 'cancel' }
  });

  return true;
};

export const recordExpense = async (monto: number, descripcion: string, tieneComprobante: boolean = false, autorizadoPor?: string, categoria: string = 'Insumos'): Promise<Expense> => {
    const activeSession = await getActiveSession();
    if (!activeSession) throw new Error('No hay una sesión de caja activa');
  
    const { data, error } = await supabase
      .from('gastos_diarios')
      .insert({
        monto,
        descripcion,
        categoria,
        arqueo_id: activeSession.id,
        tiene_comprobante: tieneComprobante,
        autorizado_por: autorizadoPor
      })
      .select()
      .single();
  
    if (error) throw error;
  
    await AuditService.log({
      accion: 'EGRESO' as any,
      modulo: 'TESORERIA',
      descripcion: `Gasto registrado por $ ${monto}: ${descripcion}`,
      metadatos: { expense_id: data.id, arqueo_id: data.arqueo_id }
    });
  
    return data;
};
  
export const getExpenses = async (arqueoId: string): Promise<Expense[]> => {
    const { data, error } = await supabase
      .from('gastos_diarios')
      .select('*')
      .eq('arqueo_id', arqueoId)
      .order('created_at', { ascending: false });
  
    if (error) throw error;
    return data;
};

export const closeCash = async (id: string, data: {
  efectivo: number;
  tarjeta: number;
  real: number;
  obs?: string;
}) => {
  // 1. Obtener la sesión actual para tener el fondo inicial
  const { data: arqueoData, error: aErr } = await supabase
    .from('arqueos_caja')
    .select('monto_inicial')
    .eq('id', id)
    .single();

  if (aErr) throw aErr;

  // 2. Obtener gastos reales del arqueo
  const { data: expenseData, error: eErr } = await supabase
    .from('gastos_diarios')
    .select('monto')
    .eq('arqueo_id', id);

  if (eErr) throw eErr;

  const totalGastos = expenseData?.reduce((acc, g) => acc + Number(g.monto), 0) || 0;
  
  // 3. Calculo: Esperado = Inicial + VentasEfectivo - Gastos
  const montoInicial = Number(arqueoData.monto_inicial);
  const esperadoEfectivo = montoInicial + data.efectivo - totalGastos;
  
  const diferencia = Math.abs(data.real - esperadoEfectivo); 
  const estadoFinal: CashSessionStatus = diferencia > 100 ? 'auditoria' : 'corte_cerrado';

  const { error } = await supabase
    .from('arqueos_caja')
    .update({
      fecha_cierre: new Date().toISOString(),
      monto_final_efectivo_esperado: data.efectivo,
      monto_final_tarjeta_esperado: data.tarjeta,
      monto_final_real: data.real,
      observaciones: data.obs,
      estado: estadoFinal
    })
    .eq('id', id);

  if (error) throw error;
  
  await AuditService.log({
    accion: estadoFinal === 'auditoria' ? 'DISCREPANCIA' : 'CIERRE',
    modulo: 'TESORERIA',
    descripcion: `Cierre de caja ${id}. Diferencia: $ ${diferencia.toFixed(2)}. ${data.obs || ''}`,
    metadatos: { arqueo_id: id, diferencia, real: data.real, esperado: esperadoEfectivo },
    severidad: estadoFinal === 'auditoria' ? 'CRITICAL' : 'INFO'
  });

  const title = estadoFinal === 'auditoria' ? '⚠️ DISCREPANCIA EN CIERRE' : '🔒 Caja Cerrada';
  const msg = estadoFinal === 'auditoria' 
    ? `Cierre con diferencia de $${diferencia.toFixed(2)}. (Esperado: $${esperadoEfectivo.toFixed(2)} | Real: $${data.real.toFixed(2)})`
    : `Turno finalizado con un saldo real de $${data.real.toFixed(2)}.`;

  await notificationsService.notify('cash_close', title, msg, { arqueo_id: id, diferencia, estado: estadoFinal });

  return { success: true, estado: estadoFinal };
};

export const getLastSessions = async (limit = 5): Promise<CashSession[]> => {
    const { data, error } = await supabase
        .from('arqueos_caja')
        .select('*')
        .order('fecha_apertura', { ascending: false })
        .limit(limit);
    if (error) throw error;
    return data || [];
};
