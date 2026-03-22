import React, { useState, useEffect } from 'react';
import styles from './Dashboard.module.css';
import { getActiveSessions, finishSession, subscribeToSessions, updateChildInfo, type ActiveSession } from '../../lib/sessionService';
import { getSystemSettings } from '../../lib/settingsService';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
  faPhone, 
  faArrowRightFromBracket, 
  faRotateLeft, 
  faBell, 
  faTriangleExclamation, 
  faUsers, 
  faChildReaching, 
  faTableTennisPaddleBall, 
  faChevronLeft, 
  faChevronRight, 
  faSearch, 
  faTimes, 
  faClipboardList, 
  faUserSlash, 
  faUser, 
  faStar, 
  faBaby, 
  faEnvelope
} from '@fortawesome/free-solid-svg-icons';
import { useToast } from '../../components/Toast';
import { ConfirmDialog } from '../../components/ConfirmDialog';

const AREA_MAP: Record<string, string> = {
  'Mundo Pekes': 'Mundo de Pekes',
  'Trampolin': 'Trampolin Park',
  'Mixto': 'Área Mixta'
};

interface DashboardProps {
  onReentry?: (child: ActiveSession) => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ onReentry }) => {
  const { showToast } = useToast();
  const [sessions, setSessions] = useState<ActiveSession[]>([]);
  const [limits, setLimits] = useState({ mundo_pekes: 30, trampolin: 35 });
  const [currentTime, setCurrentTime] = useState(new Date());
  const [currentPages, setCurrentPages] = useState<Record<string, number>>({
    'Mundo Pekes': 1,
    'Trampolin': 1,
    'Mixto': 1
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedChild, setSelectedChild] = useState<ActiveSession | null>(null);
  const [contactChild, setContactChild] = useState<ActiveSession | null>(null);
  const [checkoutChild, setCheckoutChild] = useState<ActiveSession | null>(null);
  const [obsText, setObsText] = useState('');
  const [isBlacklisted, setIsBlacklisted] = useState(false);
  const ITEMS_PER_PAGE = 8;
  
  // Estado para las alertas de "Toast" de pantalla completa
  const [expiredSessions, setExpiredSessions] = useState<ActiveSession[]>([]);
  const [dismissedExpired, setDismissedExpired] = useState<Set<string>>(new Set());

  const refreshData = async () => {
    const [active, settings] = await Promise.all([
      getActiveSessions(),
      getSystemSettings()
    ]);
    setSessions(active);
    setLimits(settings);
  };

  useEffect(() => {
    // Solicitar permisos de notificación nativa
    if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
    }

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

  // Motor detector de expiración (Actualiza el listado de Toasts)
  useEffect(() => {
    const expired = sessions.filter(session => {
        const now = currentTime.getTime();
        const end = session.rawEndTime.getTime();
        return Math.max(0, Math.round((end - now) / 60000)) <= 0;
    });
    setExpiredSessions(expired);
  }, [currentTime, sessions]);

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
      showToast('Error al realizar checkout de la sesión.', 'error');
    }
  };


  const handleSaveObservations = async () => {
    if (!selectedChild) return;
    try {
      await updateChildInfo(selectedChild.childId, {
        observaciones: obsText,
        en_lista_negra: isBlacklisted
      });
      setSelectedChild(null);
      refreshData();
    } catch (error) {
      console.error(error);
      showToast('Error al guardar las observaciones.', 'error');
    }
  };

  const openObsModal = (session: ActiveSession) => {
    console.log('Opening observations for:', session.childName);
    setSelectedChild(session);
    setObsText(session.observaciones || '');
    setIsBlacklisted(session.enListaNegra || false);
  };

  const handleReentryClick = (session: ActiveSession) => {
    console.log('Triggering re-entry for:', session.childName);
    if (onReentry) {
        onReentry({
            ...session,
            tutorName: session.tutorName || 'Tutor'
        });
    }
  };

  // Occupancy Logic (Mixed counts for both)
  const countMundo = sessions.filter(s => s.area === 'Mundo Pekes' || s.area === 'Mixto').length;
  const countTrampolin = sessions.filter(s => s.area === 'Trampolin' || s.area === 'Mixto').length;

  const normalizeText = (text: string) => 
    text ? text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase() : "";

  const activeExpiredToasts = expiredSessions.filter(s => !dismissedExpired.has(s.id));

  // Estado para la pestaña activa de estadísticas en móvil
  const [activeStatTab, setActiveStatTab] = useState<'totales' | 'pekes' | 'trampolin'>('totales');

  return (
    <div className={styles.dashboardContainer}>

      <header className={styles.header}>
        <div className={styles.headerTop}>
          <div className={styles.searchWrapper}>
            <FontAwesomeIcon icon={faSearch} className={styles.searchIcon} />
            <input 
              type="text" 
              placeholder="Buscar peke..." 
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                // Reset pages when searching
                setCurrentPages({'Mundo Pekes': 1, 'Trampolin': 1, 'Mixto': 1});
              }}
              className={styles.searchInput}
            />
            {searchQuery && (
              <button 
                className={styles.clearSearch} 
                onClick={() => setSearchQuery('')}
              >
                <FontAwesomeIcon icon={faTimes} />
              </button>
            )}
          </div>
        </div>

        <div className={styles.statsTabContainer}>
            <div className={styles.statsTabs}>
                <button 
                    className={`${styles.statsTabBtn} ${activeStatTab === 'totales' ? styles.statsTabBtnActive : ''}`} 
                    onClick={() => setActiveStatTab('totales')}
                >
                    <FontAwesomeIcon icon={faUsers} /> Totales
                </button>
                <button 
                    className={`${styles.statsTabBtn} ${activeStatTab === 'pekes' ? styles.statsTabBtnActive : ''}`} 
                    onClick={() => setActiveStatTab('pekes')}
                >
                    <FontAwesomeIcon icon={faChildReaching} /> Mundo de Pekes
                </button>
                <button 
                    className={`${styles.statsTabBtn} ${activeStatTab === 'trampolin' ? styles.statsTabBtnActive : ''}`} 
                    onClick={() => setActiveStatTab('trampolin')}
                >
                    <FontAwesomeIcon icon={faTableTennisPaddleBall} /> Trampolin
                </button>
            </div>
            
            <div className={styles.statsOverview}>
                <div className={`${styles.statCard} ${activeStatTab === 'totales' ? styles.activeStatCard : styles.hiddenStatCard}`}>
                    <span className={styles.statLabel}>
                    <FontAwesomeIcon icon={faUsers} className={styles.iconMargin} /> Total en Recinto
                    </span>
                    <span className={styles.statValue}>{sessions.length}</span>
                    <p style={{fontSize: '0.75rem', color: 'var(--text-tertiary)'}}>Niños activos actualmente</p>
                </div>

                <div className={`${styles.statCard} ${getCapacityStatus(countMundo, limits.mundo_pekes)} ${activeStatTab === 'pekes' ? styles.activeStatCard : styles.hiddenStatCard}`}>
                    <span className={styles.statLabel}>
                    <FontAwesomeIcon icon={faChildReaching} className={styles.iconMargin} /> Mundo de Pekes
                    </span>
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

                <div className={`${styles.statCard} ${getCapacityStatus(countTrampolin, limits.trampolin)} ${activeStatTab === 'trampolin' ? styles.activeStatCard : styles.hiddenStatCard}`}>
                    <span className={styles.statLabel}>
                    <FontAwesomeIcon icon={faTableTennisPaddleBall} className={styles.iconMargin} /> Trampolin Park
                    </span>
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
        </div>
      </header>

      <section className={styles.zonesGrid}>
        {Object.entries(AREA_MAP).map(([dbArea, uiArea]) => (
          <div key={dbArea} className={styles.zoneSection}>
            <div className={styles.zoneHeader}>
              <h3 className={styles.zoneTitle}>{uiArea}</h3>
              <span className={styles.zoneCount}>
                {sessions.filter(s => s.area === dbArea).length} niños
              </span>
            </div>
            
            <div className={styles.sessionGrid}>
              {(() => {
                const areaSessions = sessions
                  .filter(s => s.area === dbArea)
                  .filter(s => {
                    const query = normalizeText(searchQuery);
                    return normalizeText(s.childName).includes(query) || 
                           normalizeText(s.tutorContact).includes(query);
                  })
                  .sort((a, b) => {
                    const metricsA = getSessionMetrics(a);
                    const metricsB = getSessionMetrics(b);
                    return metricsA.remainingMinutes - metricsB.remainingMinutes;
                  });
                
                const totalPages = Math.ceil(areaSessions.length / ITEMS_PER_PAGE);
                const currentPage = currentPages[dbArea] || 1;
                const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
                const visibleSessions = areaSessions.slice(startIndex, startIndex + ITEMS_PER_PAGE);

                return (
                  <>
                    {visibleSessions.length > 0 ? (
                      visibleSessions.map(session => {
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
                              <span className={`${styles.kidName} ${session.enListaNegra ? styles.blacklistedName : ''}`}>
                                  {session.enListaNegra && <FontAwesomeIcon icon={faUserSlash} className={styles.blacklistIcon} title="Lista Negra" />}
                                  {session.childName}
                                  {session.area === 'Mixto' && <span className={styles.mixedBadge}>MIX</span>}
                              </span>
                              <div className={styles.actions}>
                                <button 
                                    className={styles.iconButton}
                                    title={`Observaciones / Incidentes`}
                                    onClick={() => openObsModal(session)}
                                >
                                    <FontAwesomeIcon icon={faClipboardList} color={session.observaciones ? 'var(--warning)' : 'inherit'} />
                                </button>
                                <button 
                                    className={styles.iconButton}
                                    title={`Contactar Tutor: ${session.tutorContact}`}
                                    onClick={() => setContactChild(session)}
                                >
                                    <FontAwesomeIcon icon={faPhone} />
                                </button>
                                <button 
                                    className={styles.iconButton}
                                    title="Nueva Venta (Reingreso/Extensión)"
                                    onClick={() => handleReentryClick(session)}
                                >
                                    <FontAwesomeIcon icon={faRotateLeft} />
                                </button>
                                <button 
                                    className={`${styles.iconButton} ${styles.exitButton}`}
                                    title="Marcar Salida (Fin de Sesión)"
                                    onClick={() => setCheckoutChild(session)}
                                >
                                    <FontAwesomeIcon icon={faArrowRightFromBracket} />
                                </button>
                              </div>
                            </div>
                            
                            <div className={styles.sessionBody}>
                              <div className={styles.progressBarWrapper}>
                                <div className={styles.progressBarBg}>
                                  <div 
                                    className={styles.progressBarFill} 
                                    style={{ 
                                      width: `${progress}%`, 
                                      backgroundColor: remainingMinutes <= 5 ? '#ef4444' : // ROJO (Casi fin)
                                                     remainingMinutes <= 25 ? '#f97316' : // NARANJA (Mitad/Progreso)
                                                     '#3b82f6' // AZUL (Recién ingreso)
                                    }}
                                  />
                                </div>
                                <span className={styles.timeRemainingText}>{remainingMinutes}m rest. | Inicio: {session.startTime}</span>
                              </div>
                            </div>

                            {isCritical && (
                              <div className={styles.alertBadge} role="alert" aria-live="assertive">
                                <FontAwesomeIcon icon={faBell} /> 10m
                              </div>
                            )}
                            {isExpired && (
                              <div className={styles.expiredBadge} role="alert" aria-live="assertive">
                                <FontAwesomeIcon icon={faTriangleExclamation} /> EXPIRO
                              </div>
                            )}
                          </div>
                        );
                      })
                    ) : (
                      <div className={styles.emptyZone}>Sin sesiones activas</div>
                    )}

                    {totalPages > 1 && (
                      <div className={styles.pagination}>
                        <button 
                          className={styles.pageBtn} 
                          disabled={currentPage === 1}
                          onClick={() => setCurrentPages(prev => ({ ...prev, [dbArea]: currentPage - 1 }))}
                        >
                          <FontAwesomeIcon icon={faChevronLeft} />
                        </button>
                        <span className={styles.pageInfo}>{currentPage} / {totalPages}</span>
                        <button 
                          className={styles.pageBtn} 
                          disabled={currentPage === totalPages}
                          onClick={() => setCurrentPages(prev => ({ ...prev, [dbArea]: currentPage + 1 }))}
                        >
                          <FontAwesomeIcon icon={faChevronRight} />
                        </button>
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
          </div>
        ))}
      </section>

      {/* Observations Modal */}
      {selectedChild && (
        <div className={styles.modalOverlay}>
          <div className={styles.modal}>
            <div className={styles.modalHeader}>
              <h3>Incidentes y Observaciones</h3>
              <button onClick={() => setSelectedChild(null)} className={styles.closeBtn}><FontAwesomeIcon icon={faTimes} /></button>
            </div>
            <div className={styles.modalBody}>
              <p>Niño: <strong>{selectedChild.childName}</strong></p>
              <div className={styles.formGroup}>
                <label>Notas de comportamiento o incidentes:</label>
                <textarea 
                  value={obsText}
                  onChange={(e) => setObsText(e.target.value)}
                  placeholder="Ej: Se cayó, no sigue reglas, mordió a otro niño..."
                  className={styles.modalTextarea}
                />
              </div>
              <div className={styles.blacklistToggle}>
                <label className={styles.checkboxLabel}>
                  <input 
                    type="checkbox" 
                    checked={isBlacklisted}
                    onChange={(e) => setIsBlacklisted(e.target.checked)}
                  />
                  <span>⚠️ Añadir a Lista Negra (Bloquear ingresos futuros)</span>
                </label>
              </div>
            </div>
            <div className={styles.modalFooter}>
              <button onClick={() => setSelectedChild(null)} className="btn btn-ghost">Cancelar</button>
              <button 
                onClick={handleSaveObservations} 
                className={`btn ${isBlacklisted ? 'btn-danger' : 'btn-primary'}`}
              >
                Guardar Cambios
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        isOpen={!!checkoutChild}
        title="Confirmar Salida"
        message={`¿Está seguro de que desea retirar a ${checkoutChild?.childName}? Esta acción finalizará la sesión y liberará el espacio.`}
        confirmText="Confirmar Salida"
        onCancel={() => setCheckoutChild(null)}
        onConfirm={() => {
          if (checkoutChild) handleCheckout(checkoutChild.id);
          setCheckoutChild(null);
        }}
      />

      {/* Contact Modal */}
      {contactChild && (
        <div className={styles.modalOverlay}>
          <div className={styles.modal}>
            <div className={styles.modalHeader}>
              <h3>Información de Contacto</h3>
              <button onClick={() => setContactChild(null)} className={styles.closeBtn}><FontAwesomeIcon icon={faTimes} /></button>
            </div>
            <div className={styles.modalBody} style={{padding: '2rem 3rem'}}>
              <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
                <div style={{ 
                    width: '80px', 
                    height: '80px', 
                    background: 'var(--brand-50)', 
                    color: 'var(--brand-500)', 
                    borderRadius: '50%', 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center', 
                    fontSize: '2.5rem',
                    margin: '0 auto 1.5rem'
                }}>
                  <FontAwesomeIcon icon={faUser} />
                </div>
                <h2 style={{ fontSize: '1.8rem', color: '#0f172a', margin: '0 0 0.5rem 0' }}>{contactChild.tutorName}</h2>
                <div style={{ 
                    display: 'inline-flex', 
                    alignItems: 'center', 
                    gap: '0.5rem', 
                    background: '#fef3c7', 
                    color: '#92400e', 
                    padding: '0.4rem 1rem', 
                    borderRadius: '50px', 
                    fontSize: '0.85rem', 
                    fontWeight: '800' 
                }}>
                   <FontAwesomeIcon icon={faStar} /> {contactChild.tutorVisits} Visitas Acumuladas
                </div>
              </div>

              <div style={{ background: '#f8fafc', padding: '1.5rem', borderRadius: '1.2rem', border: '1px solid #e2e8f0', marginBottom: '2rem' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                          <FontAwesomeIcon icon={faBaby} />
                          <div>
                              <small style={{ display: 'block', color: '#64748b', fontSize: '0.75rem', textTransform: 'uppercase', fontWeight: '800' }}>A Cargo de</small>
                              <strong style={{ color: '#0f172a' }}>{contactChild.childName}</strong>
                          </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                          <FontAwesomeIcon icon={faPhone} />
                          <div>
                              <small style={{ display: 'block', color: '#64748b', fontSize: '0.75rem', textTransform: 'uppercase', fontWeight: '800' }}>Teléfono</small>
                              <strong style={{ color: '#0f172a' }}>{contactChild.tutorContact.replace(/(\d{3})(\d{3})(\d{4})/, '($1) $2-$3')}</strong>
                          </div>
                      </div>
                      {contactChild.tutorEmail && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                            <FontAwesomeIcon icon={faEnvelope} />
                            <div>
                                <small style={{ display: 'block', color: '#64748b', fontSize: '0.75rem', textTransform: 'uppercase', fontWeight: '800' }}>Email</small>
                                <strong style={{ color: '#0f172a' }}>{contactChild.tutorEmail}</strong>
                            </div>
                        </div>
                      )}
                  </div>
              </div>

              <p style={{ textAlign: 'center', color: '#64748b', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
                Acciones rápidas de localización:
              </p>
              
              <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
                  <button 
                    onClick={() => {
                        const cleanPhone = contactChild.tutorContact.replace(/\D/g, '');
                        const message = encodeURIComponent(`Hola ${contactChild.tutorName}, le escribimos de Mundo de Pekes. Nos comunicamos por su peke ${contactChild.childName}. Por favor acuda al área de ingreso.`);
                        window.open(`https://wa.me/52${cleanPhone}?text=${message}`, '_blank');
                        setContactChild(null);
                    }} 
                    style={{ 
                        background: '#25D366', 
                        color: 'white', 
                        flex: 1,
                        padding: '1rem', 
                        borderRadius: '12px', 
                        border: 'none', 
                        cursor: 'pointer', 
                        fontWeight: '800', 
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: 'center',
                        gap: '0.5rem',
                        boxShadow: '0 4px 12px rgba(37, 211, 102, 0.2)'
                    }}
                  >
                    WhatsApp
                  </button>
                  <button 
                    onClick={() => {
                      const cleanPhone = contactChild.tutorContact.replace(/\D/g, '');
                      window.open(`tel:${cleanPhone}`);
                      setContactChild(null);
                    }} 
                    className="btn btn-primary"
                    style={{ flex: 1, padding: '1rem', borderRadius: '12px', fontWeight: '800' }}
                  >
                    <FontAwesomeIcon icon={faPhone} /> Llamar
                  </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Expired Sessions FullWidth Toast */}
      {activeExpiredToasts.length > 0 && (
          <div className={styles.expiredAlertsContainer}>
            {activeExpiredToasts.map(session => (
                <div key={session.id} className={styles.fullWidthAlert}>
                    <div className={styles.alertMessage}>
                        <FontAwesomeIcon icon={faTriangleExclamation} /> 
                        <span>El límite de <strong>{session.childName}</strong> en <strong>{session.area}</strong> ha terminado.</span>
                    </div>
                    <div className={styles.alertActions}>
                        <button 
                            onClick={() => {
                                setDismissedExpired(prev => new Set(prev).add(session.id)); // Lo quitamos del UI primero
                                setCheckoutChild(session);
                            }} 
                            className={styles.alertCheckoutBtn}
                        >
                            <FontAwesomeIcon icon={faArrowRightFromBracket} /> Dar Salida
                        </button>
                        <button onClick={() => setDismissedExpired(prev => new Set(prev).add(session.id))} className={styles.alertDismissBtn}>
                            Ignorar por ahora
                        </button>
                    </div>
                </div>
            ))}
          </div>
      )}

      {/* Aria Live Region for Background Notifications */}
      <div className="sr-only" role="log" aria-live="polite">
        Actualización de tiempos completada. {activeExpiredToasts.length} sesiones expiradas.
      </div>
    </div>
  );
};

