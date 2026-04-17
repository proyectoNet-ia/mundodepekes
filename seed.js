import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseAnonKey);

const FIRST_NAMES = ['Santi', 'Mateo', 'Valentina', 'Sofia', 'Sebastian', 'Lucas', 'Camila', 'Diego', 'Lucia', 'Iker', 'Emma', 'Liam', 'Enzo', 'Zoe', 'Axel', 'Mia', 'Gael', 'Sara', 'Leo', 'Thiago'];
const LAST_NAMES = ['Rivera', 'García', 'López', 'Martínez', 'Rodríguez', 'Sánchez', 'Pérez', 'Gómez', 'González', 'Hernández'];

function getRandomItem(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

async function seed() {
  console.log('--- Iniciando Stress-Test Seed (Sistema a Tope) ---');

  // 1. Configuración inicial
  await supabase.from('config_sistema').upsert({ clave: 'capacidades', valor: { mundo_pekes: 30, trampolin: 35 } });
  
  // 2. Paquetes (Asegurarnos de que existan)
  const { data: pkgs } = await supabase.from('paquetes').upsert([
    { nombre: 'Básico 1H', area: 'Mundo Pekes', duracion_minutos: 60, precio: 15.00, activo: true },
    { nombre: 'Pro 2H', area: 'Trampolin', duracion_minutos: 120, precio: 25.00, activo: true },
    { nombre: 'Duo Mixto', area: 'Mixto', duracion_minutos: 90, precio: 35.00, activo: true }
  ]).select();

  console.log('Estructura de paquetes lista.');

  // Limpiar sesiones anteriores para el test si se desea (opcional)
  // await supabase.from('sesiones').delete().eq('estado', 'activo');

  const AREAS = ['Mundo Pekes', 'Trampolin', 'Mixto'];
  const totalSessionsToCreate = 45; // Para ver el dashboard bien lleno

  console.log(`Creando ${totalSessionsToCreate} sesiones de prueba distribuidas...`);

  for (let i = 0; i < totalSessionsToCreate; i++) {
    const parentName = `${getRandomItem(FIRST_NAMES)} ${getRandomItem(LAST_NAMES)}`;
    const childName = `${getRandomItem(FIRST_NAMES)} ${parentName.split(' ')[1]}`;
    
    // Crear Cliente
    const { data: client } = await supabase.from('clientes').insert({
      nombre: parentName,
      telefono: `555-${Math.floor(1000 + Math.random() * 9000)}`,
      email: `${parentName.toLowerCase().replace(' ', '.')}@test.com`,
      visitas_acumuladas: Math.floor(Math.random() * 10)
    }).select().single();

    if (client) {
      // Crear Niño
      const { data: kid } = await supabase.from('ninos').insert({
        nombre: childName,
        edad: Math.floor(2 + Math.random() * 10),
        cliente_id: client.id
      }).select().single();

      if (kid) {
        // Crear Transacción
        const { data: trans } = await supabase.from('transacciones').insert({
          cliente_id: client.id,
          total: 15.00,
          metodo_pago: getRandomItem(['Efectivo', 'Tarjeta'])
        }).select().single();

        if (trans) {
          // Determinar tiempo para variar estados (Crítico, Expirado, Normal)
          const now = new Date();
          let startTime, endTime;
          const pkg = getRandomItem(pkgs);
          const duration = pkg.duracion_minutos;

          const rand = Math.random();
          if (rand < 0.2) {
            // Expirado (hace más de la duración)
            startTime = new Date(now.getTime() - (duration + 10) * 60000);
            endTime = new Date(startTime.getTime() + duration * 60000);
          } else if (rand < 0.4) {
            // Crítico (le quedan menos de 10 min)
            startTime = new Date(now.getTime() - (duration - 5) * 60000);
            endTime = new Date(startTime.getTime() + duration * 60000);
          } else {
            // Normal (recién iniciado o a la mitad)
            startTime = new Date(now.getTime() - Math.floor(Math.random() * 30) * 60000);
            endTime = new Date(startTime.getTime() + duration * 60000);
          }

          await supabase.from('sesiones').insert({
            transaccion_id: trans.id,
            nino_id: kid.id,
            paquete_id: pkg.id,
            hora_inicio: startTime.toISOString(),
            hora_fin: endTime.toISOString(),
            area_actual: pkg.area,
            estado: 'activo'
          });
        }
      }
    }
    
    if (i % 10 === 0 && i > 0) console.log(`${i} registros creados...`);
  }

  console.log('--- Stress-Test Seed Finalizado ---');
  console.log('Dashboard listo para revisión con estados variados.');
}

seed().catch(console.error);
