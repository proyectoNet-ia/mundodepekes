import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function check() {
    // 1. Iniciar sesión como gerente
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: 'gerente_roster@mundodepekes.com',
        password: 'Gerente$2026'
    });

    if (authError) {
        console.error("Error de autenticación:", authError.message);
        return;
    }
    console.log("Autenticado exitosamente como:", authData.user.email);

    // 2. Consultar transacciones fantasmas
    const today = new Date().toISOString().split('T')[0];
    const { data, error } = await supabase
        .from('transacciones')
        .select('id, created_at, es_privado, paquete_id, total, metodo_pago')
        .eq('es_privado', true)
        .is('event_start_time', null)
        .is('event_end_time', null)
        .gte('created_at', today);
        
    if (error) {
        console.error("Error al consultar transacciones:", error.message);
        return;
    }
    console.log("Transacciones fantasmas encontradas hoy:", data.length);
    console.log(JSON.stringify(data, null, 2));

    if (data.length > 0) {
        console.log("Actualizando transacciones...");
        const idsToUpdate = data.map(t => t.id);
        const { data: updateData, error: updateError } = await supabase
            .from('transacciones')
            .update({ es_privado: false })
            .in('id', idsToUpdate)
            .select('id, es_privado');
            
        if (updateError) {
            console.error("Error al actualizar transacciones:", updateError.message);
        } else {
            console.log("Actualización exitosa:", JSON.stringify(updateData, null, 2));
        }
    } else {
        console.log("No hay transacciones por actualizar.");
    }
}

check();
