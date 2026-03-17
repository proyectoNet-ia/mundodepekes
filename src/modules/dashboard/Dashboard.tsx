import React, { useState, useEffect, useRef } from 'react';
import styles from './Dashboard.module.css';
import { getActiveSessions, finishSession, subscribeToSessions, type ActiveSession } from '../../lib/sessionService';
import { getSystemSettings } from '../../lib/settingsService';

const AREA_MAP: Record<string, string> = {
  'Mundo Pekes': 'Mundo de Pekes',
  'Trampolin': 'Trampolin Park',
  'Mixto': 'Área Mixta'
};

export const Dashboard: React.FC = () => {
  const [sessions, setSessions] = useState<ActiveSession[]>([]);
  const [limits, setLimits] = useState({ mundo_pekes: 30, trampolin: 35 });
  const [currentTime, setCurrentTime] = useState(new Date());
  const bellRef = useRef<HTMLAudioElement | null>(null);
  const alarmRef = useRef<HTMLAudioElement | null>(null);

  // Sound placeholders (can be replaced with production wav/mp3 files)
  const BELL_SOUND = "https://assets.mixkit.co/active_storage/sfx/2568/2568-preview.mp3"; // Ding
  const ALARM_SOUND = "https://assets.mixkit.co/active_storage/sfx/1000/1000-preview.mp3"; // Alert

  const refreshData = async () => {
    const [active, settings] = await Promise.all([
      getActiveSessions(),
      getSystemSettings()
    ]);
    setSessions(active);
    setLimits(settings);
  };

  useEffect(() => {
    refreshData();
    
    const subscription = subscribeToSessions(() => {
      refreshData();
    });

    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000);

    return () => {
      subscription.unsubscribe();
      clearInterval(timer);
    };
  }, []);

  const getCapacityStatus = (current: number, max: number) => {
    const ratio = current / max;
    if (ratio >= 0.9) return styles.statusFull;
    if (ratio >= 0.7) return styles.statusMed;
    return styles.statusOptim;
  };

  const getSessionMetrics = (session: ActiveSession) => {
    const now = currentTime.getTime();
    const end = session.rawEndTime.getTime();
    const start = session.rawStartTime.getTime();
    
    const totalMinutes = Math.max(1, Math.round((end - start) / 60000));
    const remainingMinutes = Math.max(0, Math.round((end - now) / 60000));
    
    return { totalMinutes, remainingMinutes };
  };

  const handleCheckout = async (id: string) => {
    try {
      await finishSession(id);
      refreshData();
    } catch (error) {
      console.error(error);
      alert('Error al realizar checkout');
    }
  };

  // Occupancy Logic (Mixed counts for both)
  const countMundo = sessions.filter(s => s.area === 'Mundo Pekes' || s.area === 'Mixto').length;
  const countTrampolin = sessions.filter(s => s.area === 'Trampolin' || s.area === 'Mixto').length;

  return (
    <div className={styles.dashboardContainer}>
      {/* Audio Components */}
      <audio ref={bellRef} src={BELL_SOUND} preload="auto" />
      <audio ref={alarmRef} src={ALARM_SOUND} preload="auto" />

      <header className={styles.header}>
        <div className={styles.statsOverview}>
          <div className={styles.statCard}>
            <span className={styles.statLabel}>Total en Recinto</span>
            <span className={styles.statValue}>{sessions.length}</span>
            <p style={{fontSize: '0.75rem', color: 'var(--text-tertiary)'}}>Niños activos actualmente</p>
          </div>

          <div className={`${styles.statCard} ${getCapacityStatus(countMundo, limits.mundo_pekes)}`}>
            <span className={styles.statLabel}>Mundo de Pekes</span>
            <span className={styles.statValue}>{countMundo}</span>
            <div className={styles.capacityIndicator}>
                <div className={styles.capacityText}>
                    <span>Ocupación</span>
                    <span>{Math.round((countMundo / limits.mundo_pekes) * 100)}%</span>
                </div>
                <div className={styles.capacityBarBg}>
                    <div 
                        className={styles.capacityBarFill} 
                        style={{ 
                            width: `${(countMundo / limits.mundo_pekes) * 100}%`,
                            backgroundColor: countMundo >= limits.mundo_pekes ? 'var(--danger)' : 'var(--brand-500)'
                        }} 
                    />
                </div>
                <small style={{fontSize: '0.65rem'}}>Límite: {limits.mundo_pekes} niños</small>
            </div>
          </div>

          <div className={`${styles.statCard} ${getCapacityStatus(countTrampolin, limits.trampolin)}`}>
            <span className={styles.statLabel}>Trampolin Park</span>
            <span className={styles.statValue}>{countTrampolin}</span>
            <div className={styles.capacityIndicator}>
                <div className={styles.capacityText}>
                    <span>Ocupación</span>
                    <span>{Math.round((countTrampolin / limits.trampolin) * 100)}%</span>
                </div>
                <div className={styles.capacityBarBg}>
                    <div 
                        className={styles.capacityBarFill} 
                        style={{ 
                            width: `${(countTrampolin / limits.trampolin) * 100}%`,
                            backgroundColor: countTrampolin >= limits.trampolin ? 'var(--danger)' : '#a855f7'
                        }} 
                    />
                </div>
                <small style={{fontSize: '0.65rem'}}>Límite: {limits.trampolin} niños</small>
            </div>
          </div>
        </div>
      </header>

      <section className={styles.zonesGrid}>
        {Object.entries(AREA_MAP).map(([dbArea, uiArea]) => (
          <div key={dbArea} className={styles.zoneSection}>
            <h3 className={styles.zoneTitle}>{uiArea}</h3>
            <div className={styles.sessionGrid}>
              {sessions.filter(s => s.area === dbArea).map(session => {
                const { totalMinutes, remainingMinutes } = getSessionMetrics(session);
                const progress = (remainingMinutes / totalMinutes) * 100;
                const isCritical = remainingMinutes <= 10 && remainingMinutes > 0;
                const isExpired = remainingMinutes <= 0;

                return (
                  <div 
                    key={session.id} 
                    className={`
                        ${styles.sessionCard} 
                        ${isCritical ? styles.critical : ''} 
                        ${isExpired ? styles.expired : ''}
                        ${session.area === 'Mixto' ? styles.mixed : ''}
                    `}
                    role="region"
                    aria-label={`Sesión de ${session.childName}`}
                  >
                    <div className={styles.sessionHeader}>
                      <span className={styles.kidName}>
                          {session.childName}
                          {session.area === 'Mixto' && <span className={styles.mixedBadge}>MIX</span>}
                      </span>
                      <span className={styles.timeTag}>{remainingMinutes}m rest.</span>
                    </div>
                    
                    <div className={styles.progressBarBg}>
                      <div 
                        className={styles.progressBarFill} 
                        style={{ 
                          width: `${progress}%`, 
                          backgroundColor: remainingMinutes <= 0 ? 'var(--danger)' : remainingMinutes <= 10 ? 'var(--warning)' : 'var(--brand-500)'
                        }}
                      />
                    </div>

                    <div className={styles.sessionFooter}>
                      <span className={styles.startTime}>Inicio: {session.startTime}</span>
                      <div className={styles.actions}>
                        <button 
                            className="btn btn-secondary" 
                            style={{ padding: '0.4rem 0.8rem' }}
                            title={`Contactar Tutor: ${session.tutorContact}`}
                            onClick={() => alert(`Llamando al tutor: ${session.tutorContact}`)}
                        >
                            📞
                        </button>
                        <button 
                            className="btn btn-primary"
                            style={{ padding: '0.4rem 0.8rem' }}
                            title="Hacer Checkout"
                            onClick={() => handleCheckout(session.id)}
                        >
                            ✓
                        </button>
                      </div>
                    </div>

                    {isCritical && (
                      <div className={styles.alertBadge} role="alert" aria-live="assertive">
                        🔔 Campana: 10m
                      </div>
                    )}
                    {isExpired && (
                      <div className={styles.expiredBadge} role="alert" aria-live="assertive">
                        🚨 ALARMA: EXPIRO
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </section>

      {/* Aria Live Region for Background Notifications */}
      <div className="sr-only" role="log" aria-live="polite">
        Actualización de tiempos completada. 1 sesión por expirar.
      </div>
    </div>
  );
};
