import React, { useState, useEffect } from 'react';
import styles from './Backoffice.module.css';
import { getSystemSettings, updateSystemSettings, type SystemSettings } from '../../lib/settingsService';
import { getPackages, type Package } from '../../lib/packageService';
import { supabase } from '../../lib/supabase';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faEdit, faTimes, faKey, faUsers, faUser, faLock, faUserShield } from '@fortawesome/free-solid-svg-icons';
import { useToast } from '../../components/Toast';
import { ConfirmDialog } from '../../components/ConfirmDialog';

type ConfigSection = 'CATALOGS' | 'STAFF' | 'SAFETY' | 'BRANDING' | 'OPERATIONS'| 'LOYALTY' | 'MAINTENANCE';

export const Backoffice: React.FC = () => {
  const { showToast } = useToast();
  const [activeSection, setActiveSection] = useState<ConfigSection>('CATALOGS');
  const [settings, setSettings] = useState<SystemSettings>({ 
    mundo_pekes: 30, trampolin: 35, horarios: {}, fidelizacion_activa: true, fidelizacion_visitas: 10, fidelizacion_minutos: 60, nombre_negocio: 'Mundo de Pekes', texto_ticket: '', edad_minima: 1, edad_maxima: 12
  });
  const [packages, setPackages] = useState<Package[]>([]);
  const [staff, setStaff] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [editingStaff, setEditingStaff] = useState<any | null>(null);
  const [showCreateUser, setShowCreateUser] = useState(false);
  const [showPurgeConfirm, setShowPurgeConfirm] = useState(false);
  const [currentUserData, setCurrentUserData] = useState<any | null>(null);

  const loadData = async () => {
    setIsLoading(true);
    try {
        const user = await import('../../lib/authService').then(m => m.authService.getCurrentUser());
        setCurrentUserData(user);
        
        if (user?.role !== 'admin') {
            setIsLoading(false);
            return;
        }

        const [settingsData, packagesData, staffData] = await Promise.all([
          getSystemSettings(),
          getPackages(false),
          supabase.from('perfiles').select('*')
        ]);
        setSettings(settingsData);
        setPackages(packagesData);
        setStaff(staffData.data || []);
    } catch (e) {
        showToast('Error al cargar datos administrativos.', 'error', 'Error de Carga');
    } finally {
        setIsLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  const handleSaveSettings = async (message: string) => {
    setIsLoading(true);
    try {
      await updateSystemSettings(settings);
      showToast(message, 'success', 'Configuración Guardada');
    } catch (error) {
      showToast('No se pudieron guardar los cambios.', 'error', 'Error de Sistema');
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdateStaff = async (id: string, updates: any) => {
    setIsLoading(true);
    try {
        const { error } = await supabase.from('perfiles').update(updates).eq('id', id);
        if (error) throw error;
        await loadData();
        setEditingStaff(null);
        showToast('El perfil de usuario ha sido actualizado correctamente.', 'success', 'Staff Actualizado');
    } catch (error) {
        showToast('Error al intentar modificar el perfil del staff.', 'error', 'Fallo en Seguridad');
    } finally {
        setIsLoading(false);
    }
  };

  const handleCreateUser = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const username = formData.get('username') as string;
    const email = `${username.toLowerCase().trim()}@mundodepekes.com`;
    const password = formData.get('password') as string;
    const role = formData.get('role') as string;
    const pin = formData.get('pin') as string;

    if (!username || !password || password.length < 6) {
        showToast('El nombre de usuario y una contraseña (mínimo 6 caracteres) son obligatorios.', 'error');
        return;
    }

    setIsLoading(true);
    try {
        const { data, error } = await supabase.auth.signUp({
            email,
            password
        });
        if (error) {
            if (error.message.toLowerCase().includes('rate limit')) {
                throw new Error('Por protección Anti-Spam gratuita, Supabase solo permite crear 3 usuarios nuevos por hora. El administrador técnico puede desactivar este límite en el portal de Supabase (Settings > Auth > Rate Limits), o puedes esperar una hora.');
            }
            throw error;
        }
        if (data.user) {
            // Asumimos que la BD de Supabase tiene un trigger que crea el 'perfil' automáticamente al hacer signUp.
            // Para no chocar con ese trigger (lo que lanza el error 500), esperamos un poco y hacemos un UPDATE puro.
            await new Promise(resolve => setTimeout(resolve, 1500));
            
            const { error: updateError } = await supabase
                .from('perfiles')
                .update({ 
                    rol_slug: role, 
                    pin_seguridad: pin 
                })
                .eq('id', data.user.id);
            
            if (updateError) {
                console.warn('No se pudo aplicar el rol automáticamente (posible restricción de seguridad). Lo puedes hacer editándolo en la tabla.', updateError);
            }
        }
        
        showToast('Credenciales creadas. Validando...', 'success');
        setShowCreateUser(false);
        setTimeout(async () => {
            await supabase.auth.signOut();
            window.location.reload();
        }, 3000);
        
    } catch (error: any) {
        showToast(error.message || 'Error al intentar crear el usuario.', 'error', 'Fallo de Plataforma');
    } finally {
        setIsLoading(false);
    }
  };

  const renderStaffSection = () => (
    <section className={styles.configCard}>
        <div className={styles.sectionHeader} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
                <h3><FontAwesomeIcon icon={faUsers} /> Gestión de Personal y Seguridad</h3>
                <p>Administre roles y PINs de autorización para gerentes y cajeros.</p>
            </div>
            <button className="btn btn-primary" onClick={() => setShowCreateUser(true)}>
                + Crear Usuario
            </button>
        </div>

        <div className={styles.tableWrapper}>
            <table className={styles.table}>
                <thead>
                    <tr><th>Usuario</th><th>Rol</th><th>PIN</th><th>Acciones</th></tr>
                </thead>
                <tbody>
                    {staff.map(member => (
                        <tr key={member.id}>
                            <td><strong>{member.email}</strong></td>
                            <td><span className={`${styles.roleBadge} ${styles[member.rol_slug]}`}>{member.rol_slug.toUpperCase()}</span></td>
                            <td>{member.pin_seguridad ? <span className={styles.pinActive}><FontAwesomeIcon icon={faKey} /> SI</span> : <span className={styles.pinMissing}>NO</span>}</td>
                            <td className={styles.actionsCell}><button className={styles.miniBtn} onClick={() => setEditingStaff(member)}><FontAwesomeIcon icon={faEdit} /> Editar</button></td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>

        {editingStaff && (
            <div className={styles.modalOverlay}>
                <div className={styles.modal}>
                    <div className={styles.modalHeader}>
                        <h3><FontAwesomeIcon icon={faUserShield} style={{ marginRight: '0.5rem', opacity: 0.8 }} /> Editar Perfil</h3>
                        <button onClick={() => setEditingStaff(null)} className={styles.closeBtn}><FontAwesomeIcon icon={faTimes} /></button>
                    </div>
                    <form onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); handleUpdateStaff(editingStaff.id, { rol_slug: f.get('rol'), pin_seguridad: f.get('pin') || editingStaff.pin_seguridad }); }} className={styles.modalForm}>
                        <div className={styles.formGroup}>
                            <label><FontAwesomeIcon icon={faUserShield} /> Rol</label>
                            <select name="rol" className={styles.input} defaultValue={editingStaff.rol_slug}>
                                <option value="cajero">Cajero</option>
                                <option value="gerente">Gerente</option>
                                <option value="analista">Analista</option>
                                <option value="admin">Administrador</option>
                            </select>
                        </div>
                        <div className={styles.formGroup}>
                            <label><FontAwesomeIcon icon={faKey} /> Nuevo PIN</label>
                            <input name="pin" type="password" className={styles.input} maxLength={6} />
                        </div>
                        <div className={styles.modalFooter}>
                            <button type="button" onClick={() => setEditingStaff(null)} className="btn btn-ghost">Cancelar</button>
                            <button type="submit" className="btn btn-primary" disabled={isLoading}>{isLoading ? 'Guardando...' : 'Guardar'}</button>
                        </div>
                    </form>
                </div>
            </div>
        )}

        {showCreateUser && (
            <div className={styles.modalOverlay}>
                <div className={styles.modal} style={{ maxWidth: '450px' }}>
                    <div className={styles.modalHeader}>
                        <h3><FontAwesomeIcon icon={faUser} style={{ marginRight: '0.5rem', opacity: 0.8 }} /> Nuevo Usuario</h3>
                        <button onClick={() => setShowCreateUser(false)} className={styles.closeBtn}><FontAwesomeIcon icon={faTimes} /></button>
                    </div>
                    
                    <div style={{ padding: '1rem', background: '#fffbeb', color: '#92400e', marginBottom: '1rem', borderRadius: '8px', fontSize: '0.85rem' }}>
                        <strong>⚠️ Aviso Importante:</strong> Al crear el usuario, por reglas de seguridad y encriptación, <strong>el sistema cerrará tu sesión actual automáticamente</strong> para validar las nuevas credenciales. Tendrás que volver a ingresar con tu correo.
                    </div>

                    <form onSubmit={handleCreateUser} className={styles.modalForm}>
                        <div className={styles.formGroup}>
                            <label><FontAwesomeIcon icon={faUser} style={{ opacity: 0.5, marginRight: '0.25rem' }} /> Nombre de Usuario</label>
                            <div style={{ display: 'flex', alignItems: 'center' }}>
                                <input name="username" type="text" required className={styles.input} style={{ flex: 1, borderTopRightRadius: 0, borderBottomRightRadius: 0 }} placeholder="ej. cajero_1" />
                                <span style={{ padding: '0.75rem', background: '#f8fafc', color: '#64748b', border: '1px solid var(--border-color)', borderLeft: 'none', borderTopRightRadius: 'var(--radius-md)', borderBottomRightRadius: 'var(--radius-md)', fontWeight: 600 }}>@mundodepekes.com</span>
                            </div>
                        </div>
                        <div className={styles.formGroup}>
                            <label><FontAwesomeIcon icon={faLock} style={{ opacity: 0.5, marginRight: '0.25rem' }} /> Contraseña de Acceso (Min 6 caracteres)</label>
                            <input name="password" type="password" required className={styles.input} minLength={6} placeholder="********" />
                        </div>
                        <div className={styles.formGroup}>
                            <label><FontAwesomeIcon icon={faUserShield} style={{ opacity: 0.5, marginRight: '0.25rem' }} /> Rol Inicial</label>
                            <select name="role" className={styles.input} defaultValue="cajero">
                                <option value="cajero">Cajero (Operación Básica)</option>
                                <option value="gerente">Gerente (Autorizaciones)</option>
                                <option value="analista">Analista (Auditoría/Reportes)</option>
                                <option value="admin">Administrador (Total)</option>
                            </select>
                        </div>
                        <div className={styles.formGroup}>
                            <label><FontAwesomeIcon icon={faKey} style={{ opacity: 0.5, marginRight: '0.25rem' }} /> PIN Operativo (Hasta 6 números)</label>
                            <input name="pin" type="password" className={styles.input} maxLength={6} placeholder="Opcional pero recomendado" />
                        </div>
                        <div className={styles.modalFooter}>
                            <button type="button" onClick={() => setShowCreateUser(false)} className="btn btn-ghost">Cancelar</button>
                            <button type="submit" className="btn btn-primary" disabled={isLoading}>
                                {isLoading ? 'Creando y Cerrando Sesión...' : 'Crear Usuario'}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        )}
    </section>
  );


  if (currentUserData && currentUserData.role !== 'admin') {
      return (
          <div className={styles.container} style={{ alignItems: 'center', justifyContent: 'center', height: '100%', minHeight: '600px' }}>
              <div className={styles.emptyState} style={{ maxWidth: '500px' }}>
                  <h3 style={{ color: 'var(--danger)', marginBottom: '1rem' }}><FontAwesomeIcon icon={faUserShield} size="2x" /> <br/><br/>Acceso Denegado</h3>
                  <p>Por seguridad operativa, el módulo de Configuración General y Gestión de Personal está estrictamente reservado para el <strong>Administrador Principal</strong> del parque.</p>
              </div>
          </div>
      );
  }

  return (
    <div className={styles.container}>
      <header className={styles.header}><h2>Panel de Configuración</h2><p>Gestión administrativa y personalización del sistema</p></header>
      <div className={styles.layout}>
        <aside className={styles.sidebar}>
          <button className={`${styles.navButton} ${activeSection === 'CATALOGS' ? styles.active : ''}`} onClick={() => setActiveSection('CATALOGS')}>📂 Paquetes</button>
          <button className={`${styles.navButton} ${activeSection === 'STAFF' ? styles.active : ''}`} onClick={() => setActiveSection('STAFF')}>👥 Personal</button>
          <button className={`${styles.navButton} ${activeSection === 'SAFETY' ? styles.active : ''}`} onClick={() => setActiveSection('SAFETY')}>🛡️ Seguridad</button>
          <button className={`${styles.navButton} ${activeSection === 'BRANDING' ? styles.active : ''}`} onClick={() => setActiveSection('BRANDING')}>🏷️ Marca</button>
          <button className={`${styles.navButton} ${activeSection === 'OPERATIONS' ? styles.active : ''}`} onClick={() => setActiveSection('OPERATIONS')}>⏰ Horarios</button>
          <button className={`${styles.navButton} ${activeSection === 'LOYALTY' ? styles.active : ''}`} onClick={() => setActiveSection('LOYALTY')}>🔥 Fidelidad</button>
          <button className={`${styles.navButton} ${activeSection === 'MAINTENANCE' ? styles.active : ''}`} onClick={() => setActiveSection('MAINTENANCE')}>⚙️ Mantenimiento</button>
        </aside>
        <main className={styles.content}>
          {activeSection === 'CATALOGS' && (
            <section className={styles.configCard}><h3>Catálogo de Paquetes</h3><table className={styles.table}><thead><tr><th>Paquete</th><th>Área</th><th>Minutos</th><th>Precio</th></tr></thead><tbody>{packages.map(p => (<tr key={p.id}><td><strong>{p.nombre}</strong></td><td>{p.area}</td><td>{p.duracion_minutos}</td><td>${p.precio}.00</td></tr>))}</tbody></table></section>
          )}
          {activeSection === 'STAFF' && renderStaffSection()}
          {activeSection === 'SAFETY' && (
            <section className={styles.configCard}><h3>Seguridad y Edades</h3><div className={styles.safetyGrid} style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem' }}><div className={styles.formGroup}><label>Edad Mínima</label><input type="number" className={styles.input} value={settings.edad_minima} onChange={(e) => setSettings({...settings, edad_minima: parseInt(e.target.value)})}/></div><div className={styles.formGroup}><label>Edad Máxima</label><input type="number" className={styles.input} value={settings.edad_maxima} onChange={(e) => setSettings({...settings, edad_maxima: parseInt(e.target.value)})}/></div></div><button className="btn btn-primary" onClick={() => handleSaveSettings('Rango de edades actualizado.')} disabled={isLoading}>{isLoading ? 'Guardando...' : 'Guardar Edades'}</button></section>
          )}

          {activeSection === 'BRANDING' && (
            <section className={styles.configCard}>
              <h3>Marca y Personalización</h3>
              <div className={styles.formGroup} style={{ marginBottom: '1.5rem' }}>
                <label>Nombre del Negocio (Ticket y Tickets App)</label>
                <input type="text" className={styles.input} value={settings.nombre_negocio || ''} onChange={(e) => setSettings({...settings, nombre_negocio: e.target.value})} placeholder="Ej. Mundo de Pekes" />
              </div>
              <div className={styles.formGroup} style={{ marginBottom: '1.5rem' }}>
                <label>Mensaje de Pie de Página en Ticket</label>
                <textarea className={styles.input} rows={3} value={settings.texto_ticket || ''} onChange={(e) => setSettings({...settings, texto_ticket: e.target.value})} placeholder="Mensaje de despedida u ofertas..." />
              </div>
              <button className="btn btn-primary" onClick={() => handleSaveSettings('Datos de marca actualizados.')} disabled={isLoading}>{isLoading ? 'Guardando...' : 'Actualizar Marca'}</button>
            </section>
          )}

          {activeSection === 'OPERATIONS' && (
            <section className={styles.configCard}>
              <h3>Horarios de Cierre Automático (Notificaciones)</h3>
              <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>Define a qué hora cierra el parque cada día para alertar al momento de vender tiempos.</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
                {['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'].map(dia => (
                   <div key={dia} className={styles.formGroup}>
                     <label style={{ textTransform: 'capitalize' }}>{dia}</label>
                     <input type="time" className={styles.input} value={settings.horarios?.[dia] || '20:00'} onChange={(e) => setSettings({...settings, horarios: { ...settings.horarios, [dia]: e.target.value }})} />
                   </div>
                ))}
              </div>
              <button className="btn btn-primary" onClick={() => handleSaveSettings('Horarios actualizados.')} disabled={isLoading}>{isLoading ? 'Guardando...' : 'Guardar Horarios'}</button>
            </section>
          )}

          {activeSection === 'LOYALTY' && (
            <section className={styles.configCard}>
              <h3>Programa de Fidelidad</h3>
              <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>Premios para clientes recurrentes que acumulan visitas en el sistema.</p>
              <div className={styles.formGroup} style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                  <input type="checkbox" checked={settings.fidelizacion_activa} onChange={(e) => setSettings({...settings, fidelizacion_activa: e.target.checked})} style={{ width: '20px', height: '20px' }} />
                  Activar Programa de Fidelidad Automático
                </label>
              </div>
              {settings.fidelizacion_activa && (
                <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem' }}>
                   <div className={styles.formGroup}>
                     <label>Visitas Meta (Ej. Cada 10)</label>
                     <input type="number" className={styles.input} value={settings.fidelizacion_visitas} onChange={(e) => setSettings({...settings, fidelizacion_visitas: parseInt(e.target.value)})} />
                   </div>
                   <div className={styles.formGroup}>
                     <label>Premio (Minutos Gratis)</label>
                     <input type="number" className={styles.input} value={settings.fidelizacion_minutos} onChange={(e) => setSettings({...settings, fidelizacion_minutos: parseInt(e.target.value)})} />
                   </div>
                </div>
              )}
              <button className="btn btn-primary" onClick={() => handleSaveSettings('Configuración de fidelidad actualizada.')} disabled={isLoading}>{isLoading ? 'Guardando...' : 'Guardar Fidelidad'}</button>
            </section>
          )}

          {activeSection === 'MAINTENANCE' && (
            <section className={styles.configCard}>
              <h3>Herramientas de Mantenimiento</h3>
              <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>Utilice estas herramientas para limpiar el sistema de datos de prueba.</p>
              
              <div style={{ display: 'grid', gap: '1rem' }}>
                <div style={{ padding: '1rem', border: '1px solid #fee2e2', borderRadius: '8px', background: '#fef2f2' }}>
                  <h4 style={{ color: '#991b1b', marginBottom: '0.5rem' }}>⚠️ Purga de Datos de Operación</h4>
                  <p style={{ fontSize: '0.85rem', color: '#7f1d1d', marginBottom: '1rem' }}>
                    Esta acción eliminará todas las sesiones activas/finalizadas, transacciones de venta, registros de niños y clientes. 
                    <strong> ¡Esta acción es irreversible!</strong>
                  </p>
                  <button 
                    className="btn btn-primary" 
                    style={{ background: '#ef4444' }}
                    onClick={() => setShowPurgeConfirm(true)}
                    disabled={isLoading}
                  >
                    {isLoading ? 'Procesando...' : 'PURGAR TODA LA BASE DE DATOS'}
                  </button>

                  <ConfirmDialog
                    isOpen={showPurgeConfirm}
                    title="⚠️ ACCIÓN CRÍTICA"
                    message="¿Está ABSOLUTAMENTE seguro de borrar TODOS los datos de sesiones, ventas, niños y clientes? Esta acción no se puede deshacer."
                    confirmText="SÍ, PURGAR TODO"
                    cancelText="Cancelar"
                    onCancel={() => setShowPurgeConfirm(false)}
                    onConfirm={async () => {
                      setShowPurgeConfirm(false);
                      setIsLoading(true);
                      try {
                        await supabase.from('sesiones').delete().neq('id', '00000000-0000-0000-0000-000000000000');
                        await supabase.from('transacciones').delete().neq('id', '00000000-0000-0000-0000-000000000000');
                        await supabase.from('ninos').delete().neq('id', '00000000-0000-0000-0000-000000000000');
                        await supabase.from('clientes').delete().neq('id', '00000000-0000-0000-0000-000000000000');
                        
                        showToast('Base de datos limpiada correctamente.', 'success', 'Limpieza Exitosa');
                        window.location.reload();
                      } catch (err) {
                        showToast('Error al intentar limpiar las tablas.', 'error');
                      } finally {
                        setIsLoading(false);
                      }
                    }}
                  />
                </div>
              </div>
            </section>
          )}
        </main>
      </div>
    </div>
  );
};
