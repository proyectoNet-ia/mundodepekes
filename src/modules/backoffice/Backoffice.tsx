import React, { useState, useEffect } from 'react';
import styles from './Backoffice.module.css';
import { getSystemSettings, updateSystemSettings } from '../../lib/settingsService';

type ConfigSection = 'CATALOGS' | 'SAFETY' | 'BRANDING';

export const Backoffice: React.FC = () => {
  const [activeSection, setActiveSection] = useState<ConfigSection>('CATALOGS');
  const [capacities, setCapacities] = useState({ mundo_pekes: 30, trampolin: 35 });
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const loadSettings = async () => {
      const settings = await getSystemSettings();
      setCapacities(settings);
    };
    loadSettings();
  }, []);

  const handleSaveSafety = async () => {
    setIsLoading(true);
    try {
      await updateSystemSettings(capacities);
      alert('Configuración de seguridad guardada con éxito');
    } catch (error) {
      console.error(error);
      alert('Error al guardar la configuración');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h2>Panel de Configuración</h2>
        <p>Gestión administrativa y personalización del sistema</p>
      </header>

      <div className={styles.layout}>
        <aside className={styles.sidebar}>
          <button 
            className={`${styles.navButton} ${activeSection === 'CATALOGS' ? styles.active : ''}`}
            onClick={() => setActiveSection('CATALOGS')}
          >
            📂 Catálogos
          </button>
          <button 
            className={`${styles.navButton} ${activeSection === 'SAFETY' ? styles.active : ''}`}
            onClick={() => setActiveSection('SAFETY')}
          >
            🛡️ Seguridad
          </button>
          <button 
            className={`${styles.navButton} ${activeSection === 'BRANDING' ? styles.active : ''}`}
            onClick={() => setActiveSection('BRANDING')}
          >
            🏷️ Marca
          </button>
        </aside>

        <main className={styles.content}>
          {activeSection === 'CATALOGS' && (
            <section className={styles.configCard}>
              <h3>Gestión de Paquetes</h3>
              <div className={styles.tableActions}>
                <button className="btn btn-primary">+ Nuevo Paquete</button>
              </div>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Paquete</th>
                    <th>Área</th>
                    <th>Duración</th>
                    <th>Precio</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Básico 1H</td>
                    <td>Mundo Pekes</td>
                    <td>60 min</td>
                    <td>$15.00</td>
                    <td><span className={styles.activeLabel}>Activo</span></td>
                  </tr>
                  <tr>
                    <td>Pro 2H</td>
                    <td>Trampolín</td>
                    <td>120 min</td>
                    <td>$25.00</td>
                    <td><span className={styles.activeLabel}>Activo</span></td>
                  </tr>
                </tbody>
              </table>
            </section>
          )}

          {activeSection === 'SAFETY' && (
            <section className={styles.configCard}>
              <h3>Seguridad Infantil y Listas Negras</h3>
              <div className={styles.warningBox}>
                Reglas de acceso estricto y observaciones médicas.
              </div>
              <div className={styles.safetyGrid}>
                <div className={styles.formGroup}>
                    <label>Restricción de Edad Mínima</label>
                    <input type="number" className={styles.input} defaultValue={0} />
                </div>
                <div className={styles.formGroup}>
                    <label>Restricción de Edad Máxima</label>
                    <input type="number" className={styles.input} defaultValue={12} />
                </div>
                <div className={styles.formGroup}>
                    <label>Capacidad Máxima: Mundo de Pekes</label>
                    <input 
                      type="number" 
                      className={styles.input} 
                      value={capacities.mundo_pekes} 
                      onChange={(e) => setCapacities({...capacities, mundo_pekes: parseInt(e.target.value)})}
                    />
                </div>
                <div className={styles.formGroup}>
                    <label>Capacidad Máxima: Trampolin Park</label>
                    <input 
                      type="number" 
                      className={styles.input} 
                      value={capacities.trampolin} 
                      onChange={(e) => setCapacities({...capacities, trampolin: parseInt(e.target.value)})}
                    />
                </div>
              </div>
              <button 
                className="btn btn-primary" 
                style={{ marginTop: '2rem' }}
                onClick={handleSaveSafety}
                disabled={isLoading}
              >
                {isLoading ? 'Guardando...' : 'Guardar Configuración de Seguridad'}
              </button>
              <div style={{ marginTop: '2rem' }}>
                <h4>Usuarios en Lista Negra</h4>
                <p style={{ color: 'var(--text-tertiary)', fontSize: '0.8rem' }}>Control de acceso denegado por comportamiento.</p>
                <div className={styles.emptyState}>No hay bloqueos activos</div>
              </div>
            </section>
          )}

          {activeSection === 'BRANDING' && (
            <section className={styles.configCard}>
              <h3>Identidad de Marca</h3>
              <div className={styles.brandingGrid}>
                <div className={styles.formGroup}>
                  <label>Mensaje Cabecera Ticket</label>
                  <textarea className={styles.input} placeholder="Eje: ¡Gracias por visitarnos!" />
                </div>
                <div className={styles.formGroup}>
                  <label>Términos y Condiciones (Resumido)</label>
                  <textarea className={styles.input} placeholder="Eje: No nos hacemos responsables por..." />
                </div>
                <div className={styles.formGroup}>
                  <label>Logo para Impresora (B/N)</label>
                  <div className={styles.uploadBox}>Soltar archivo aquí o buscar</div>
                </div>
                <div className={styles.formGroup}>
                    <label>Pre-visualización de Pulsera (Zebra)</label>
                    <div className={styles.braceletPreview}>
                        <div className={styles.previewContent}>
                            <span>PekePark</span>
                            <small>Sábado 16 - 17:30</small>
                            <strong>MATEO G.</strong>
                        </div>
                    </div>
                </div>
              </div>
              <button className="btn btn-primary" style={{ marginTop: '2rem' }}>Guardar Cambios de Marca</button>
            </section>
          )}
        </main>
      </div>
    </div>
  );
};
