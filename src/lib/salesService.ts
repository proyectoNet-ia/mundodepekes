import { supabase } from './supabase';

export interface SearchResult {
  id: string;
  type: 'tutor' | 'child';
  name: string;
  phone?: string;
  childName?: string;
  visitsCount: number;
}

export const omniSearch = async (term: string): Promise<SearchResult[]> => {
  if (!term) return [];

  // Search in customers (tutors)
  const { data: tutors, error: tError } = await supabase
    .from('clientes')
    .select('id, nombre, telefono, visitas_acumuladas')
    .or(`nombre.ilike.%${term}%,telefono.ilike.%${term}%`);

  // Search in children
  const { data: children, error: cError } = await supabase
    .from('ninos')
    .select('id, nombre, clientes(nombre, telefono, visitas_acumuladas)')
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
      visitsCount: t.visitas_acumuladas
    });
  });

  children?.forEach((c: any) => {
    results.push({
      id: c.id,
      type: 'child',
      name: c.clientes?.nombre || 'Desconocido',
      childName: c.nombre,
      phone: c.clientes?.telefono,
      visitsCount: c.clientes?.visitas_acumuladas || 0
    });
  });

  return results;
};

export const registerFullEntry = async (data: {
  customer: { name: string; phone: string; email?: string };
  children: { name: string; age: number; packageId: string; area: string; duration: number }[];
  paymentMethod: string;
  total: number;
}) => {
  // 1. Get or Create Customer
  let { data: customer, error: cError } = await supabase
    .from('clientes')
    .select('id')
    .eq('telefono', data.customer.phone)
    .single();

  if (cError && cError.code !== 'PGRST116') throw cError;

  if (!customer) {
    const { data: newCustomer, error: createError } = await supabase
      .from('clientes')
      .insert(data.customer)
      .select()
      .single();
    if (createError) throw createError;
    if (!newCustomer) throw new Error('Error al crear el cliente');
    customer = newCustomer;
  }

  const customerId = (customer as any).id;

  // 2. Create Transaction
  const { data: transaction, error: tError } = await supabase
    .from('transacciones')
    .insert({
      cliente_id: customerId,
      total: data.total,
      metodo_pago: data.paymentMethod
    })
    .select()
    .single();

  if (tError || !transaction) throw tError || new Error('Error al crear la transacción');

  // 3. Process Children and Sessions
  for (const childInfo of data.children) {
    // Get or Create Child
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
          age: childInfo.age,
          cliente_id: customerId
        })
        .select()
        .single();
      if (childCreateError || !newChild) throw childCreateError || new Error('Error al crear el niño');
      child = newChild;
    }

    const childId = (child as any).id;

    // Create Session
    const startTime = new Date();
    const endTime = new Date(startTime.getTime() + childInfo.duration * 60000);

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

  return { success: true };
};
