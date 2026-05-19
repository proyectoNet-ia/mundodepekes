import React, { useState, useEffect, useCallback } from 'react';
import {
  getPendingPresales,
  cancelPresale,
  expireOldPresales,
  subscribeToPresales,
  confirmPresale,
  registerCustomerOnly,
  type Presale,
} from '../../lib/presaleService';
import { useToast } from '../../components/Toast';
import styles from './PresaleQueue.module.css';

interface PresaleQueueProps {
  /** Callback para pre-cargar el SalesEngine con datos de una preventa */
  onExecute: (presaleData: {
    tutorNombre: string;
    tutorTelefono: string;
    tutorEmail?: string;
    ninos: Presale['ninos'];
    presaleId: string;
    total: number;
  }) => void;
}

const timeAgo = (dateStr: string) => {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'Hace un momento';
  if (m === 1) return 'Hace 1 min';
  return `Hace ${m} min`;
};

const timeLeft = (expiresAt: string) => {
  const diff = Math.max(0, new Date(expiresAt).getTime() - Date.now());
  const m = Math.floor(diff / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  return diff === 0 ? 'EXPIRADA' : `${m}:${s.toString().padStart(2, '0')}`;
};

const isExpiring = (expiresAt: string) => {
  return new Date(expiresAt).getTime() - Date.now() < 10 * 60 * 1000;
};

export const PresaleQueue: React.FC<PresaleQueueProps> = ({ onExecute }) => {
  const [presales, setPresales] = useState<Presale[]>([]);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [registeringId, setRegisteringId] = useState<string | null>(null);
  const { showToast } = useToast();
  const [, forceRender] = useState(0); // Tick cada 30s para actualizar timers

  const load = useCallback(async () => {
    await expireOldPresales();
    const data = await getPendingPresales();
    setPresales(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();

    // Realtime subscription
    const sub = subscribeToPresales(load);

    // Re-render cada 30s para actualizar los timers
    const ticker = setInterval(() => forceRender(x => x + 1), 30000);

    return () => {
      sub.unsubscribe();
      clearInterval(ticker);
    };
  }, [load]);

  const handleCancel = async (id: string) => {
    setCancelling(id);
    try {
      await cancelPresale(id);
      setPresales(prev => prev.filter(p => p.id !== id));
    } finally {
      setCancelling(null);
    }
  };

  const handleDirectRegister = async (presale: Presale) => {
    setRegisteringId(presale.id);
    try {
      // 1. Registrar tutor y niños de forma permanente en la base de datos
      await registerCustomerOnly({
        tutor_nombre: presale.tutor_nombre,
        tutor_telefono: presale.tutor_telefono,
        ninos: presale.ninos.map(n => ({
          nombre: n.nombre,
          edad: n.edad
        }))
      });

      // 2. Confirmar la preventa en BD
      await confirmPresale(presale.id);

      // 3. Remover de la lista local
      setPresales(prev => prev.filter(p => p.id !== presale.id));
      showToast('Registro guardado en base de datos con éxito.', 'success');
    } catch (err: any) {
      console.error('Error during direct registration:', err);
      showToast('Error al registrar: ' + (err.message || err), 'error');
    } finally {
      setRegisteringId(null);
    }
  };

  const handleExecute = (presale: Presale) => {
    onExecute({
      tutorNombre: presale.tutor_nombre,
      tutorTelefono: presale.tutor_telefono,
      tutorEmail: presale.tutor_email,
      ninos: presale.ninos,
      presaleId: presale.id,
      total: presale.total_estimado,
    });
  };

  if (loading || presales.length === 0) return null;

  return (
    <div className={styles.queue}>
      <div className={styles.queueHeader}>
        <div className={styles.queueTitleGroup}>
          <span className={styles.queueDot} />
          <h3 className={styles.queueTitle}>Órdenes en Espera</h3>
          <span className={styles.queueCount}>{presales.length}</span>
        </div>
        <span className={styles.queueSubtitle}>Pre-registros del portal de clientes</span>
      </div>

      <div className={styles.list}>
        {presales.map(presale => {
          const expiring = isExpiring(presale.expires_at);
          const left = timeLeft(presale.expires_at);
          const code = 'PEKES-' + presale.id.substring(0, 6).toUpperCase();

          return (
            <div key={presale.id} className={`${styles.card} ${expiring ? styles.cardExpiring : ''}`}>
              {/* Código + timer */}
              <div className={styles.cardTop}>
                <div className={styles.codeGroup}>
                  <span className={styles.code}>{code}</span>
                  {presale.notas === 'registration' ? (
                    <span className={`${styles.badge} ${styles.badgeRegistration}`}>REGISTRO</span>
                  ) : (
                    <span className={`${styles.badge} ${styles.badgePresale}`}>PRE-VENTA</span>
                  )}
                </div>
                <div className={`${styles.timer} ${expiring ? styles.timerExpiring : ''}`}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="13" height="13">
                    <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                  </svg>
                  {left}
                </div>
                <span className={styles.timeAgo}>{timeAgo(presale.created_at)}</span>
              </div>

              {/* Datos del tutor */}
              <div className={styles.tutor}>
                <strong>{presale.tutor_nombre}</strong>
                <div className={styles.phoneGroup}>
                  <span className={styles.phone}>{presale.tutor_telefono}</span>
                  {presale.telefono_verificado && (
                    <span className={styles.verifiedBadge} title="WhatsApp Verificado">
                      <svg viewBox="0 0 24 24" fill="#25D366" width="14" height="14">
                        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L0 24l6.335-1.662c1.72.937 3.659 1.435 5.631 1.43c6.549 0 11.88-5.335 11.883-11.892a11.83 11.83 0 00-3.488-8.415z"/></svg>
                    </span>
                  )}
                </div>
              </div>

              {/* Niños */}
              <div className={styles.children}>
                {presale.ninos.map((n, i) => (
                  <div key={i} className={styles.childRow} style={{ flexWrap: 'wrap' }}>
                    <span className={styles.childIcon}>🧒</span>
                    <div className={styles.childInfo}>
                      <strong>{n.nombre}</strong>{' '}
                      <span className={styles.childAge}>{n.edad} años</span>
                    </div>
                    <div className={styles.childPkg}>
                      <span className={styles.pkgName}>{n.paquete_nombre}</span>
                      <span className={styles.pkgArea}>{n.area}</span>
                    </div>
                    <span className={styles.childPrice}>${n.precio.toLocaleString('es-MX')}</span>
                    {/* Render accessories if any */}
                    {(n as any).accesorios && (n as any).accesorios.length > 0 && (
                      <div style={{ width: '100%', paddingLeft: '1.8rem', marginTop: '0.3rem', display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                        {(n as any).accesorios.map((a: any, aIdx: number) => (
                          <span key={aIdx} style={{ fontSize: '0.72rem', background: '#dbeafe', color: '#1e40af', padding: '1px 6px', borderRadius: '4px', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '2px' }}>
                            🎒 {a.cantidad}x {a.nombre}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Total + acciones */}
              <div className={styles.cardBottom}>
                <div className={styles.total}>
                  <span>Total</span>
                  <strong>${presale.total_estimado.toLocaleString('es-MX')}</strong>
                </div>
                <div className={styles.actions}>
                  <button
                    className={styles.btnCancel}
                    onClick={() => handleCancel(presale.id)}
                    disabled={cancelling === presale.id || registeringId === presale.id}
                    title="Cancelar orden"
                  >
                    {cancelling === presale.id ? '...' : 'Cancelar'}
                  </button>

                  {(presale.notas === 'registration' || presale.total_estimado === 0) && (
                    <button
                      onClick={() => handleDirectRegister(presale)}
                      disabled={registeringId === presale.id || cancelling === presale.id}
                      style={{
                        backgroundColor: '#10b981',
                        color: 'white',
                        border: 'none',
                        padding: '0.45rem 0.9rem',
                        borderRadius: '0.375rem',
                        cursor: 'pointer',
                        fontSize: '0.78rem',
                        fontWeight: 600,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        transition: 'all 0.15s ease'
                      }}
                      title="Registrar directamente en Base de Datos"
                    >
                      {registeringId === presale.id ? '...' : '📝 Registrar'}
                    </button>
                  )}

                  <button
                    className={styles.btnExecute}
                    onClick={() => handleExecute(presale)}
                    disabled={registeringId === presale.id || cancelling === presale.id}
                    title="Abrir en Caja"
                  >
                    ⚡ Cobrar
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
