import { supabase } from './supabase';
import { AuditService } from './auditService';
import { notificationsService } from './notificationsService';
import { stockService } from './stockService';

export type CashSessionStatus = 'abierta' | 'en_operacion' | 'corte_pendiente' | 'corte_cerrado' | 'auditoria';

export interface CashSession {
  id: string;
  fecha_apertura: string;
  fecha_cierre?: string;
  monto_inicial: number;
  monto_final_efectivo_esperado: number;
  monto_final_tarjeta_esperado: number;
  monto_final_real?: number;
  monto_final_tarjeta_real?: number;
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
      .order('fecha_apertura', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error && error.code !== 'PGRST116') {
      console.warn('Error fetching cash session:', error);
      const cached = localStorage.getItem('cache_caja');
      return cached ? JSON.parse(cached) : null;
    }

    if (data) {
        localStorage.setItem('cache_caja', JSON.stringify(data));
    } else if (!error) {
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
  const existing = await getActiveSession();
  if (existing && existing.id && !existing.id.startsWith('OFFLINE-')) {
    return existing; // Ya está abierta, retornarla para evitar duplicados
  }

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

  const summary = {
    efectivo: 0,
    tarjeta: 0,
    gastos: 0,
    total: 0,
    cancelados_monto: 0,
    cancelados_count: 0
  };

  // Cargar transacciones (pagadas y canceladas)
  const { data: trans, error: tError } = await supabase
    .from('transacciones')
    .select('total, metodo_pago, estado')
    .eq('arqueo_id', arqueoId)
    .gte('fecha', since);

  if (tError) throw tError;

  // Cargar también gastos del periodo vinculado al arqueo
  const { data: expenses, error: eError } = await supabase
    .from('gastos_diarios')
    .select('monto')
    .eq('arqueo_id', arqueoId);

  if (eError) console.warn('Error al cargar gastos:', eError);
  summary.gastos = expenses?.reduce((acc, exp) => acc + Number(exp.monto), 0) || 0;

  trans?.forEach((t: any) => {
    const amount = Number(t.total);
    if (t.estado === 'cancelado') {
        summary.cancelados_monto += amount;
        summary.cancelados_count += 1;
    } else if (t.estado === 'pagado') {
        if (t.metodo_pago.toLowerCase() === 'efectivo') {
          summary.efectivo += amount;
        } else {
          summary.tarjeta += amount;
        }
    }
  });

  // El saldo neto esperado es (Ingresos Pagados) - (Egresos)
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

  // 4. Revertir inventario (entradas)
  const txFolio = transactionId.substring(0, 8);
  const { data: movimientos } = await supabase
    .from('movimientos_inventario')
    .select('id, item_id, cantidad, motivo')
    .eq('tipo', 'salida')
    .or(`motivo.ilike.%${transactionId}%,motivo.ilike.%${txFolio}%`);

  if (movimientos && movimientos.length > 0) {
    for (const mov of movimientos) {
      await stockService.recordMovement(
        mov.item_id,
        mov.cantidad,
        'entrada',
        `Anulación Ticket - Folio: ${txFolio}`,
        true
      );
    }
  }

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
      accion: (monto < 0 ? 'INGRESO' : 'EGRESO') as any,
      modulo: 'TESORERIA',
      descripcion: monto < 0 
        ? `Entrada de caja registrada por $ ${Math.abs(monto)}: ${descripcion}` 
        : `Gasto registrado por $ ${monto}: ${descripcion}`,
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
  realEfectivo: number;
  realTarjeta: number;
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
  
  const diferenciaEfectivo = Math.abs(data.realEfectivo - esperadoEfectivo); 
  const diferenciaTarjeta = Math.abs(data.realTarjeta - data.tarjeta);
  const estadoFinal: CashSessionStatus = (diferenciaEfectivo > 100 || diferenciaTarjeta > 100) ? 'auditoria' : 'corte_cerrado';

  const { error } = await supabase
    .from('arqueos_caja')
    .update({
      fecha_cierre: new Date().toISOString(),
      monto_final_efectivo_esperado: data.efectivo,
      monto_final_tarjeta_esperado: data.tarjeta,
      monto_final_real: data.realEfectivo,
      monto_final_tarjeta_real: data.realTarjeta,
      observaciones: data.obs,
      estado: estadoFinal
    })
    .eq('id', id);

  if (error) throw error;
  
  await AuditService.log({
    accion: estadoFinal === 'auditoria' ? 'DISCREPANCIA' : 'CIERRE',
    modulo: 'TESORERIA',
    descripcion: `Cierre de caja ${id}. Dif Efectivo: $ ${diferenciaEfectivo.toFixed(2)}, Dif Tarjeta: $ ${diferenciaTarjeta.toFixed(2)}. ${data.obs || ''}`,
    metadatos: { 
        arqueo_id: id, 
        diferenciaEfectivo, 
        diferenciaTarjeta,
        realEfectivo: data.realEfectivo, 
        esperadoEfectivo,
        realTarjeta: data.realTarjeta,
        esperadoTarjeta: data.tarjeta
    },
    severidad: estadoFinal === 'auditoria' ? 'CRITICAL' : 'INFO'
  });

  const title = estadoFinal === 'auditoria' ? '⚠️ DISCREPANCIA EN CIERRE' : '🔒 Caja Cerrada';
  const msg = estadoFinal === 'auditoria' 
    ? `Cierre con discrepancia. Efectivo: $${diferenciaEfectivo.toFixed(2)} | Tarjeta: $${diferenciaTarjeta.toFixed(2)}`
    : `Turno finalizado. Efectivo Real: $${data.realEfectivo.toFixed(2)} | Tarjeta Real: $${data.realTarjeta.toFixed(2)}.`;

  await notificationsService.notify('cash_close', title, msg, { arqueo_id: id, diferenciaEfectivo, diferenciaTarjeta, estado: estadoFinal });

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

export interface ShiftProductItem {
  nombre: string;
  cantidad: number;
  categoria?: string;
}

export const getShiftProductsSoldSummary = async (fechaApertura: string): Promise<ShiftProductItem[]> => {
  if (!navigator.onLine) {
    return [];
  }

  try {
    const { data, error } = await supabase
      .from('movimientos_inventario')
      .select(`
        cantidad,
        tipo,
        motivo,
        created_at,
        inventario (
          nombre,
          categoria
        )
      `)
      .in('tipo', ['salida', 'entrada'])
      .gte('created_at', fechaApertura);

    if (error) {
      console.error('Error fetching shift products sold summary:', error);
      return [];
    }

    const { data: cancelledTxs } = await supabase
      .from('transacciones')
      .select('id')
      .eq('estado', 'cancelado')
      .gte('fecha', fechaApertura);

    const cancelledFolios = new Set<string>();
    const cancelledIds = new Set<string>();
    cancelledTxs?.forEach(t => {
      cancelledIds.add(t.id);
      cancelledFolios.add(t.id.substring(0, 8).toUpperCase());
    });

    const map: Record<string, { cantidad: number; categoria?: string }> = {};

    data?.forEach((mov: any) => {
      const motivo = mov.motivo || '';
      const isSalidaVenta = mov.tipo === 'salida' && (motivo.toLowerCase().includes('venta') || motivo.toLowerCase().includes('pos'));
      const isEntradaAnulacion = mov.tipo === 'entrada' && (motivo.toLowerCase().includes('anulaci') || motivo.toLowerCase().includes('cancelad'));

      if (!isSalidaVenta && !isEntradaAnulacion) {
        return; 
      }

      let isCancelledSale = false;
      if (isEntradaAnulacion) {
        isCancelledSale = true;
      } else if (isSalidaVenta) {
        for (const id of cancelledIds) {
          if (motivo.includes(id)) {
            isCancelledSale = true;
            break;
          }
        }
        if (!isCancelledSale) {
          for (const fol of cancelledFolios) {
            if (motivo.includes(fol)) {
              isCancelledSale = true;
              break;
            }
          }
        }
      }

      if (isCancelledSale) {
        return;
      }

      const nombre = mov.inventario?.nombre || 'Producto Desconocido';
      const categoriaDb = mov.inventario?.categoria || 'General';
      const qty = Number(mov.cantidad) || 0;
      const finalQty = isEntradaAnulacion ? -qty : qty;

      let categoria = categoriaDb;
      const c = (categoriaDb || '').toLowerCase();
      const n = (nombre || '').toLowerCase();
      
      if (c.includes('ropa') || c.includes('calcet') || n.includes('calcet') || n.includes('sock') || n.includes('media')) {
        categoria = 'Ropa';
      } else if (c.includes('bebida') || c.includes('refresco') || c.includes('agua') || 
                 n.includes('agua') || n.includes('refresco') || n.includes('powerade') || 
                 n.includes('ciel') || n.includes('coca') || n.includes('sprite') || n.includes('fanta') || n.includes('jugo')) {
        categoria = 'Bebidas';
      }

      if (map[nombre]) {
        map[nombre].cantidad += finalQty;
      } else {
        map[nombre] = { cantidad: finalQty, categoria };
      }
    });

    const getCategoryPriority = (catName: string, prodName: string) => {
      const c = (catName || '').toLowerCase();
      const p = (prodName || '').toLowerCase();
      
      if (c.includes('calcet') || p.includes('calcet') || p.includes('sock') || p.includes('media')) return 1;
      if (c.includes('agua') || p.includes('agua') || p.includes('ciel') || p.includes('bonafont') || p.includes('epura')) return 2;
      if (c.includes('refresco') || c.includes('bebida') || p.includes('coca') || p.includes('fanta') || p.includes('sprite') || p.includes('mundet') || p.includes('sidral') || p.includes('pepsi') || p.includes('lata') || p.includes('powerade') || p.includes('jugo')) return 3;
      if (c.includes('papas') || c.includes('churrum') || c.includes('sabrita') || c.includes('snack') || c.includes('dulce') || p.includes('papas') || p.includes('sabrita') || p.includes('chocolate')) return 4;
      return 5;
    };

    return Object.entries(map)
      .filter(([_, details]) => details.cantidad > 0)
      .map(([nombre, details]) => ({
      nombre,
      cantidad: details.cantidad,
      categoria: details.categoria || 'General'
    })).sort((a, b) => {
      const priorityA = getCategoryPriority(a.categoria, a.nombre);
      const priorityB = getCategoryPriority(b.categoria, b.nombre);
      
      if (priorityA !== priorityB) {
        return priorityA - priorityB;
      }
      return a.nombre.localeCompare(b.nombre);
    });
  } catch (e) {
    console.error('Failed to calculate shift products summary:', e);
    return [];
  }
};
