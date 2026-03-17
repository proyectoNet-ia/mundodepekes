
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function seed() {
  console.log('--- Iniciando Seed de Datos ---');

  // 1. Configuración inicial
  await supabase.from('config_sistema').upsert({ clave: 'capacidades', valor: { mundo_pekes: 30, trampolin: 35 } });
  
  // 2. Paquetes
  const { data: pkgs } = await supabase.from('paquetes').upsert([
    { nombre: 'Básico 1H', area: 'Mundo Pekes', duracion_minutos: 60, precio: 15.00, activo: true },
    { nombre: 'Pro 2H', area: 'Trampolin', duracion_minutos: 120, precio: 25.00, activo: true },
    { nombre: 'Duo Mixto', area: 'Mixto', duracion_minutos: 90, precio: 35.00, activo: true }
  ]).select();

  console.log('Paquetes creados');

  // 3. Clientes (Tutor)
  const { data: client } = await supabase.from('clientes').insert({
    nombre: 'Carlos Rivera',
    telefono: '5550192',
    email: 'carlos@ejemplo.com',
    visitas_acumuladas: 2
  }).select().single();

  if (client) {
    console.log('Cliente creado:', client.nombre);

    // 4. Niños
    const { data: kid } = await supabase.from('ninos').insert({
      nombre: 'Santi Rivera',
      edad: 6,
      cliente_id: client.id
    }).select().single();

    if (kid && pkgs) {
      console.log('Niño creado:', kid.nombre);

      // 5. Transacción
      const { data: trans } = await supabase.from('transacciones').insert({
        cliente_id: client.id,
        total: 15.00,
        metodo_pago: 'Efectivo'
      }).select().single();

      if (trans) {
        // 6. Sesión Activa (Para el Dashboard)
        const startTime = new Date();
        const endTime = new Date(startTime.getTime() + 60 * 60000); // +1 hora

        await supabase.from('sesiones').insert({
          transaccion_id: trans.id,
          nino_id: kid.id,
          paquete_id: pkgs[0].id,
          hora_inicio: startTime.toISOString(),
          hora_fin: endTime.toISOString(),
          area_actual: 'Mundo Pekes',
          estado: 'activo'
        });
        console.log('Sesión activa creada para el Dashboard');
      }
    }
  }

  console.log('--- Seed Finalizado con Éxito ---');
}

seed();
