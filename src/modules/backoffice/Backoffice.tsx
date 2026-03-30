import React, { useState, useEffect } from 'react';
import styles from './Backoffice.module.css';
import { getSystemSettings, updateSystemSettings, type SystemSettings } from '../../lib/settingsService';
import { getPackages, createPackage, updatePackage, togglePackageStatus, type Package } from '../../lib/packageService';
import { stockService, type StockItem } from '../../lib/stockService';
import { supabase } from '../../lib/supabase';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faEdit, faTimes, faKey, faUsers, faUser, faLock, faUserShield, faPlus, faTrash, faBoxOpen, faLayerGroup, faClock, faTag, faBoxes, faExclamationTriangle, faMoneyBillWave, faArchive, faEye } from '@fortawesome/free-solid-svg-icons';
import { useToast } from '../../components/Toast';
import { ConfirmDialog } from '../../components/ConfirmDialog';

type ConfigSection = 'CATALOGS' | 'INVENTORY' | 'STAFF' | 'SAFETY' | 'BRANDING' | 'OPERATIONS'| 'LOYALTY' | 'MAINTENANCE';

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
  const [editingPackage, setEditingPackage] = useState<Package | null>(null);
  const [deletingPackage, setDeletingPackage] = useState<Package | null>(null);
  const [showInactive, setShowInactive] = useState(false);
  const [showCreateUser, setShowCreateUser] = useState(false);
  const [newUserRole, setNewUserRole] = useState('admin');
  const [editingStaffRole, setEditingStaffRole] = useState('');
  const [showCreatePackage, setShowCreatePackage] = useState(false);
  const [showCreateItem, setShowCreateItem] = useState(false);
  const [editingItem, setEditingItem] = useState<StockItem | null>(null);
  const [deletingItem, setDeletingItem] = useState<StockItem | null>(null);
  const [archivingItem, setArchivingItem] = useState<StockItem | null>(null);
  const [inventory, setInventory] = useState<StockItem[]>([]);
  const [showInactiveStock, setShowInactiveStock] = useState(false);
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

        const [settingsData, packagesData, inventoryData, staffData] = await Promise.all([
          getSystemSettings(),
          getPackages(false),
          stockService.getInventory(),
          supabase.from('perfiles').select('*')
        ]);
        setSettings(settingsData);
        setPackages(packagesData);
        setInventory(inventoryData);
        setStaff(staffData.data || []);
    } catch (e) {
        showToast('Error al cargar datos administrativos.', 'error', 'Error de Carga');
    } finally {
        setIsLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  const handleSaveSettings = async (message: string, settingsOverride?: SystemSettings) => {
    setIsLoading(true);
    try {
      await updateSystemSettings(settingsOverride || settings);
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
                            <td className={styles.actionsCell}>
                                <button className={styles.iconBtn} onClick={() => { setEditingStaff(member); setEditingStaffRole(member.rol_slug); }} title="Editar">
                                    <FontAwesomeIcon icon={faEdit} />
                                </button>
                            </td>
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
                    <form onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); handleUpdateStaff(editingStaff.id, { rol_slug: f.get('rol'), pin_seguridad: f.get('pin') || editingStaff.pin_seguridad }); }} className={styles.modalForm} autoComplete="off">
                        <div className={styles.formGroup}>
                            <label><FontAwesomeIcon icon={faUserShield} /> Rol</label>
                            <select name="rol" className={styles.input} defaultValue={editingStaff.rol_slug} onChange={(e) => setEditingStaffRole(e.target.value)}>
                                <option value="admin">Administrador</option>
                                <option value="analista">Analista</option>
                                <option value="supervisor">Supervisor</option>
                                <option value="cajero">Cajero</option>
                            </select>
                        </div>
                        {!['cajero', 'analista'].includes(editingStaffRole) && (
                            <div className={styles.formGroup}>
                                <label><FontAwesomeIcon icon={faKey} /> Nuevo PIN (4 dígitos)</label>
                                <input name="pin" type="password" className={styles.input} maxLength={4} placeholder="PIN Obligatorio" autoComplete="new-password" />
                            </div>
                        )}
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

                    <form onSubmit={handleCreateUser} className={styles.modalForm} autoComplete="off">
                        <div className={styles.formGroup}>
                            <label><FontAwesomeIcon icon={faUser} style={{ opacity: 0.5, marginRight: '0.25rem' }} /> Nombre de Usuario</label>
                            <div style={{ display: 'flex', alignItems: 'center' }}>
                                <input name="username" type="text" required className={styles.input} style={{ flex: 1, borderTopRightRadius: 0, borderBottomRightRadius: 0 }} placeholder="ej. cajero_1" />
                                <span style={{ padding: '0.75rem', background: '#f8fafc', color: '#64748b', border: '1px solid var(--border-color)', borderLeft: 'none', borderTopRightRadius: 'var(--radius-md)', borderBottomRightRadius: 'var(--radius-md)', fontWeight: 600 }}>@mundodepekes.com</span>
                            </div>
                        </div>
                        <div className={styles.formGroup}>
                            <label><FontAwesomeIcon icon={faLock} style={{ opacity: 0.5, marginRight: '0.25rem' }} /> Contraseña de Acceso (Min 6 caracteres)</label>
                            <input name="password" type="password" required className={styles.input} minLength={6} placeholder="********" autoComplete="new-password" />
                        </div>
                        <div className={styles.formGroup}>
                            <label><FontAwesomeIcon icon={faUserShield} style={{ opacity: 0.5, marginRight: '0.25rem' }} /> Rol Inicial</label>
                            <select name="role" className={styles.input} defaultValue="admin" onChange={(e) => setNewUserRole(e.target.value)}>
                                <option value="admin">Administrador (Total)</option>
                                <option value="analista">Analista (Auditoría/Reportes)</option>
                                <option value="supervisor">Supervisor (Autorizaciones)</option>
                                <option value="cajero">Cajero (Operación Básica)</option>
                            </select>
                        </div>
                        {!['cajero', 'analista'].includes(newUserRole) && (
                            <div className={styles.formGroup}>
                                <label><FontAwesomeIcon icon={faKey} style={{ opacity: 0.5, marginRight: '0.25rem' }} /> PIN Operativo (4 dígitos)</label>
                                <input name="pin" type="password" required className={styles.input} maxLength={4} placeholder="PIN Obligatorio" autoComplete="new-password" />
                            </div>
                        )}
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

  const renderInventorySection = () => (
    <section className={styles.configCard}>
        <div className={styles.sectionHeader} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
                <h3><FontAwesomeIcon icon={faBoxes} /> Catálogo de Inventarios</h3>
                <p>Gestione productos, precios y umbrales de alerta de stock.</p>
            </div>
            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                    <input type="checkbox" checked={showInactiveStock} onChange={(e) => setShowInactiveStock(e.target.checked)} />
                    Ver archivados
                </label>
                <button className="btn btn-primary" onClick={() => setShowCreateItem(true)}>
                    <FontAwesomeIcon icon={faPlus} /> Nuevo Producto
                </button>
            </div>
        </div>

                    <div style={{ marginBottom: '2rem', padding: '1.5rem', background: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                        <h4 style={{ marginBottom: '1rem', color: '#1e293b' }}><FontAwesomeIcon icon={faLayerGroup} /> Gestión de Categorías</h4>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1rem' }}>
                            {settings.categorias_inventario?.map(cat => (
                                <span key={cat} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', background: '#fff', padding: '4px 12px', borderRadius: '20px', border: '1px solid #cbd5e1', fontSize: '0.85rem', fontWeight: 500, color: '#475569' }}>
                                    {cat}
                                    <button 
                                        onClick={() => {
                                            const newCats = settings.categorias_inventario?.filter(c => c !== cat) || [];
                                            const newSettings = { ...settings, categorias_inventario: newCats };
                                            setSettings(newSettings);
                                            handleSaveSettings('Categoría eliminada.', newSettings);
                                        }}
                                        style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#94a3b8', padding: '0 2px' }}
                                    >
                                        <FontAwesomeIcon icon={faTimes} size="xs" />
                                    </button>
                                </span>
                            ))}
                        </div>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <input 
                                type="text" 
                                id="new-category-input"
                                className={styles.input} 
                                style={{ flex: 1 }} 
                                placeholder="Nueva categoría..." 
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                        const val = (e.target as HTMLInputElement).value.trim();
                                        if (val && !settings.categorias_inventario?.includes(val)) {
                                            const newCats = [...(settings.categorias_inventario || []), val];
                                            const newSettings = { ...settings, categorias_inventario: newCats };
                                            setSettings(newSettings);
                                            (e.target as HTMLInputElement).value = '';
                                            handleSaveSettings('Categoría añadida.', newSettings);
                                        }
                                    }
                                }}
                            />
                            <button 
                                className="btn btn-primary"
                                onClick={() => {
                                    const input = document.getElementById('new-category-input') as HTMLInputElement;
                                    const val = input.value.trim();
                                    if (val && !settings.categorias_inventario?.includes(val)) {
                                        const newCats = [...(settings.categorias_inventario || []), val];
                                        const newSettings = { ...settings, categorias_inventario: newCats };
                                        setSettings(newSettings);
                                        input.value = '';
                                        handleSaveSettings('Categoría añadida.', newSettings);
                                    }
                                }}
                            >
                                Añadir
                            </button>
                        </div>
                    </div>

                    <div className={styles.tableWrapper}>
            <table className={styles.table}>
                <thead>
                    <tr><th>Producto</th><th>Categoría</th><th>Alerta Mín.</th><th>Precio Venta</th><th>Acciones</th></tr>
                </thead>
                <tbody>
                    {inventory
                        .filter(item => showInactiveStock ? true : item.activo !== false)
                        .map(item => (
                        <tr key={item.id} style={{ opacity: item.activo === false ? 0.5 : 1 }}>
                            <td><strong>{item.nombre}</strong></td>
                            <td>{item.categoria}</td>
                            <td>
                                <span style={{ color: 'var(--danger)', fontWeight: 600 }}>
                                    <FontAwesomeIcon icon={faExclamationTriangle} size="sm" /> {item.minimo_alert}
                                </span>
                            </td>
                            <td>${item.precio_venta.toFixed(2)}</td>
                            <td className={styles.actionsCell}>
                                <button className={styles.iconBtn} onClick={() => setEditingItem(item)} title="Editar">
                                    <FontAwesomeIcon icon={faEdit} />
                                </button>
                                {item.activo !== false ? (
                                    <button className={styles.iconBtn} onClick={() => setArchivingItem(item)} title="Archivar">
                                        <FontAwesomeIcon icon={faArchive} />
                                    </button>
                                ) : (
                                    <button className={styles.iconBtn} onClick={async () => {
                                        await stockService.updateItem(item.id, { activo: true });
                                        showToast('Producto restaurado.', 'success');
                                        loadData();
                                    }} title="Restaurar">
                                        <FontAwesomeIcon icon={faEye} />
                                    </button>
                                )}
                                <button className={`${styles.iconBtn} ${styles.iconBtnDanger}`} onClick={() => setDeletingItem(item)} title="Eliminar Permanentemente">
                                    <FontAwesomeIcon icon={faTrash} />
                                </button>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>

        {(showCreateItem || editingItem) && (
            <div className={styles.modalOverlay}>
                <div className={styles.modal} style={{ maxWidth: '450px' }}>
                    <div className={styles.modalHeader}>
                        <h3>
                            <FontAwesomeIcon icon={editingItem ? faEdit : faPlus} style={{ marginRight: '0.5rem', opacity: 0.8 }} />
                            {editingItem ? 'Editar Producto' : 'Nuevo Producto'}
                        </h3>
                        <button onClick={() => { setShowCreateItem(false); setEditingItem(null); }} className={styles.closeBtn}><FontAwesomeIcon icon={faTimes} /></button>
                    </div>

                    <form 
                        onSubmit={async (e) => {
                            e.preventDefault();
                            const f = new FormData(e.currentTarget);
                            const data = {
                                nombre: f.get('nombre') as string,
                                categoria: f.get('categoria') as string,
                                minimo_alert: parseInt(f.get('minimo_alert') as string),
                                precio_venta: parseFloat(f.get('precio_venta') as string),
                                cantidad: editingItem ? editingItem.cantidad : parseInt(f.get('cantidad_inicial') as string || '0')
                            };

                            setIsLoading(true);
                            try {
                                if (editingItem) {
                                    await stockService.updateItem(editingItem.id, data);
                                    showToast('Producto actualizado.', 'success');
                                } else {
                                    const newItem = await stockService.createItem({ ...data, cantidad: 0 });
                                    if (data.cantidad > 0) {
                                        await stockService.recordMovement(newItem.id, data.cantidad, 'entrada', 'Carga inicial en catálogo');
                                    }
                                    showToast('Producto creado con stock inicial.', 'success');
                                }
                                setShowCreateItem(false);
                                setEditingItem(null);
                                loadData();
                            } catch (err: any) {
                                showToast('Error al guardar el producto.', 'error');
                            } finally {
                                setIsLoading(false);
                            }
                        }}
                        className={styles.modalForm}
                    >
                        <div className={styles.formGroup}>
                            <label><FontAwesomeIcon icon={faTag} style={{ opacity: 0.5, marginRight: '0.25rem' }} /> Nombre del Producto</label>
                            <input name="nombre" type="text" required defaultValue={editingItem?.nombre || ''} className={styles.input} placeholder="Ej. Botella de Agua 350ml" />
                        </div>
                        
                        <div className={styles.formGroup}>
                            <label><FontAwesomeIcon icon={faLayerGroup} style={{ opacity: 0.5, marginRight: '0.25rem' }} /> Categoría</label>
                            <input name="categoria" list="backoffice-categories" required defaultValue={editingItem?.categoria || ''} className={styles.input} placeholder="Seleccionar o escribir..." />
                            <datalist id="backoffice-categories">
                                {settings.categorias_inventario?.map(cat => <option key={cat} value={cat} />)}
                            </datalist>
                        </div>

                        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                            <div className={styles.formGroup} style={{ flex: '1 1 120px' }}>
                                <label><FontAwesomeIcon icon={faBoxes} style={{ opacity: 0.5, marginRight: '0.25rem' }} /> {editingItem ? 'Existencia' : 'Existencia Inicial'}</label>
                                <input 
                                    name="cantidad_inicial" 
                                    type="number" 
                                    required 
                                    defaultValue={editingItem ? editingItem.cantidad : ''} 
                                    min="0" 
                                    className={styles.input} 
                                    disabled={!!editingItem} 
                                    onFocus={(e) => e.target.select()}
                                    placeholder="0"
                                />
                            </div>
                            <div className={styles.formGroup} style={{ flex: '1 1 120px' }}>
                                <label><FontAwesomeIcon icon={faExclamationTriangle} style={{ opacity: 0.5, marginRight: '0.25rem' }} /> Umbral Mín.</label>
                                <input 
                                    name="minimo_alert" 
                                    type="number" 
                                    required 
                                    defaultValue={editingItem ? editingItem.minimo_alert : ''} 
                                    min="0" 
                                    className={styles.input} 
                                    onFocus={(e) => e.target.select()}
                                    placeholder="10"
                                />
                            </div>
                            <div className={styles.formGroup} style={{ flex: '1 1 120px' }}>
                                <label><FontAwesomeIcon icon={faMoneyBillWave} style={{ opacity: 0.5, marginRight: '0.25rem' }} /> Precio Venta ($)</label>
                                <input 
                                    name="precio_venta" 
                                    type="number" 
                                    required 
                                    defaultValue={editingItem ? editingItem.precio_venta : ''} 
                                    min="0" 
                                    step="0.01" 
                                    className={styles.input} 
                                    onFocus={(e) => e.target.select()}
                                    placeholder="0.00"
                                />
                            </div>
                        </div>

                        <div className={styles.modalFooter}>
                            <button type="button" onClick={() => { setShowCreateItem(false); setEditingItem(null); }} className="btn btn-ghost">Cancelar</button>
                            <button type="submit" className="btn btn-primary" disabled={isLoading}>
                                {isLoading ? 'Guardando...' : (editingItem ? 'Actualizar' : 'Crear')}
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
          <button className={`${styles.navButton} ${activeSection === 'INVENTORY' ? styles.active : ''}`} onClick={() => setActiveSection('INVENTORY')}>📦 Inventarios</button>
          <button className={`${styles.navButton} ${activeSection === 'STAFF' ? styles.active : ''}`} onClick={() => setActiveSection('STAFF')}>👥 Personal</button>
          <button className={`${styles.navButton} ${activeSection === 'SAFETY' ? styles.active : ''}`} onClick={() => setActiveSection('SAFETY')}>🛡️ Seguridad</button>
          <button className={`${styles.navButton} ${activeSection === 'BRANDING' ? styles.active : ''}`} onClick={() => setActiveSection('BRANDING')}>🏷️ Marca</button>
          <button className={`${styles.navButton} ${activeSection === 'OPERATIONS' ? styles.active : ''}`} onClick={() => setActiveSection('OPERATIONS')}>⏰ Horarios</button>
          <button className={`${styles.navButton} ${activeSection === 'LOYALTY' ? styles.active : ''}`} onClick={() => setActiveSection('LOYALTY')}>🔥 Fidelidad</button>
          <button className={`${styles.navButton} ${activeSection === 'MAINTENANCE' ? styles.active : ''}`} onClick={() => setActiveSection('MAINTENANCE')}>⚙️ Mantenimiento</button>
        </aside>
        <main className={styles.content}>
          {activeSection === 'CATALOGS' && (
            // ... (keeping existing catalogs code)
            <section className={styles.configCard}>
              <div className={styles.sectionHeader} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h3><FontAwesomeIcon icon={faBoxOpen} /> Catálogo de Paquetes</h3>
                  <p>Gestione los tipos de entrada y costos del parque infantil.</p>
                </div>
                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                    <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
                    Ver archivados
                  </label>
                  <button className="btn btn-primary" onClick={() => setShowCreatePackage(true)}>
                    <FontAwesomeIcon icon={faPlus} /> Nuevo Paquete
                  </button>
                </div>
              </div>

              <div className={styles.tableWrapper}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Paquete</th>
                      <th>Área</th>
                      <th>Minutos</th>
                      <th>Precio</th>
                      <th>Estado</th>
                      <th>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {packages.filter(p => showInactive ? true : p.activo).map(p => (
                        <tr key={p.id} style={{ opacity: p.activo ? 1 : 0.5, background: p.activo ? 'transparent' : '#f8fafc' }}>
                        <td><strong>{p.nombre}</strong></td>
                        <td>{p.area}</td>
                        <td>{p.duracion_minutos} min</td>
                        <td>${p.precio}.00</td>
                        <td>
                           <span className={`${styles.statusBadge} ${p.activo ? styles.active : styles.inactive}`}>
                              {p.activo ? 'Activo' : 'Pausado'}
                           </span>
                        </td>
                        <td className={styles.actionsCell}>
                          <button className={styles.iconBtn} onClick={() => setEditingPackage(p)} title="Editar">
                            <FontAwesomeIcon icon={faEdit} />
                          </button>
                          
                          <button 
                            className={`${styles.iconBtn} ${p.activo ? styles.iconBtnWarning : styles.iconBtnSuccess}`} 
                            onClick={async () => {
                              try {
                                await togglePackageStatus(p.id, p.activo);
                                showToast(`${p.nombre} ha sido ${p.activo ? 'desactivado' : 'activado'}.`, 'success');
                                loadData();
                              } catch (e) {
                                showToast('Error al actualizar estado.', 'error');
                              }
                            }}
                            title={p.activo ? 'Desactivar' : 'Activar'}
                          >
                            <FontAwesomeIcon icon={p.activo ? faLock : faKey} />
                          </button>

                          <button 
                            className={`${styles.iconBtn} ${styles.iconBtnDanger}`} 
                            onClick={() => setDeletingPackage(p)}
                            title="Eliminar"
                          >
                            <FontAwesomeIcon icon={faTrash} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Modal Crear/Editar Paquete */}
              {(showCreatePackage || editingPackage) && (
                <div className={styles.modalOverlay}>
                  <div className={styles.modal} style={{ maxWidth: '450px' }}>
                    <div className={styles.modalHeader}>
                      <h3>
                        <FontAwesomeIcon icon={editingPackage ? faEdit : faPlus} style={{ marginRight: '0.5rem', opacity: 0.8 }} />
                        {editingPackage ? 'Editar Paquete' : 'Nuevo Paquete'}
                      </h3>
                      <button onClick={() => { setShowCreatePackage(false); setEditingPackage(null); }} className={styles.closeBtn}>
                        <FontAwesomeIcon icon={faTimes} />
                      </button>
                    </div>

                    <form 
                      onSubmit={async (e) => {
                        e.preventDefault();
                        const f = new FormData(e.currentTarget);
                        const data = {
                          nombre: f.get('nombre') as string,
                          area: f.get('area') as string,
                          duracion_minutos: parseInt(f.get('duracion') as string),
                          precio: parseFloat(f.get('precio') as string),
                          activo: true
                        };

                        setIsLoading(true);
                        try {
                          if (editingPackage) {
                            await updatePackage(editingPackage.id, data);
                            showToast('Paquete actualizado.', 'success');
                          } else {
                            await createPackage(data);
                            showToast('Paquete creado.', 'success');
                          }
                          setShowCreatePackage(false);
                          setEditingPackage(null);
                          loadData();
                        } catch (err: any) {
                          showToast(err.message || 'Error al guardar paquete.', 'error');
                        } finally {
                          setIsLoading(false);
                        }
                      }} 
                      className={styles.modalForm}
                    >
                      <div className={styles.formGroup}>
                        <label><FontAwesomeIcon icon={faTag} style={{ opacity: 0.5, marginRight: '0.25rem' }} /> Nombre del Paquete</label>
                        <input name="nombre" type="text" required defaultValue={editingPackage?.nombre || ''} className={styles.input} placeholder="Ej. Super Salto 2H" />
                      </div>
                      
                      <div className={styles.formGroup}>
                        <label><FontAwesomeIcon icon={faLayerGroup} style={{ opacity: 0.5, marginRight: '0.25rem' }} /> Área del Parque</label>
                        <select name="area" className={styles.input} defaultValue={editingPackage?.area || 'Mundo Pekes'}>
                          <option value="Mundo Pekes">Mundo Pekes</option>
                          <option value="Trampolin">Trampolín</option>
                          <option value="Mixto">Mixto (Global)</option>
                          <option value="Eventos">Eventos / Cumpleaños</option>
                          <option value="General">General</option>
                        </select>
                      </div>

                      <div style={{ display: 'flex', gap: '1rem' }}>
                        <div className={styles.formGroup} style={{ flex: 1 }}>
                          <label><FontAwesomeIcon icon={faClock} style={{ opacity: 0.5, marginRight: '0.25rem' }} /> Duración (Minutos)</label>
                          <input 
                            name="duracion" 
                            type="number" 
                            required 
                            defaultValue={editingPackage ? editingPackage.duracion_minutos : ''} 
                            min="1" 
                            className={styles.input} 
                            onFocus={(e) => e.target.select()}
                            placeholder="60"
                          />
                        </div>
                        <div className={styles.formGroup} style={{ flex: 1 }}>
                          <label><FontAwesomeIcon icon={faTag} style={{ opacity: 0.5, marginRight: '0.25rem' }} /> Precio ($)</label>
                          <input 
                            name="precio" 
                            type="number" 
                            required 
                            defaultValue={editingPackage ? editingPackage.precio : ''} 
                            min="0" 
                            step="0.01" 
                            className={styles.input} 
                            onFocus={(e) => e.target.select()}
                            placeholder="100.00"
                          />
                        </div>
                      </div>

                      <div className={styles.modalFooter}>
                        <button type="button" onClick={() => { setShowCreatePackage(false); setEditingPackage(null); }} className="btn btn-ghost">Cancelar</button>
                        <button type="submit" className="btn btn-primary" disabled={isLoading}>
                          {isLoading ? 'Guardando...' : (editingPackage ? 'Actualizar' : 'Crear')}
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              )}
            </section>
          )}
          {activeSection === 'INVENTORY' && renderInventorySection()}
          {activeSection === 'STAFF' && renderStaffSection()}
          {activeSection === 'SAFETY' && (
            <section className={styles.configCard}>
                <h3>Seguridad y Edades</h3>
                <div className={styles.safetyGrid} style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem' }}>
                    <div className={styles.formGroup}>
                        <label>Edad Mínima</label>
                        <input type="number" className={styles.input} value={settings.edad_minima} onChange={(e) => setSettings({...settings, edad_minima: parseInt(e.target.value)})} onFocus={(e) => e.target.select()} />
                    </div>
                    <div className={styles.formGroup}>
                        <label>Edad Máxima</label>
                        <input type="number" className={styles.input} value={settings.edad_maxima} onChange={(e) => setSettings({...settings, edad_maxima: parseInt(e.target.value)})} onFocus={(e) => e.target.select()} />
                    </div>
                </div>
                <button className="btn btn-primary" onClick={() => handleSaveSettings('Rango de edades actualizado.')} disabled={isLoading}>{isLoading ? 'Guardando...' : 'Guardar Edades'}</button>
            </section>
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
                     <input type="number" className={styles.input} value={settings.fidelizacion_visitas ?? 0} onChange={(e) => setSettings({...settings, fidelizacion_visitas: parseInt(e.target.value) || 0})} onFocus={(e) => e.target.select()} />
                   </div>
                   <div className={styles.formGroup}>
                     <label>Premio (Minutos Gratis)</label>
                     <input type="number" className={styles.input} value={settings.fidelizacion_minutos ?? 0} onChange={(e) => setSettings({...settings, fidelizacion_minutos: parseInt(e.target.value) || 0})} onFocus={(e) => e.target.select()} />
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

      <ConfirmDialog
        isOpen={!!deletingPackage}
        title="Archivar Paquete"
        message={`¿Está seguro de archivar el paquete "${deletingPackage?.nombre}"? Dejará de estar visible en el kiosko de ventas pero se conservará en tu historial financiero.`}
        confirmText="SÍ, ARCHIVAR"
        cancelText="No, Mantenerlo"
        status="warning"
        onCancel={() => setDeletingPackage(null)}
        onConfirm={async () => {
          if (deletingPackage) {
            try {
              // En lugar de borrar, simplemente desactivamos para mantener historia
              await togglePackageStatus(deletingPackage.id, true);
              showToast('Paquete archivado correctamente.', 'success');
              loadData();
            } catch (e) {
              showToast('Error al intentar archivar el paquete.', 'error');
            } finally {
              setDeletingPackage(null);
            }
          }
        }}
      />

      <ConfirmDialog
        isOpen={!!deletingItem}
        title="Eliminar Producto"
        message={`¿Está seguro de eliminar el producto "${deletingItem?.nombre}"? Esto también podría afectar el historial de movimientos de inventario.`}
        confirmText="SÍ, ELIMINAR"
        cancelText="Cancelar"
        status="danger"
        onCancel={() => setDeletingItem(null)}
        onConfirm={async () => {
          if (deletingItem) {
            try {
              await stockService.deleteItem(deletingItem.id);
              showToast('Producto eliminado correctamente.', 'success');
              loadData();
            } catch (e) {
              showToast('Error al intentar eliminar el producto.', 'error');
            } finally {
              setDeletingItem(null);
            }
          }
        }}
      />

      <ConfirmDialog
        isOpen={!!archivingItem}
        title="Archivar Producto"
        message={`¿Está seguro de archivar el producto "${archivingItem?.nombre}"? Dejará de aparecer en las ventas, pero se conservará su historial de movimientos.`}
        confirmText="SÍ, ARCHIVAR"
        cancelText="Cancelar"
        status="warning"
        onCancel={() => setArchivingItem(null)}
        onConfirm={async () => {
            if (archivingItem) {
                try {
                    await stockService.updateItem(archivingItem.id, { activo: false });
                    showToast('Producto archivado.', 'success');
                    loadData();
                } catch (e) {
                    showToast('Error al archivar el producto.', 'error');
                } finally {
                    setArchivingItem(null);
                }
            }
        }}
      />
    </div>
  );
};
