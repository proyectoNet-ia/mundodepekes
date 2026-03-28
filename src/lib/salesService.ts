import { supabase } from './supabase';
import { stockService } from './stockService';
import { getActiveSession } from './treasuryService';
import { AuditService } from './auditService';
import { syncService } from './syncService';

export interface SearchResult {
  id: string;
  type: 'tutor' | 'child';
  name: string;
  phone?: string;
  childId?: string; 
  childName?: string;
  visitsCount: number;
  enListaNegra?: boolean;
  observaciones?: string;
  registeredChildren?: { id: string; name: string; age: number; observations: string; enListaNegra?: boolean }[];
}

export const omniSearch = async (term: string): Promise<SearchResult[]> => {
  if (!term) return [];

  const { data: tutors, error: tError } = await supabase
    .from('clientes')
    .select('id, nombre, telefono, visitas_acumuladas, ninos(id, nombre, edad, observaciones, en_lista_negra)')
    .or(`nombre.ilike.%${term}%,telefono.ilike.%${term}%`);

  const { data: children, error: cError } = await supabase
    .from('ninos')
    .select('id, nombre, en_lista_negra, observaciones, clientes(id, nombre, telefono, visitas_acumuladas, ninos(id, nombre, edad, observaciones, en_lista_negra))')
    .ilike('nombre', `%${term}%`);

  if (tError || cError) {
    console.error('Search error:', tError || cError);
    return [];
  }

  const results: SearchResult[] = [];
  tutors?.forEach(t => {
    results.push({
      id: t.id,
      type: 'tutor',
      name: t.nombre,
      phone: t.telefono,
      visitsCount: t.visitas_acumuladas || 0,
      registeredChildren: t.ninos?.map((n: any) => ({ 
          id: n.id, 
          name: n.nombre || '', 
          age: n.edad || 0, 
          observations: n.observaciones || '',
          enListaNegra: n.en_lista_negra || false
      })) || []
    });
  });

  children?.forEach((c: any) => {
    results.push({
      id: c.clientes?.id || '', // ID del tutor
      type: 'child',
      name: c.clientes?.nombre || 'Desconocido', // Nombre del tutor
      childId: c.id, // ID del niño
      childName: c.nombre, // Nombre del niño
      phone: c.clientes?.telefono,
      visitsCount: c.clientes?.visitas_acumuladas || 0,
      enListaNegra: c.en_lista_negra,
      observaciones: c.observaciones,
      registeredChildren: c.clientes?.ninos?.map((n: any) => ({ 
          id: n.id, 
          name: n.nombre || '', 
          age: n.edad || 0, 
          observations: n.observaciones || '',
          enListaNegra: n.en_lista_negra || false
      })) || []
    });
  });

  return results;
};

export const registerFullEntry = async (data: {
  customer: { name: string; phone: string; email?: string };
  children: { name: string; age: number; packageId: string; area: string; duration: number }[];
  accessories: { id: string; name: string; quantity: number }[];
  paymentMethod: string;
  total: number;
  staffEmail?: string;
  isReentry?: boolean;
}, isSync = false, originalTimestamp?: number) => {
  const formatOfflineResponse = async (localId: number) => ({
    success: true,
    isOffline: true,
    transaction: {
      id: `OFFLINE-${localId}-${Date.now()}`,
      customer: data.customer?.name || 'Cliente Offline',
      phone: data.customer?.phone || '',
      total: data.total || 0,
      children: data.children.map(c => ({
        name: c.name,
        package: c.packageId,
        area: c.area,
        duration: c.duration,
        startTime: new Date(),
        endTime: new Date(Date.now() + c.duration * 60000)
      })),
      accessories: data.accessories
    }
  });

  // Check network before even trying
  if (!navigator.onLine && !isSync) {
    const localId = await syncService.enqueue('sale', data);
    return formatOfflineResponse(localId);
  }

  try {
    // 1. Get or Create Customer
    const phone = data.customer?.phone || (data as any).clientId;
    if (!phone) {
        const error = new Error('Se requiere teléfono del cliente');
        (error as any).isValidationError = true;
        throw error;
    }

    let { data: customer, error: cError } = await supabase
      .from('clientes')
      .select('id, visitas_acumuladas')
      .eq('telefono', phone)
      .single();

    if (cError && cError.code !== 'PGRST116') throw cError;

    if (!customer) {
      if (!data.customer?.name) {
          const error = new Error('Datos de cliente incompletos para registro nuevo');
          (error as any).isValidationError = true;
          throw error;
      }
      const { data: newCustomer, error: createError } = await supabase
        .from('clientes')
        .insert({
          nombre: data.customer.name,
          telefono: phone,
          email: data.customer.email
        })
        .select().single();
      if (createError || !newCustomer) throw createError || new Error('Error al crear el cliente');
      customer = newCustomer;
    }

    const customerId = (customer as any).id;

    // 2. Create Transaction vinculada al Arqueo Activo
    const activeSession = await getActiveSession();
    
    if (!activeSession && !isSync) {
        const error = new Error('No hay una sesión de caja abierta. Debe abrir turno para procesar ventas.');
        (error as any).isValidationError = true;
        throw error;
    }

    const { data: transaction, error: tError } = await supabase
      .from('transacciones')
      .insert({
        cliente_id: customerId,
        total: data.total || 0,
        metodo_pago: data.paymentMethod,
        arqueo_id: activeSession?.id || (isSync ? null : undefined) // Evitar nulls accidentales
      })
      .select().single();

    if (tError || !transaction) throw tError || new Error('Error al crear la transacción');

    await AuditService.log({
      accion: 'VENTAS' as any, // Ajuste para que coincida con el enum o string
      modulo: 'VENTAS',
      descripcion: `Venta registrada por $ ${data.total} (Folio: ${transaction.id.substring(0,8)})`,
      metadatos: { transaction_id: transaction.id, arqueo_id: transaction.arqueo_id }
    });

    // 3. Process Children and Sessions
    for (const childInfo of data.children) {
      let { data: child, error: childFetchError } = await supabase
        .from('ninos')
        .select('id')
        .eq('nombre', childInfo.name)
        .eq('cliente_id', customerId)
        .single();

      if (childFetchError && childFetchError.code !== 'PGRST116') throw childFetchError;

      if (!child) {
        const { data: newChild, error: childCreateError } = await supabase
          .from('ninos')
          .insert({
            nombre: childInfo.name,
            edad: childInfo.age,
            cliente_id: customerId
          })
          .select().single();
        if (childCreateError || !newChild) throw childCreateError || new Error('Error al crear el niño');
        child = newChild;
      }

      const childId = (child as any).id;
      const startTime = originalTimestamp ? new Date(originalTimestamp) : new Date();
      const endTime = new Date(startTime.getTime() + childInfo.duration * 60000);

      // --- LIMPIEZA DE SESIONES PREVIAS (Evita Duplicados) ---
      // Si el niño ya estaba adentro, cerramos su sesión anterior para que la nueva tome el control
      await supabase
        .from('sesiones')
        .update({ estado: 'finalizado' })
        .eq('nino_id', childId)
        .eq('estado', 'activo');

      const { error: sError } = await supabase
        .from('sesiones')
        .insert({
          transaccion_id: transaction.id,
          nino_id: childId,
          paquete_id: childInfo.packageId,
          hora_inicio: startTime.toISOString(),
          hora_fin: endTime.toISOString(),
          area_actual: childInfo.area,
          estado: 'activo'
        });
      if (sError) throw sError;
    }

    // 4. Process Accessories and Stock
    for (const acc of data.accessories) {
        await stockService.recordMovement(
            acc.id, 
            acc.quantity, 
            'salida', 
            `Venta Transacción ID: ${transaction.id}`
        );
    }

    // 5. Update Loyalty (Solo si NO es reingreso)
    if (!data.isReentry) {
        try {
            await supabase.rpc('increment_visit_count', { client_uuid: customerId });
        } catch (e) {
            console.warn('RPC loyalty increment failed, trying manual update:', e);
            await supabase.from('clientes')
                .update({ visitas_acumuladas: (customer as any).visitas_acumuladas + 1 })
                .eq('id', customerId);
        }
    }

    return { 
      success: true, 
      transaction: {
        ...transaction,
        customer: data.customer?.name || 'Cliente',
        phone: data.customer?.phone || phone,
        children: data.children.map(c => ({
            name: c.name,
            package: c.packageId,
            area: c.area,
            duration: c.duration,
            startTime: new Date(),
            endTime: new Date(Date.now() + c.duration * 60000)
        }))
      }
    };
  } catch (err: any) {
    if (isSync || err.isValidationError) {
        throw err; // Re-lanzamos si es validación o si ya estamos sincronizando
    }
    console.warn('⚠️ Error de red. Guardando en cola offline:', err);
    const localId = await syncService.enqueue('sale', data);
    return formatOfflineResponse(localId);
  }
};

export const getCustomerByPhone = async (phone: string) => {
    const { data, error } = await supabase.from('clientes').select('*').eq('telefono', phone).single();
    if (error && error.code !== 'PGRST116') throw error;
    return data;
};

export const getBlacklistedChildren = async () => {
    const { data, error } = await supabase.from('ninos').select('id, nombre, observaciones, clientes(nombre, telefono)').eq('en_lista_negra', true);
    return error ? [] : data;
};

export const updateChildStatus = async (id: string, enListaNegra: boolean) => {
    const { error } = await supabase.from('ninos').update({ en_lista_negra: enListaNegra }).eq('id', id);
    if (error) throw error;
    return true;
};

export const registerInventorySale = async (data: {
  customer?: { name: string; phone: string };
  items: { id: string; name: string; quantity: number; price: number }[];
  paymentMethod: string;
  total: number;
}, isSync = false) => {
  if (!navigator.onLine && !isSync) {
    const localId = await syncService.enqueue('inventory_sale', data);
    return { success: true, isOffline: true, localId };
  }

  try {
    const activeSession = isSync ? null : await getActiveSession();
    
    if (!activeSession && !isSync) {
        throw new Error('No hay una sesión de caja abierta.');
    }

    let customerId = null;
    if (data.customer?.phone) {
        const { data: existing } = await supabase.from('clientes').select('id').eq('telefono', data.customer.phone).maybeSingle();
        if (existing) {
            customerId = existing.id;
        } else if (data.customer.name) {
            const { data: newCust } = await supabase.from('clientes').insert({ nombre: data.customer.name, telefono: data.customer.phone }).select('id').single();
            customerId = newCust?.id;
        }
    }

    const { data: transaction, error: tError } = await supabase
      .from('transacciones')
      .insert({
        cliente_id: customerId,
        total: data.total,
        metodo_pago: data.paymentMethod,
        arqueo_id: activeSession?.id || (isSync ? null : undefined)
      })
      .select().single();

    if (tError || !transaction) throw tError;

    for (const item of data.items) {
      await stockService.recordMovement(
        item.id,
        item.quantity,
        'salida',
        `Venta Directa POS - Folio: ${transaction.id.substring(0,8)}`,
        true // we pass isSync true because we take care of it here
      );
    }

    await AuditService.log({
        accion: 'VENTAS' as any,
        modulo: 'VENTAS',
        descripcion: `Venta directa de inventario por $ ${data.total}`,
        metadatos: { transaction_id: transaction.id, items: data.items.length }
    });

    return { success: true, transaction };
  } catch (err) {
    if (isSync) throw err;
    console.error('Inventory Sale Error. Saving offline:', err);
    const localId = await syncService.enqueue('inventory_sale', data);
    return { success: true, isOffline: true, localId };
  }
};
