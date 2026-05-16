
import { createClient } from '@supabase/supabase-client';
import * as dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase credentials');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function testSearch() {
    const term = 'e0af6bd1';
    console.log(`Searching for term: ${term}`);
    
    try {
        const { data, error } = await supabase
            .from('ninos')
            .select('id, nombre')
            .or(`nombre.ilike.%${term}%,id.ilike.%${term}%`);
        
        if (error) {
            console.error('Error with id.ilike:', error.message);
        } else {
            console.log('Success with id.ilike:', data);
        }
    } catch (e) {
        console.error('Catch error:', e);
    }
}

testSearch();
