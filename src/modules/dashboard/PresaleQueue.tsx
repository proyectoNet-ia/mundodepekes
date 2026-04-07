import React, { useState, useEffect, useCallback } from 'react';
import {
  getPendingPresales,
  cancelPresale,
  expireOldPresales,
  subscribeToPresales,
  type Presale,
} from '../../lib/presaleService';
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
                <span className={styles.code}>{code}</span>
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
                <span className={styles.phone}>{presale.tutor_telefono}</span>
              </div>

              {/* Niños */}
              <div className={styles.children}>
                {presale.ninos.map((n, i) => (
                  <div key={i} className={styles.childRow}>
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
                    disabled={cancelling === presale.id}
                    title="Cancelar orden"
                  >
                    {cancelling === presale.id ? '...' : 'Cancelar'}
                  </button>
                  <button
                    className={styles.btnExecute}
                    onClick={() => handleExecute(presale)}
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
