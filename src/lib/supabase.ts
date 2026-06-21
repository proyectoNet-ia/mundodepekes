import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Faltan las credenciales de Supabase en el archivo .env');
}

const isTrainingMode = () => localStorage.getItem('modo_entrenamiento') === 'true';

const rawSupabase = createClient(supabaseUrl, supabaseAnonKey);

// Emulador de base de datos en LocalStorage para el Modo Entrenamiento (Pruebas del Admin)
const proxySupabaseFrom = (table: string) => {
  if (!isTrainingMode()) {
    return rawSupabase.from(table);
  }

  const getMockRows = (): any[] => {
    const val = localStorage.getItem(`mock_db_${table}`);
    return val ? JSON.parse(val) : [];
  };

  const setMockRows = (rows: any[]) => {
    localStorage.setItem(`mock_db_${table}`, JSON.stringify(rows));
  };

  let queryAction: 'select' | 'insert' | 'update' | 'delete' | 'upsert' = 'select';
  let insertData: any = null;
  let updateData: any = null;
  const filters: { type: string; field: string; val: any }[] = [];
  let limitVal: number | null = null;
  let orderVal: { field: string; ascending: boolean } | null = null;

  const builder = {
    insert: (data: any) => {
      queryAction = 'insert';
      insertData = data;
      return builder;
    },
    update: (data: any) => {
      queryAction = 'update';
      updateData = data;
      return builder;
    },
    upsert: (data: any) => {
      queryAction = 'upsert';
      insertData = data;
      return builder;
    },
    delete: () => {
      queryAction = 'delete';
      return builder;
    },
    select: () => {
      return builder;
    },
    eq: (field: string, val: any) => {
      filters.push({ type: 'eq', field, val });
      return builder;
    },
    neq: (field: string, val: any) => {
      filters.push({ type: 'neq', field, val });
      return builder;
    },
    in: (field: string, val: any[]) => {
      filters.push({ type: 'in', field, val });
      return builder;
    },
    gte: (field: string, val: any) => {
      filters.push({ type: 'gte', field, val });
      return builder;
    },
    lte: (field: string, val: any) => {
      filters.push({ type: 'lte', field, val });
      return builder;
    },
    gt: (field: string, val: any) => {
      filters.push({ type: 'gt', field, val });
      return builder;
    },
    lt: (field: string, val: any) => {
      filters.push({ type: 'lt', field, val });
      return builder;
    },
    order: (field: string, options?: { ascending?: boolean }) => {
      orderVal = { field, ascending: options?.ascending !== false };
      return builder;
    },
    limit: (val: number) => {
      limitVal = val;
      return builder;
    },
    single: () => builder,
    maybeSingle: () => builder,
    
    then: async (onfulfilled: any) => {
      try {
        let resultData: any = [];
        
        if (queryAction === 'select') {
          const mockRows = getMockRows();
          if (mockRows.length === 0 && ['paquetes', 'inventario', 'config_sistema'].includes(table)) {
            // Si la tabla de configuración está vacía en local, leemos del Supabase real (modo lectura)
            const { data, error } = await rawSupabase.from(table).select('*');
            if (!error && data) {
              resultData = data;
            }
          } else {
            resultData = mockRows;
          }
          
          // Aplicar filtros simulados
          filters.forEach(f => {
            if (f.type === 'eq') {
              resultData = resultData.filter((r: any) => r[f.field] === f.val);
            } else if (f.type === 'neq') {
              resultData = resultData.filter((r: any) => r[f.field] !== f.val);
            } else if (f.type === 'in') {
              resultData = resultData.filter((r: any) => Array.isArray(f.val) && f.val.includes(r[f.field]));
            } else if (f.type === 'gte') {
              resultData = resultData.filter((r: any) => r[f.field] >= f.val);
            } else if (f.type === 'lte') {
              resultData = resultData.filter((r: any) => r[f.field] <= f.val);
            }
          });

          // Aplicar orden simulado
          if (orderVal) {
            const { field, ascending } = orderVal;
            resultData.sort((a: any, b: any) => {
              if (a[field] < b[field]) return ascending ? -1 : 1;
              if (a[field] > b[field]) return ascending ? 1 : -1;
              return 0;
            });
          }

          // Aplicar límite simulado
          if (limitVal !== null) {
            resultData = resultData.slice(0, limitVal);
          }
        }
        
        else if (queryAction === 'insert' || queryAction === 'upsert') {
          const mockRows = getMockRows();
          const itemsToInsert = Array.isArray(insertData) ? insertData : [insertData];
          
          const insertedItems = itemsToInsert.map(item => {
            const newItem = {
              id: item.id || `mock-uuid-${Math.random().toString(36).substr(2, 9)}`,
              created_at: new Date().toISOString(),
              ...item
            };
            
            if (queryAction === 'upsert') {
              const idx = mockRows.findIndex(r => r.id === newItem.id);
              if (idx !== -1) {
                mockRows[idx] = { ...mockRows[idx], ...newItem };
                return mockRows[idx];
              }
            }
            
            mockRows.push(newItem);
            return newItem;
          });
          
          setMockRows(mockRows);
          resultData = Array.isArray(insertData) ? insertedItems : insertedItems[0];
        }
        
        else if (queryAction === 'update') {
          let mockRows = getMockRows();
          
          mockRows = mockRows.map(r => {
            let matches = true;
            filters.forEach(f => {
              if (f.type === 'eq' && r[f.field] !== f.val) matches = false;
              if (f.type === 'neq' && r[f.field] === f.val) matches = false;
            });
            
            if (matches) {
              return { ...r, ...updateData };
            }
            return r;
          });
          
          setMockRows(mockRows);
          resultData = updateData;
        }
        
        else if (queryAction === 'delete') {
          let mockRows = getMockRows();
          const remaining: any[] = [];
          const deleted: any[] = [];
          
          mockRows.forEach(r => {
            let matches = true;
            filters.forEach(f => {
              if (f.type === 'eq' && r[f.field] !== f.val) matches = false;
              if (f.type === 'neq' && r[f.field] === f.val) matches = false;
            });
            
            if (matches) {
              deleted.push(r);
            } else {
              remaining.push(r);
            }
          });
          
          setMockRows(remaining);
          resultData = deleted;
        }

        const mockResponse = {
          data: resultData,
          error: null,
          count: null,
          status: 200,
          statusText: "OK"
        };
        
        return onfulfilled(mockResponse);
      } catch (err: any) {
        console.error("Error in mock database:", err);
        return onfulfilled({ data: null, error: err });
      }
    },
    
    catch: (_onrejected?: any) => {
      return Promise.resolve();
    }
  };

  return builder;
};

// Crear proxy del cliente supabase para interceptar el método .from
export const supabase = new Proxy(rawSupabase, {
  get(target, prop, receiver) {
    if (prop === 'from') {
      return proxySupabaseFrom;
    }
    return Reflect.get(target, prop, receiver);
  }
});

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
