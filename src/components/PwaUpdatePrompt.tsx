import React, { useState, useEffect } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import styles from './PwaUpdatePrompt.module.css';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faRocket, faDownload, faTimes, faArrowsRotate, faCheckCircle } from '@fortawesome/free-solid-svg-icons';

export const PwaUpdatePrompt: React.FC = () => {
  const [installPromptEvent, setInstallPromptEvent] = useState<any>(null);
  const [showInstallBanner, setShowInstallBanner] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);

  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(r?: ServiceWorkerRegistration) {
      if (r) {
        // Verificar actualizaciones periódicamente cada 15 minutos
        setInterval(() => {
          r.update().catch((err: unknown) => console.debug('Error checking SW update:', err));
        }, 15 * 60 * 1000);
      }
    },
    onRegisterError(error: unknown) {
      console.warn('Error registrando Service Worker PWA:', error);
    },
  });

  // Capturar el evento nativo de instalación de PWA
  useEffect(() => {
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone === true;
    if (isStandalone) return;

    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setInstallPromptEvent(e);
      if (sessionStorage.getItem('pwa_install_dismissed') !== 'true') {
        setShowInstallBanner(true);
      }
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!installPromptEvent) return;
    try {
      await installPromptEvent.prompt();
      const choice = await installPromptEvent.userChoice;
      if (choice.outcome === 'accepted') {
        setShowInstallBanner(false);
      }
    } catch (e) {
      console.warn('Error al solicitar instalación PWA:', e);
    }
  };

  const handleDismissInstall = () => {
    setShowInstallBanner(false);
    sessionStorage.setItem('pwa_install_dismissed', 'true');
  };

  const handleApplyUpdate = async () => {
    setIsUpdating(true);
    try {
      await updateServiceWorker(true);
    } catch (e) {
      window.location.reload();
    }
  };

  return (
    <div className={styles.container}>
      {/* 1. ALERTA DE NUEVA VERSIÓN DISPONIBLE */}
      {needRefresh && (
        <div className={styles.card} role="alert">
          <div className={`${styles.iconWrapper} ${styles.updateIcon}`}>
            <FontAwesomeIcon icon={isUpdating ? faArrowsRotate : faRocket} spin={isUpdating} />
          </div>
          <div className={styles.content}>
            <div className={styles.title}>
              <span>Nueva Versión Disponible</span>
              <span className={styles.badge}>Nuevo</span>
            </div>
            <p className={styles.description}>
              Se han publicado mejoras y ajustes en PekePark. Actualiza para aplicar los cambios al instante.
            </p>
            <div className={styles.actions}>
              <button 
                className={`${styles.btnPrimary} ${styles.btnUpdate}`} 
                onClick={handleApplyUpdate}
                disabled={isUpdating}
              >
                <FontAwesomeIcon icon={faArrowsRotate} spin={isUpdating} />
                <span>{isUpdating ? 'Actualizando...' : 'Actualizar Ahora'}</span>
              </button>
              <button 
                className={styles.btnGhost} 
                onClick={() => setNeedRefresh(false)}
                disabled={isUpdating}
              >
                Más tarde
              </button>
            </div>
          </div>
          <button 
            className={styles.closeBtn} 
            onClick={() => setNeedRefresh(false)} 
            aria-label="Cerrar"
          >
            <FontAwesomeIcon icon={faTimes} />
          </button>
        </div>
      )}

      {/* 2. PROMPT DE INSTALACIÓN DE LA APLICACIÓN */}
      {showInstallBanner && !needRefresh && (
        <div className={styles.card} role="dialog">
          <div className={`${styles.iconWrapper} ${styles.installIcon}`}>
            <FontAwesomeIcon icon={faDownload} />
          </div>
          <div className={styles.content}>
            <div className={styles.title}>
              <span>Instalar Aplicación</span>
            </div>
            <p className={styles.description}>
              Instala PekePark en este equipo para acceso directo de escritorio y máxima velocidad offline.
            </p>
            <div className={styles.actions}>
              <button className={styles.btnPrimary} onClick={handleInstallClick}>
                <FontAwesomeIcon icon={faDownload} />
                <span>Instalar App</span>
              </button>
              <button className={styles.btnGhost} onClick={handleDismissInstall}>
                No por ahora
              </button>
            </div>
          </div>
          <button className={styles.closeBtn} onClick={handleDismissInstall} aria-label="Cerrar">
            <FontAwesomeIcon icon={faTimes} />
          </button>
        </div>
      )}

      {/* 3. CONFIRMACIÓN DISCRETA DE LISTO OFFLINE */}
      {offlineReady && !needRefresh && (
        <div className={styles.card} style={{ borderLeft: '4px solid #059669' }}>
          <div className={`${styles.iconWrapper} ${styles.offlineIcon}`}>
            <FontAwesomeIcon icon={faCheckCircle} />
          </div>
          <div className={styles.content}>
            <div className={styles.title}>
              <span>Sistema Listo Offline</span>
            </div>
            <p className={styles.description} style={{ marginBottom: 0 }}>
              PekePark está completamente descargado y listo para operar incluso sin conexión a internet.
            </p>
          </div>
          <button className={styles.closeBtn} onClick={() => setOfflineReady(false)} aria-label="Cerrar">
            <FontAwesomeIcon icon={faTimes} />
          </button>
        </div>
      )}
    </div>
  );
};
