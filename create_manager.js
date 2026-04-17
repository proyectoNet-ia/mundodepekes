import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Error: Faltan variables de entorno en .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function createManager() {
  const username = 'gerente2026';
  const email = `gerente2026@mundodepekes.com`;
  const password = 'Password123!';
  const role = 'gerente';
  const pin = '1234';

  console.log(`Intentando crear usuario: ${email}...`);

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
  });

  if (error) {
    console.error('Error al crear usuario en Auth:', error.message);
    return;
  }

  if (data.user) {
    console.log('Usuario creado en Auth con ID:', data.user.id);
    console.log('Esperando a que el trigger cree el perfil...');
    
    // Esperamos para que el trigger de BD haga su trabajo si existe
    await new Promise(resolve => setTimeout(resolve, 3000));

    const { error: updateError } = await supabase
      .from('perfiles')
      .update({ 
        rol_slug: role, 
        pin_seguridad: pin 
      })
      .eq('id', data.user.id);

    if (updateError) {
      console.error('Error al actualizar el rol en la tabla perfiles:', updateError.message);
      console.log('Reintentando con un INSERT por si el trigger no existe...');
      
      const { error: insertError } = await supabase
        .from('perfiles')
        .insert({ 
          id: data.user.id,
          email: email,
          rol_slug: role, 
          pin_seguridad: pin 
        });
        
      if (insertError) {
        console.error('Error crítico al insertar perfil:', insertError.message);
      } else {
        console.log('Perfil insertado manualmente con éxito.');
      }
    } else {
      console.log('Rol y PIN asignados con éxito al perfil existente.');
    }
    
    console.log('\n--- CREDENCIALES CREADAS ---');
    console.log('Email:', email);
    console.log('Password:', password);
    console.log('PIN:', pin);
    console.log('Rol:', role);
    console.log('----------------------------');
  }
}

createManager();
