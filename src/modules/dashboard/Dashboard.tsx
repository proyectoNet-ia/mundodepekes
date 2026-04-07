import React, { useState, useEffect } from 'react';
import styles from './Dashboard.module.css';
import { PrinterService } from '../../lib/printerService';
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
  faUserSlash, 
  faUser, 
  faStar, 
  faBaby, 
  faEnvelope,
  faPlus,
  faLayerGroup,
  faCloudUploadAlt,
  faLock,
  faReceipt,
  faEllipsisV
} from '@fortawesome/free-solid-svg-icons';
import { useToast } from '../../components/Toast';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { syncService } from '../../lib/syncService';
import { PresaleQueue } from './PresaleQueue';
import { confirmPresale } from '../../lib/presaleService';

const AREA_MAP: Record<string, string> = {
  'Mundo de Pekes': 'Mundo de Pekes',
  'Mundo Pekes': 'Mundo de Pekes',
  'Trampolín Park': 'Trampolín Park',
  'Trampolin Park': 'Trampolín Park',
  'Trampolín': 'Trampolín Park',
  'Trampolin': 'Trampolín Park',
  'Área Mixta': 'Área Mixta',
  'Area Mixta': 'Área Mixta',
  'Mixto': 'Área Mixta'
};

const UI_ZONES = ['Mundo de Pekes', 'Trampolín Park', 'Área Mixta'];

interface DashboardProps {
  onReentry?: (child: ActiveSession | null) => void;
  onPresale?: (data: any) => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ onReentry, onPresale }) => {
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
  const [viewPurchase, setViewPurchase] = useState<ActiveSession | null>(null);
  const [expandedSessionId, setExpandedSessionId] = useState<string | null>(null);
  const [obsText, setObsText] = useState('');
  const [isBlacklisted, setIsBlacklisted] = useState(false);
  const ITEMS_PER_PAGE = 8;
  
  // Estado para las alertas de "Toast" de pantalla completa
  const [expiredSessions, setExpiredSessions] = useState<ActiveSession[]>([]);
  const [dismissedExpired, setDismissedExpired] = useState<Set<string>>(new Set());
  
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [offlineSessions, setOfflineSessions] = useState<ActiveSession[]>([]);

  const refreshData = async () => {
    setIsRefreshing(true);
    try {
      const [active, settings] = await Promise.all([
        getActiveSessions(),
        getSystemSettings()
      ]);
      setSessions(active);
      setLimits(settings);
      setLastRefreshed(new Date());
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    // Solicitar permisos de notificación nativa
    if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
    }

    refreshData();
    
    // Sincronización Realtime con Supabase
    const subscription = subscribeToSessions(() => {
      refreshData();
    });

    // Reloj: actualiza cada 30s
    const clockTimer = setInterval(() => {
      setCurrentTime(new Date());
    }, 30000);

    const pollTimer = setInterval(() => { refreshData(); }, 45000);

    const handleSyncChange = async () => {
        const pending = await syncService.getPendingItems();
        console.log(`🧐 [Monitor] Items en cola de sincronización:`, pending.length);
        const off: any[] = [];
        pending.forEach(item => {
            if (item.type === 'sale') {
                item.data.children.forEach((c: any, idx: number) => {
                    const startTime = new Date(item.timestamp);
                    const endTime = new Date(startTime.getTime() + (c.duration || 60) * 60000);
                    off.push({
                        id: `off-${item.id}-${idx}`,
                        childId: `off-${item.id}-${idx}`,
                        childName: c.name,
                        area: c.area,
                        startTime: startTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                        endTime: endTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                        rawStartTime: startTime,
                        rawEndTime: endTime,
                        tutorContact: item.data.customer?.phone || '',
                        tutorName: item.data.customer?.name || '',
                        isOffline: true,
                    });
                });
            }
        });
        setOfflineSessions(off);
    };

    const handleSyncSuccess = (item: any) => {
        if (item.type === 'sale') {
            showToast(`Registro de ${item.data.customer?.name} sincronizado con éxito.`, 'success', 'Base de Datos');
            refreshData();
        } else if (item.type === 'inventory_sale') {
            showToast(`Venta de inventario sincronizada.`, 'success', 'Base de Datos');
        }
    };

    const unsubSync = syncService.onChange(handleSyncChange);
    const unsubSuccess = syncService.onSyncSuccess(handleSyncSuccess);

    return () => {
      subscription.unsubscribe();
      clearInterval(clockTimer);
      clearInterval(pollTimer);
      unsubSync();
      unsubSuccess();
    };
  }, []);

  // Motor detector de expiración (Actualiza el listado de Toasts)
  useEffect(() => {
    const allActive = [...sessions, ...offlineSessions];
    const expired = allActive.filter(session => {
        const now = currentTime.getTime();
        const end = session.rawEndTime.getTime();
        return Math.max(0, Math.round((end - now) / 60000)) <= 0;
    });
    setExpiredSessions(expired);
  }, [currentTime, sessions, offlineSessions]);

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

  // Áreas reconocidas por el sistema
  const KNOWN_AREAS = Object.keys(AREA_MAP); // ['Mundo Pekes', 'Trampolin', 'Mixto']

  const allSessions = [...sessions, ...offlineSessions];

  // Total real: solo sesiones en áreas conocidas, sin duplicados por childId
  const visibleSessions = allSessions.filter(s => KNOWN_AREAS.includes(s.area));
  const uniqueChildIds = new Set(visibleSessions.map(s => s.childId));
  const totalEnRecinto = uniqueChildIds.size;

  // Occupancy Logic (Mixed counts for both areas)
  const countMundo = allSessions.filter(s => AREA_MAP[s.area] === 'Mundo de Pekes' || AREA_MAP[s.area] === 'Área Mixta').length;
  const countTrampolin = allSessions.filter(s => AREA_MAP[s.area] === 'Trampolín Park' || AREA_MAP[s.area] === 'Área Mixta').length;
  const countMixta = allSessions.filter(s => AREA_MAP[s.area] === 'Área Mixta').length;

  const normalizeText = (text: string) => 
    text ? text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase() : "";

  const activeExpiredToasts = expiredSessions.filter(s => !dismissedExpired.has(s.id));

  // Estado para la pestaña activa de estadísticas en móvil
  const [activeStatTab, setActiveStatTab] = useState<'totales' | 'pekes' | 'trampolin' | 'mixta'>('totales');

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
                const resetPages = UI_ZONES.reduce((acc, zone) => ({ ...acc, [zone]: 1 }), {});
                setCurrentPages(resetPages);
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
          
          <div className={styles.headerActions}>
            {/* Indicador de actualización en tiempo real */}
            <div className={styles.liveIndicator} title={`Actualizado: ${lastRefreshed.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`}>
              <span className={`${styles.liveDot} ${isRefreshing ? styles.liveDotRefreshing : ''}`} />
              <span className={styles.liveText}>{isRefreshing ? 'En Vivo' : 'En Vivo'}</span>
            </div>
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
                <button 
                    className={`${styles.statsTabBtn} ${activeStatTab === 'mixta' ? styles.statsTabBtnActive : ''}`} 
                    onClick={() => setActiveStatTab('mixta')}
                >
                    <FontAwesomeIcon icon={faLayerGroup} /> Área Mixta
                </button>
            </div>
            
            <div className={styles.statsOverview}>
                <div className={`${styles.statCard} ${activeStatTab === 'totales' ? styles.activeStatCard : styles.hiddenStatCard}`}>
                    <span className={styles.statLabel}>
                    <FontAwesomeIcon icon={faUsers} className={styles.iconMargin} /> Total en Recinto
                    </span>
                    <span className={styles.statValue}>{totalEnRecinto}</span>
                    <p style={{fontSize: '0.75rem', color: 'var(--text-tertiary)', marginBottom: '1rem'}}>Niños activos actualmente</p>
                    <button className={styles.newEntryBtnCard} onClick={() => onReentry?.(null)}>
                      <FontAwesomeIcon icon={faPlus} />
                      <span>NUEVO INGRESO</span>
                    </button>
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

                <div className={`${styles.statCard} ${activeStatTab === 'mixta' ? styles.activeStatCard : styles.hiddenStatCard}`}>
                    <span className={styles.statLabel}>
                    <FontAwesomeIcon icon={faLayerGroup} className={styles.iconMargin} /> Área Mixta
                    </span>
                    <span className={styles.statValue}>{countMixta}</span>
                    <div className={styles.capacityIndicator}>
                        <div className={styles.capacityText}>
                            <span>Sesiones Activas</span>
                            <span>Acceso Total</span>
                        </div>
                        <div className={styles.capacityBarBg}>
                            <div 
                                className={styles.capacityBarFill} 
                                style={{ 
                                    width: '100%',
                                    backgroundColor: '#0ea5e9'
                                }} 
                            />
                        </div>
                        <small style={{fontSize: '0.65rem'}}>Área de juego sin restricciones</small>
                    </div>
                </div>
            </div>
        </div>
      </header>

      {/* Cola de Preventas del Portal Público */}
      <PresaleQueue
        onExecute={async (presaleData) => {
          // Marcar preventa como confirmada en BD
          try { await confirmPresale(presaleData.presaleId); } catch {}
          // Pre-cargar el SalesEngine con los datos del cliente
          if (onPresale) {
            onPresale({
              tutorNombre: presaleData.tutorNombre,
              tutorTelefono: presaleData.tutorTelefono,
              tutorEmail: presaleData.tutorEmail,
              ninos: presaleData.ninos,
              presaleId: presaleData.presaleId,
              total: presaleData.total,
            });
          }
        }}
      />

      <section className={styles.zonesGrid}>
        {UI_ZONES.map(uiArea => (
          <div key={uiArea} className={styles.zoneSection}>
            <div className={styles.zoneHeader}>
              <h3 className={styles.zoneTitle}>{uiArea}</h3>
              <span className={styles.zoneCount}>
                {new Set(sessions.filter(s => AREA_MAP[s.area] === uiArea).map(s => s.childId)).size} niños
              </span>
            </div>
            
            <div className={styles.sessionGrid}>
              {(() => {
                const areaSessionsRaw = allSessions.filter(s => AREA_MAP[s.area] === uiArea);
                const uniqueKids = new Map();
                areaSessionsRaw.forEach(s => {
                    // Si ya existe una sesión activa para este niño, mantenemos la que tenga el ID más reciente o mayor duración (o simplemente la primera que encontremos ya que salesService ahora limpia las viejas)
                    if (!uniqueKids.has(s.childId)) {
                        uniqueKids.set(s.childId, s);
                    }
                });

                const areaSessions = Array.from(uniqueKids.values())
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
                const currentPage = currentPages[uiArea] || 1;
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
                            <div className={styles.sessionHeader} style={{ position: 'relative' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                                <span className={`${styles.kidName} ${session.enListaNegra ? styles.blacklistedName : ''}`}>
                                    {session.enListaNegra && <FontAwesomeIcon icon={faUserSlash} className={styles.blacklistIcon} title="Lista Negra" />}
                                    {session.childName}
                                    {session.area === 'Mixto' && <span className={styles.mixedBadge}>MIX</span>}
                                </span>
                                
                                <button 
                                    className={`${styles.iconButton} ${expandedSessionId === session.id ? styles.expanded : ''}`}
                                    onClick={() => setExpandedSessionId(expandedSessionId === session.id ? null : session.id)}
                                >
                                    <FontAwesomeIcon icon={faEllipsisV} style={{ color: 'var(--text-secondary)' }} size="lg" />
                                </button>
                              </div>

                              {expandedSessionId === session.id && (
                                <div className={styles.floatingActions}>
                                    <button 
                                        className={styles.iconButton}
                                        title={`Observaciones / Incidentes`}
                                        onClick={() => { openObsModal(session); setExpandedSessionId(null); }}
                                    >
                                        <FontAwesomeIcon icon={faLock} color={session.observaciones ? 'var(--warning)' : 'inherit'} />
                                    </button>
                                    <button 
                                        className={styles.iconButton}
                                        title={`Última Compra`}
                                        onClick={() => { setViewPurchase(session); setExpandedSessionId(null); }}
                                    >
                                        <FontAwesomeIcon icon={faReceipt} />
                                    </button>
                                    <button 
                                        className={styles.iconButton}
                                        title={`Contactar Tutor`}
                                        onClick={() => { setContactChild(session); setExpandedSessionId(null); }}
                                    >
                                        <FontAwesomeIcon icon={faPhone} />
                                    </button>
                                    <button 
                                        className={styles.iconButton}
                                        title="Nueva Venta"
                                        onClick={() => { handleReentryClick(session); setExpandedSessionId(null); }}
                                    >
                                        <FontAwesomeIcon icon={faRotateLeft} />
                                    </button>
                                    <button 
                                        className={`${styles.iconButton} ${styles.exitButton}`}
                                        title="Salida"
                                        onClick={() => { setCheckoutChild(session); setExpandedSessionId(null); }}
                                    >
                                        <FontAwesomeIcon icon={faArrowRightFromBracket} />
                                    </button>
                                </div>
                              )}
                            </div>
                            
                            {(session as any).isOffline && (
                                <div className={styles.offlineSessionOverlay}>
                                    <FontAwesomeIcon icon={faCloudUploadAlt} spin />
                                    <span>PENDIENTE</span>
                                </div>
                            )}

                            <div className={styles.sessionBody}>
                              <div className={styles.progressBarWrapper}>
                                <div className={styles.progressBarBg}>
                                  <div 
                                    className={styles.progressBarFill} 
                                    style={{ 
                                      width: `${progress}%`, 
                                      backgroundColor: remainingMinutes <= 5 ? '#ef4444' :
                                                     remainingMinutes <= 25 ? '#f97316' :
                                                     '#3b82f6'
                                    }}
                                  />
                                </div>
                                <span className={styles.timeRemainingText}>
                                    {remainingMinutes <= 0 ? '0m' : (remainingMinutes >= 60 ? `${Math.floor(remainingMinutes / 60)}h ${remainingMinutes % 60}m` : `${remainingMinutes}m`)} rest. | Inicio: {session.startTime} | Fin: {session.endTime}
                                </span>
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
                          onClick={() => setCurrentPages(prev => ({ ...prev, [uiArea]: currentPage - 1 }))}
                        >
                          <FontAwesomeIcon icon={faChevronLeft} />
                        </button>
                        <span className={styles.pageInfo}>{currentPage} / {totalPages}</span>
                        <button 
                          className={styles.pageBtn} 
                          disabled={currentPage === totalPages}
                          onClick={() => setCurrentPages(prev => ({ ...prev, [uiArea]: currentPage + 1 }))}
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
      {contactChild && (() => {
          const phones = (contactChild.tutorContact || '').split(',').map(p => p.trim());
          const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
          
          const formatPhone = (p: string) => {
              const clean = p.replace(/\D/g, '');
              if (clean.length === 10) return `(${clean.slice(0,3)}) ${clean.slice(3,6)}-${clean.slice(6)}`;
              return p; // original if not 10 digits
          };

          return (
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
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                              <FontAwesomeIcon icon={faBaby} style={{ color: 'var(--brand-500)' }} />
                              <div>
                                  <small style={{ display: 'block', color: '#64748b', fontSize: '0.75rem', textTransform: 'uppercase', fontWeight: '800' }}>A Cargo de</small>
                                  <strong style={{ color: '#0f172a' }}>{contactChild.childName}</strong>
                              </div>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem' }}>
                              <FontAwesomeIcon icon={faPhone} style={{ color: 'var(--brand-500)', marginTop: '4px' }} />
                              <div style={{ width: '100%' }}>
                                  <small style={{ display: 'block', color: '#64748b', fontSize: '0.75rem', textTransform: 'uppercase', fontWeight: '800', marginBottom: '4px' }}>Teléfonos de Contacto</small>
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                    {phones.map((p, idx) => (
                                        <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <strong style={{ color: '#0f172a' }}>{formatPhone(p)}</strong>
                                            {idx === 0 && <span style={{ fontSize: '0.65rem', background: 'var(--brand-100)', color: 'var(--brand-600)', padding: '2px 6px', borderRadius: '4px', fontWeight: '800' }}>PRINCIPAL</span>}
                                        </div>
                                    ))}
                                  </div>
                              </div>
                          </div>
                          {contactChild.tutorEmail && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                <FontAwesomeIcon icon={faEnvelope} style={{ color: 'var(--brand-500)' }} />
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
                            const cleanPhone = phones[0].replace(/\D/g, ''); // Usa el principal
                            const message = encodeURIComponent(`Hola ${contactChild.tutorName}, le escribimos de Mundo de Pekes. Nos comunicamos por su peke ${contactChild.childName}. Por favor acuda al área de ingreso.`);
                            
                            if (isMobile) {
                                window.open(`https://wa.me/52${cleanPhone}?text=${message}`, '_blank');
                            } else {
                                // En escritorio, intentar abrir directamente WhatsApp Web para ser más fluido
                                window.open(`https://web.whatsapp.com/send?phone=52${cleanPhone}&text=${message}`, '_blank');
                            }
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
                      {isMobile && (
                        <button 
                            onClick={() => {
                                const cleanPhone = phones[0].replace(/\D/g, '');
                                window.open(`tel:${cleanPhone}`);
                                setContactChild(null);
                            }} 
                            className="btn btn-primary"
                            style={{ flex: 1, padding: '1rem', borderRadius: '12px', fontWeight: '800' }}
                        >
                            <FontAwesomeIcon icon={faPhone} /> Llamar
                        </button>
                      )}
                  </div>
                </div>
              </div>
            </div>
          );
      })()}

      {/* Vista de Venta Modal */}
      {viewPurchase && (
        <div className={styles.modalOverlay}>
          <div className={styles.modal} style={{ maxWidth: '400px' }}>
            <div className={styles.modalHeader}>
              <h3>Detalle de Venta</h3>
              <button onClick={() => setViewPurchase(null)} className={styles.closeBtn}><FontAwesomeIcon icon={faTimes} /></button>
            </div>
            <div className={styles.modalBody} style={{ padding: '1.5rem' }}>
              <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
                <FontAwesomeIcon icon={faReceipt} style={{ fontSize: '2.5rem', color: 'var(--brand-500)', marginBottom: '1rem' }} />
                <h2 style={{ fontSize: '1.4rem', margin: 0 }}>{viewPurchase.packageName}</h2>
                <div style={{ 
                  display: 'inline-block', 
                  marginTop: '0.5rem',
                  padding: '0.25rem 0.75rem', 
                  background: 'var(--bg-tertiary)', 
                  borderRadius: '100px',
                  fontSize: '0.9rem', 
                  fontWeight: '800',
                  color: 'var(--text-secondary)',
                  border: '1px solid var(--border-color)'
                }}>
                  FOLIO: #{viewPurchase.transaccionFolio}
                </div>
              </div>
              
              <div style={{ background: 'var(--bg-tertiary)', borderRadius: '12px', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-secondary)', fontWeight: '700' }}>Monto Pagado:</span>
                  <strong style={{ fontSize: '1.1rem', color: 'var(--brand-600)' }}>${viewPurchase.transaccionTotal?.toFixed(2)}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-secondary)', fontWeight: '700' }}>Método de Pago:</span>
                  <strong>{viewPurchase.metodoPago}</strong>
                </div>
                
                <div style={{ borderTop: '1px dashed var(--border-color)', margin: '0.5rem 0' }}></div>
                
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-secondary)', fontWeight: '700' }}>Zona:</span>
                  <strong>{viewPurchase.area}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-secondary)', fontWeight: '700' }}>Paquete:</span>
                  <strong>{viewPurchase.packageName}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-secondary)', fontWeight: '700' }}>Duración:</span>
                  <span style={{ fontWeight: '800' }}>
                    {(viewPurchase as any).duracion_minutos ? (Math.floor((viewPurchase as any).duracion_minutos / 60) > 0 ? `${Math.floor((viewPurchase as any).duracion_minutos / 60)}h ${(viewPurchase as any).duracion_minutos % 60}m` : `${(viewPurchase as any).duracion_minutos}m`) : '--'}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-secondary)', fontWeight: '700' }}>Entrada:</span>
                  <strong>{viewPurchase.startTime}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#dc2626', fontWeight: '800' }}>
                  <span>Salida Limite:</span>
                  <strong>{viewPurchase.endTime}</strong>
                </div>

                <div style={{ borderTop: '1px dashed var(--border-color)', margin: '0.5rem 0' }}></div>

                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-secondary)', fontWeight: '700' }}>Peke:</span>
                  <strong>{viewPurchase.childName}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-secondary)', fontWeight: '700' }}>Tutor:</span>
                  <strong>{viewPurchase.tutorName}</strong>
                </div>
              </div>
              
              <footer style={{ marginTop: '1.5rem', textAlign: 'center', fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
                Venta realizada el {viewPurchase.startTime}
              </footer>
            </div>
            <div className={styles.modalFooter} style={{ flexDirection: 'column', gap: '0.8rem' }}>
              <div style={{ display: 'flex', gap: '0.8rem', width: '100%' }}>
                <button 
                  onClick={() => {
                    if (!viewPurchase) return;
                    const ticketData = {
                      folio: viewPurchase.transaccionFolio || 'REIMPRESION',
                      cliente: viewPurchase.tutorName,
                      telefono: viewPurchase.tutorContact,
                      items: [{
                        nino: viewPurchase.childName,
                        nombre: viewPurchase.packageName,
                        precio: viewPurchase.transaccionTotal || 0,
                        duracion: (viewPurchase as any).duracion_minutos || 0,
                        hora_entrada: viewPurchase.startTime,
                        hora_salida: viewPurchase.endTime
                      }],
                      total: viewPurchase.transaccionTotal || 0,
                      subtotal: (viewPurchase.transaccionTotal || 0) / 1.16,
                      iva: (viewPurchase.transaccionTotal || 0) - ((viewPurchase.transaccionTotal || 0) / 1.16),
                      mensaje: "*** REIMPRESION DE TICKET ***"
                    };
                    const content = PrinterService.formatEpsonTicket(ticketData as any);
                    PrinterService.printRaw(content, 'EPSON');
                    showToast('Ticket enviado a cola de impresión.', 'success');
                  }}
                  className="btn btn-ghost" 
                  style={{ flex: 1, borderColor: 'var(--border-color)' }}
                >
                  <FontAwesomeIcon icon={faReceipt} style={{ marginRight: '8px' }} />
                  Ticket
                </button>
                <button 
                  onClick={() => {
                    if (!viewPurchase) return;
                    const wristbandData = {
                      nino: viewPurchase.childName,
                      folio: viewPurchase.transaccionFolio || '',
                      area: viewPurchase.area,
                      duracion: (viewPurchase as any).duracion_minutos || 0,
                      horaEntrada: viewPurchase.startTime,
                      horaSalida: viewPurchase.endTime,
                      paquete: viewPurchase.packageName,
                      idPeke: viewPurchase.childId || '',
                    };
                    const content = PrinterService.formatZebraWristband(wristbandData);
                    PrinterService.printRaw(content, 'ZEBRA');
                    showToast('Pulsera enviada a impresora Zebra.', 'success');
                  }}
                  className="btn btn-ghost"
                  style={{ flex: 1, borderColor: 'var(--border-color)' }}
                >
                  <FontAwesomeIcon icon={faRotateLeft} style={{ marginRight: '8px' }} />
                  Pulsera
                </button>
              </div>
              <button onClick={() => setViewPurchase(null)} className="btn btn-primary" style={{ width: '100%' }}>Cerrar</button>
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

