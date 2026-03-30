import { supabase } from './supabase';

export type UserRole = 'admin' | 'analista' | 'supervisor' | 'cajero';

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
        await supabase.auth.signOut();
    },

    onAuthStateChange(callback: (user: UserProfile | null) => void) {
        return supabase.auth.onAuthStateChange(async (event, session) => {
            console.log(`AUTH_EVENT: ${event}`);
            if (session?.user) {
                try {
                    const profile = await this.getCurrentUser();
                    callback(profile);
                } catch (e) {
                    console.warn('Auth fallback triggered after profile failure');
                    callback({ id: session.user.id, email: session.user.email || '', role: 'cajero' });
                }
            } else if (event === 'INITIAL_SESSION' || event === 'SIGNED_OUT') {
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

                return {
                    id: user.id,
                    email: user.email || '',
                    role: (profile?.rol_slug as UserRole) || 'cajero',
                    nombre_completo: profile?.nombre_completo || user.email?.split('@')[0] || 'Cajero'
                };
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
                return {
                    id: session.user.id,
                    email: session.user.email || 'admin@mundodepekes.com',
                    role: 'admin', // Acceso de emergencia
                    nombre_completo: 'Administrador (Emergencia)'
                };
            }
            return null;
        } catch (e) {
            console.warn('Fallo brutal de Storage Local. Abortando emergencia.');
            return null;
        }
    },

    async validateManagerPin(pin: string): Promise<UserProfile | null> {
        const { data: profile, error } = await supabase
            .from('perfiles')
            .select('*')
            .eq('pin_seguridad', pin)
            .in('rol_slug', ['admin', 'supervisor'])
            .single();

        if (error || !profile) return null;

        return {
            id: profile.id,
            email: profile.email,
            role: profile.rol_slug as UserRole,
            nombre_completo: profile.nombre_completo || profile.email.split('@')[0]
        };
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
