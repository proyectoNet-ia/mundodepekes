import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function listUsers() {
  const { data, error } = await supabase.from('perfiles').select('*');
  if (error) {
    console.error('Error listing perfiles:', error.message);
    return;
  }
  console.log('--- PERFILES EN LA BASE DE DATOS ---');
  console.table(data);
}

listUsers();
