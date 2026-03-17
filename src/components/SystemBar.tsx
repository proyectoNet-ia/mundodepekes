import React from 'react';
import styles from './SystemBar.module.css';
import { useResilience } from '../hooks/useResilience';

export const SystemBar: React.FC = () => {
  const { status } = useResilience();

  return (
    <div className={`${styles.bar} ${status.isOnline ? '' : styles.offline}`}>
      <div className={styles.statusGroup}>
        <span className={styles.indicator}>
          {status.isOnline ? '🌐 Sistema Online' : '⚠️ MODO OFFLINE ACTIVADO'}
        </span>
        <span className={styles.separator}>|</span>
        <span className={styles.hardware}>
          🖨️ EPSON: <span className={styles[status.printerEpson]}>{status.printerEpson.toUpperCase()}</span>
        </span>
        <span className={styles.hardware}>
          🏷️ ZEBRA: <span className={styles[status.printerZebra]}>{status.printerZebra.toUpperCase()}</span>
        </span>
      </div>
      <div className={styles.syncGroup}>
          <span>Sincronización: {status.lastSync ? new Date(status.lastSync).toLocaleTimeString() : 'Pendiente'}</span>
      </div>
    </div>
  );
};
