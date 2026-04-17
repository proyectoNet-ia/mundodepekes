import React, { useState, useEffect } from 'react';
import styles from './SystemBar.module.css';
import { useResilience } from '../hooks/useResilience';
import { syncService } from '../lib/syncService';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCloudArrowUp, faWifi, faExclamationTriangle, faSpinner } from '@fortawesome/free-solid-svg-icons';

export const SystemBar: React.FC = () => {
  const { status } = useResilience();
  const [isSyncing, setIsSyncing] = useState(false);
  const [autoWristband, setAutoWristband] = useState<boolean>(() => {
    const settings = JSON.parse(localStorage.getItem('printer_settings') || '{}');
    return settings.autoPrintWristbands !== false;
  });

  const hasWristbandPrinter = (() => {
    const settings = JSON.parse(localStorage.getItem('printer_settings') || '{}');
    return !!settings.wristbandPrinter?.address || settings.wristbandPrinter?.connection === 'WEBUSB';
  })();

  // Escuchar cambios en settings
  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'printer_settings') {
        const settings = JSON.parse(e.newValue || '{}');
        setAutoWristband(settings.autoPrintWristbands !== false);
      }
    };
    window.addEventListener('storage', handleStorage);

    // Custom event para cambios manuales en la misma pestaña
    const handleUpdate = () => {
        const settings = JSON.parse(localStorage.getItem('printer_settings') || '{}');
        setAutoWristband(settings.autoPrintWristbands !== false);
    };
    window.addEventListener('printer_settings_updated', handleUpdate);

    return () => {
        window.removeEventListener('storage', handleStorage);
        window.removeEventListener('printer_settings_updated', handleUpdate);
    };
  }, []);

  const toggleAutoWristband = () => {
    const settings = JSON.parse(localStorage.getItem('printer_settings') || '{}');
    settings.autoPrintWristbands = !autoWristband;
    localStorage.setItem('printer_settings', JSON.stringify(settings));
    setAutoWristband(settings.autoPrintWristbands);
    // Notificar a otras partes de la app
    window.dispatchEvent(new Event('printer_settings_updated'));
  };

  const getSpeedClass = () => {
    if (!status.isOnline) return styles.speedOffline;
    if (status.speedMbps && status.speedMbps >= 8) return styles.speedFast;
    if (status.speedMbps && status.speedMbps > 2) return styles.speedMedium;
    return styles.speedSlow;
  };

  const handleManualSync = async () => {
      if (isSyncing || status.pendingSyncCount === 0 || !status.isOnline) return;
      setIsSyncing(true);
      try {
          await syncService.syncNow();
      } finally {
          setIsSyncing(false);
      }
  };

  return (
    <div className={`${styles.bar} ${status.isOnline ? '' : styles.offline}`}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
        <div className={styles.statusGroup}>
          <span className={styles.indicator}>
            {status.isOnline ? '☁️ Sincronización Nube Activa' : '🔋 Operando en Memoria Local'}
          </span>
          <span className={styles.separator}>|</span>
          <span className={styles.hardware}>
            🖨️ EPSON: <span className={styles[status.printerEpson]}>{status.printerEpson.toUpperCase()}</span>
          </span>
          <span className={styles.hardware}>
            🏷️ ZEBRA: <span className={styles[status.printerZebra]}>{status.printerZebra.toUpperCase()}</span>
          </span>
          {hasWristbandPrinter && (
            <>
              <span className={styles.separator}>|</span>
              <div className={styles.toggleGroup} onClick={toggleAutoWristband} style={{ cursor: 'pointer' }}>
                <span className={autoWristband ? styles.activeText : styles.inactiveText}>
                    {autoWristband ? '⚡ Auto-Pulsera: ON' : '⏸️ Auto-Pulsera: OFF'}
                </span>
              </div>
            </>
          )}
          <span className={styles.hardware}>
            💰 CAJA: <span className={status.cashStatus === 'abierta' ? styles.connected : styles.disconnected}>
              {status.cashStatus.toUpperCase()}
            </span>
          </span>
        </div>
        <div className={styles.syncGroup}>
            {status.pendingSyncCount > 0 && (
                <button 
                  className={styles.syncBadge} 
                  onClick={handleManualSync}
                  disabled={!status.isOnline || isSyncing}
                  title={status.isOnline ? "Clic aquí para subir ventas a la Nube" : "Reconectate a Internet para sincronizar"}
                  style={{ 
                      border: 'none', 
                      outline: 'none', 
                      cursor: status.isOnline ? 'pointer' : 'not-allowed', 
                      opacity: (isSyncing || !status.isOnline) ? 0.7 : 1, 
                      transition: 'all 0.3s',
                      fontFamily: 'inherit'
                  }}
                >
                    <FontAwesomeIcon icon={isSyncing ? faSpinner : faCloudArrowUp} spin={isSyncing} className={styles.syncIcon} />
                    <span>{isSyncing ? 'Sincronizando...' : `${status.pendingSyncCount} Ventas Pendientes`}</span>
                </button>
            )}
            <div className={`${styles.networkStatus} ${getSpeedClass()}`}>
                <div className={styles.pulseDot}></div>
                <FontAwesomeIcon icon={status.isOnline ? faWifi : faExclamationTriangle} />
                <span>
                    {status.isOnline 
                        ? `Estable ${status.speedMbps ? `(${status.speedMbps} Mbps)` : ''}` 
                        : 'Sin Internet'}
                </span>
            </div>
        </div>
      </div>
    </div>
  );
};
