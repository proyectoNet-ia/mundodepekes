const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '../.env' });

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://tioncoqxgeqtbnzbjgyc.supabase.co';
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRpb25jb3F4Z2VxdGJuemJqZ3ljIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM3MDYyMTQsImV4cCI6MjA4OTI4MjIxNH0.G-8J_K2O5u4iqAWpR6gn_4YaVHNa5eZqxzwOQyQagnE';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function test() {
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: 'admin@mundodepekes.com',
    password: 'Pekes2026*'
  });

  if (authError) {
    console.error('Auth error:', authError);
    return;
  }

  console.log('Auth success for:', authData.user.email);

  const { data: events, error } = await supabase
    .from('eventos_cumpleanos')
    .select('*')
    .in('estado', ['agendado', 'en_curso']);

  if (error) {
    console.error('Fetch error:', error);
    return;
  }

  console.log('Active/Scheduled Events:', events);

  if (events.length > 0) {
    const target = events[0];
    console.log(`Trying to update event id: ${target.id}`);
    const { data: updated, error: updateError } = await supabase
      .from('eventos_cumpleanos')
      .update({ estado: target.estado }) // benign update
      .eq('id', target.id)
      .select();

    if (updateError) {
      console.error('Update error:', updateError);
    } else {
      console.log('Update success:', updated);
    }
  }
}

test();
