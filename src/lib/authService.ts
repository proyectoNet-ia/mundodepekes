import { supabase } from './supabase';

export type UserRole = 'admin' | 'analista' | 'supervisor' | 'cajero' | 'gerente';

export interface UserProfile {
    id: string;
    email: string;
    role: UserRole;
    nombre_completo?: string;
    pin?: string;
}

export const authService = {
    async signIn(email: string, pass: string) {
        const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password: pass
        });
        if (error) throw error;
        return data;
    },

    async signOut() {
        localStorage.removeItem('cached_user_profile');
        await supabase.auth.signOut();
    },

    onAuthStateChange(callback: (user: UserProfile | null) => void) {
        return supabase.auth.onAuthStateChange(async (event, session) => {
            console.log(`AUTH_EVENT: ${event}`);
            if (session?.user) {
                try {
                    const profile = await this.getCurrentUser();
                    if (profile) {
                        callback(profile);
                    } else {
                        const cached = localStorage.getItem('cached_user_profile');
                        if (cached) {
                            callback(JSON.parse(cached));
                        } else {
                            console.warn('Fallback activado: perfil devolvió null.');
                            callback({ id: session.user.id, email: session.user.email || 'admin@mundodepekes.com', role: 'cajero', nombre_completo: 'Usuario (Fallback)' });
                        }
                    }
                } catch (e) {
                    const cached = localStorage.getItem('cached_user_profile');
                    if (cached) {
                        callback(JSON.parse(cached));
                    } else {
                        console.warn('Auth fallback triggered after profile failure');
                        callback({ id: session.user.id, email: session.user.email || 'admin@mundodepekes.com', role: 'cajero', nombre_completo: 'Usuario (Fallback)' });
                    }
                }
            } else if (event === 'INITIAL_SESSION' || event === 'SIGNED_OUT') {
                localStorage.removeItem('cached_user_profile');
                callback(null);
            }
        });
    },

    async getCurrentUser(): Promise<UserProfile | null> {
        if (!navigator.onLine) {
            console.info('Modo offline en navegador. Recurriendo a sesión local...');
            return this.getLocalEmergencySession();
        }

        let timeoutId: ReturnType<typeof setTimeout>;
        const timeout = new Promise<never>((_, reject) => {
            timeoutId = setTimeout(() => reject(new Error('TIMEOUT_SUPABASE')), 4000); // Reducido a 4s para evitar congelamiento
        });

        try {
            const authPromise = (async () => {
                const { data: { user }, error } = await supabase.auth.getUser();
                if (error || !user) return null;

                // Maestro Hardcoded: Si es el dueño, asume rol total sin importar la base de datos
                if (user.email === 'admin@mundodepekes.com') {
                    return {
                        id: user.id,
                        email: user.email,
                        role: 'admin' as UserRole
                    };
                }

                const { data: profile, error: dbError } = await supabase
                    .from('perfiles')
                    .select('rol_slug, nombre_completo')
                    .eq('id', user.id)
                    .single();

                if (dbError) {
                    console.error('Error obteniendo perfil desde BD (RLS O Vacío):', dbError);
                }

                const finalProfile = {
                    id: user.id,
                    email: user.email || '',
                    role: (profile?.rol_slug as UserRole) || 'cajero',
                    nombre_completo: profile?.nombre_completo || 'Usuario'
                };

                // Guardamos en caché para usarlo en caso de que la red falle después
                localStorage.setItem('cached_user_profile', JSON.stringify(finalProfile));
                return finalProfile;
            })();

            const result = await Promise.race([authPromise, timeout]);
            clearTimeout(timeoutId!);
            return result;

        } catch (error: any) {
            clearTimeout(timeoutId!);
            if (error?.message === 'TIMEOUT_SUPABASE') {
                console.warn('Conexión lenta detectada. Usando sesión local de emergencia.');
            } else {
                console.warn('Error en validación de usuario:', error?.message || error);
            }
            return this.getLocalEmergencySession();
        }
    },

    async getLocalEmergencySession(): Promise<UserProfile | null> {
        try {
            const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), 2000));
            const { data: { session } } = await Promise.race([
                supabase.auth.getSession(),
                timeout
            ]) as any;

            if (session?.user) {
                const cached = localStorage.getItem('cached_user_profile');
                if (cached) {
                    console.info('⚠️ MODO EMERGENCIA: Usando perfil en caché.');
                    return JSON.parse(cached) as UserProfile;
                }

                // Alerta Obligatoria: Registrar que se está abusando del modo offline
                console.warn('⚠️ MODO EMERGENCIA ACTIVADO. Operaciones críticas bloqueadas.');
                return {
                    id: session.user.id,
                    email: session.user.email || 'admin@mundodepekes.com',
                    role: 'cajero', // Forzar siempre el nivel de privilegio más bajo en offline
                    nombre_completo: 'Usuario (Offline Estricto)'
                };
            }
            return null;
        } catch (e) {
            console.warn('Fallo brutal de Storage Local. Abortando emergencia.');
            const cached = localStorage.getItem('cached_user_profile');
            if (cached) {
                console.info('⚠️ Recuperando perfil en caché como último recurso tras fallo de storage.');
                return JSON.parse(cached) as UserProfile;
            }
            return null;
        }
    },

    async validateManagerPin(pin: string): Promise<UserProfile | null> {
        // Validación SEGURA: Se ejecuta en el lado del servidor para evitar descarga masiva de PINs (Punto 3.1)
        const { data, error } = await supabase.rpc('validar_pin_supervisor', { pin_ingresado: pin });

        if (error || !data) {
            console.error('Error o PIN inválido:', error);
            return null;
        }

        return data as UserProfile;
    },

    async logSecurityEvent(event: {
        autorizadorId: string;
        solicitanteId: string;
        accion: string;
        motivo: string;
        folio?: string;
    }) {
        try {
            await supabase.from('bitacora_seguridad').insert([{
                autorizador_id: event.autorizadorId,
                solicitante_id: event.solicitanteId,
                accion: event.accion,
                motivo: event.motivo,
                folio_referencia: event.folio
            }]);
        } catch (e) {
            console.error('No se pudo registrar en bitácora, pero la acción fue autorizada.');
        }
    }
};
