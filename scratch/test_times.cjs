const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '../.env' });

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://tioncoqxgeqtbnzbjgyc.supabase.co';
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRpb25jb3F4Z2VxdGJuemJqZ3ljIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM3MDYyMTQsImV4cCI6MjA4OTI4MjIxNH0.G-8J_K2O5u4iqAWpR6gn_4YaVHNa5eZqxzwOQyQagnE';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function test() {
  const { data: profiles, error } = await supabase
    .from('perfiles')
    .select('*');

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log('Profiles:');
  console.log(profiles.map(p => ({ email: p.email, rol_slug: p.rol_slug, pin: p.pin_seguridad })));
}

test();
