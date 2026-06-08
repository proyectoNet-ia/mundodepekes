import React, { useState, useEffect } from 'react';
import styles from './Dashboard.module.css';
import { PrinterService } from '../../lib/printerService';
import { getActiveSessions, finishSession, updateChildInfo, getActivePrivateEvents, addChildToPrivateEvent, getScheduledPrivateEventsCount, archivePackage, getTotalChildrenToday, type ActiveSession } from '../../lib/sessionService';
import { getSystemSettings } from '../../lib/settingsService';
import { birthdayService } from '../../lib/birthdayService';
import { getPackages } from '../../lib/packageService';
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
  faEllipsisV,
  faBirthdayCake,
  faSync
} from '@fortawesome/free-solid-svg-icons';
import { faWhatsapp } from '@fortawesome/free-brands-svg-icons';
import { useToast } from '../../components/Toast';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { syncService } from '../../lib/syncService';
import { PresaleQueue } from './PresaleQueue';
import { confirmPresale } from '../../lib/presaleService';
import { getActiveSession, getShiftProductsSoldSummary } from '../../lib/treasuryService';

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

const formatDisplayPhone = (rawPhone: string): string => {
  if (!rawPhone) return '';
  if (rawPhone.includes(',')) {
    return rawPhone
      .split(',')
      .map(p => formatDisplayPhone(p.trim()))
      .filter(Boolean)
      .join(', ');
  }

  const digits = rawPhone.replace(/\D/g, '');
  if (!digits) return rawPhone;

  // Caso de doble LADA de México (ej. 52523521645089 -> 14 dígitos)
  if (digits.startsWith('5252') && digits.length === 14) {
    const phone = digits.substring(4);
    return `+52 (${phone.substring(0, 3)}) ${phone.substring(3, 6)}-${phone.substring(6)}`;
  }

  // Caso de LADA México normal (ej. 523521253235 -> 12 dígitos)
  if (digits.startsWith('52') && digits.length === 12) {
    const phone = digits.substring(2);
    return `+52 (${phone.substring(0, 3)}) ${phone.substring(3, 6)}-${phone.substring(6)}`;
  }

  // Caso de LADA US normal (ej. 13521253235 -> 11 dígitos)
  if (digits.startsWith('1') && digits.length === 11) {
    const phone = digits.substring(1);
    return `+1 (${phone.substring(0, 3)}) ${phone.substring(3, 6)}-${phone.substring(6)}`;
  }

  if (digits.length === 10) {
    return `(${digits.substring(0, 3)}) ${digits.substring(3, 6)}-${digits.substring(6)}`;
  }

  return rawPhone;
};

const getProductIconAndColor = (nombre: string) => {
  const norm = nombre.toLowerCase();
  if (norm.includes('calcet') || norm.includes('sock') || norm.includes('media')) {
    return { icon: '🧦', color: '#6ee7b7' };
  }
  if (norm.includes('agua') || norm.includes('ciel') || norm.includes('bonafont') || norm.includes('epura')) {
    return { icon: '💧', color: '#60a5fa' };
  }
  if (norm.includes('coca') || norm.includes('fanta') || norm.includes('sprite') || norm.includes('mundet') || norm.includes('sidral') || norm.includes('pepsi') || norm.includes('lata') || norm.includes('refresco')) {
    return { icon: '🥤', color: '#fca5a5' };
  }
  if (norm.includes('papas') || norm.includes('churrum') || norm.includes('sabrita') || norm.includes('papar') || norm.includes('snack') || norm.includes('popcorn') || norm.includes('palomita') || norm.includes('chip') || norm.includes('m&m') || norm.includes('chocolate') || norm.includes('dulce')) {
    return { icon: '🍿', color: '#fde047' };
  }
  return { icon: '📦', color: '#cbd5e1' };
};

interface DashboardProps {
  onReentry?: (child: ActiveSession | null) => void;
  onPresale?: (data: any) => void;
  onManageBirthday?: (birthdayId: string) => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ onReentry, onPresale, onManageBirthday }) => {
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
  const [privateEvents, setPrivateEvents] = useState<any[]>([]);
  const [cumpleanosActivos, setCumpleanosActivos] = useState<any[]>([]);
  const [paquetesDisponibles, setPaquetesDisponibles] = useState<any[]>([]);
  const [totalChildrenToday, setTotalChildrenToday] = useState<{ total: number; unique: number }>({ total: 0, unique: 0 });
  const [shiftProducts, setShiftProducts] = useState<any[]>([]);
  const [presaleRefreshTrigger, setPresaleRefreshTrigger] = useState(0);

  // Estado del modal para agregar peke a un evento privado
  const [addToEventModal, setAddToEventModal] = useState<{ transaccionId: string; packageId: string; area: string; tutorId: string; eventEndTime: Date; packageName: string; } | null>(null);
  const [newPekeName, setNewPekeName] = useState('');

  const refreshData = async () => {
    setIsRefreshing(true);
    try {
      const [active, settings, privEvents, sCount, todayCount, cumples, paquetes] = await Promise.all([
        getActiveSessions(),
        getSystemSettings(),
        getActivePrivateEvents(),
        getScheduledPrivateEventsCount(),
        getTotalChildrenToday(),
        birthdayService.getAgendadosYEnCurso(),
        getPackages(true)
      ]);
      setSessions(active);
      setLimits(settings);
      setPrivateEvents(privEvents);
      setScheduledCount(sCount);
      setTotalChildrenToday(todayCount);
      const todayVal = new Date();
      const todayStr = `${todayVal.getFullYear()}-${String(todayVal.getMonth() + 1).padStart(2, '0')}-${String(todayVal.getDate()).padStart(2, '0')}`;
      setCumpleanosActivos(cumples.filter(c => 
          c.estado === 'en_curso' || 
          (c.estado === 'agendado' && c.fecha_evento === todayStr)
      ));
      setPaquetesDisponibles(paquetes);
      setLastRefreshed(new Date());

      // Obtener productos vendidos durante el corte activo
      try {
        const activeSession = await getActiveSession();
        if (activeSession && activeSession.fecha_apertura) {
          const prodSummary = await getShiftProductsSoldSummary(activeSession.fecha_apertura);
          setShiftProducts(prodSummary);
        } else {
          setShiftProducts([]);
        }
      } catch (err) {
        console.error('Error fetching shift products sold summary:', err);
      }

      // Auto-archivado de paquetes de eventos terminados y vacíos
      const now = new Date();
      privEvents.forEach(event => {
          const hasExpired = event.event_end_time ? now > new Date(event.event_end_time) : false;
          const hasKidsInside = active.some(s => s.transaccionId === event.id);
          if (hasExpired && !hasKidsInside && event.paquete_id) {
              archivePackage(event.paquete_id);
          }
      });
      setPresaleRefreshTrigger(prev => prev + 1);
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
    
    // Sincronización Realtime con Supabase (DESACTIVADO PARA AHORRAR EGRESS)
    // const subscription = subscribeToSessions(() => {
    //   refreshData();
    // });

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
      // subscription.unsubscribe();
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

  const handleCheckout = async (sessionId: string) => {
    try {
      await finishSession(sessionId);
      refreshData();
      showToast('Sesión finalizada con éxito.', 'success');
    } catch (err) {
      showToast('Error al finalizar sesión.', 'error');
    }
  };

  const handleIniciarBirthdayDirecto = async (id: string) => {
    if (!window.confirm('¿Seguro que deseas iniciar el evento de cumpleaños ahora? Empezará a correr el tiempo.')) return;
    try {
      await birthdayService.cambiarEstado(id, 'en_curso');
      showToast('Cumpleaños iniciado correctamente', 'success');
      refreshData();
    } catch (err) {
      console.error(err);
      showToast('Error al iniciar el cumpleaños', 'error');
    }
  };

  const allSessions = [...sessions, ...offlineSessions];

  // 1. Obtener eventos de Supabase
  const onlinePrivateGroups = privateEvents.map(event => {
      const eventSessions = allSessions.filter(s => s.transaccionId === event.id);
      return {
          transaccionId: event.id,
          tutorName: event.cliente?.nombre || 'Tutor',
          tutorId: event.cliente?.id,
          tutorPhone: event.cliente?.telefono,
          packageName: event.paquete?.nombre || 'Evento Privado',
          packageId: event.paquete_id,
          guestLimit: event.limite_invitados || 0,
          area: event.paquete?.area || 'Mundo de Pekes',
          duration: event.paquete?.duracion_minutos || 60,
          eventStartTime: event.event_start_time ? new Date(event.event_start_time) : null,
          eventEndTime: event.event_end_time ? new Date(event.event_end_time) : null,
          sessions: eventSessions,
          isOffline: false,
          isCumpleanos: false
      };
  });

  const cumpleanosGroups = cumpleanosActivos.map(ev => {
      const paquete = (ev.paquete_id ? paquetesDisponibles.find(p => p.id === ev.paquete_id) : null) || 
                      paquetesDisponibles.find(p => p.precio === ev.precio_por_nino);
      const [year, month, day] = ev.fecha_evento.split('-');
      const [h, m] = ev.hora_inicio.split(':');
      const start = new Date(parseInt(year), parseInt(month) - 1, parseInt(day), parseInt(h), parseInt(m));
      const duracion = paquete?.duracion_minutos || 120;
      const end = new Date(start.getTime() + duracion * 60000);
      
      const endMins = parseInt(h) * 60 + parseInt(m) + duracion;
      const endH = Math.floor(endMins / 60);
      const endM = endMins % 60;
      const horaFin = `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;

      return {
          transaccionId: ev.id,
          tutorName: ev.nombre_cliente || 'Cliente',
          tutorId: undefined,
          tutorPhone: ev.telefono_cliente,
          packageName: paquete?.nombre || 'Cumpleaños',
          packageId: paquete?.id,
          guestLimit: 0,
          area: paquete?.area || 'Mundo de Pekes',
          duration: duracion,
          eventStartTime: start,
          eventEndTime: end,
          sessions: [],
          isOffline: false,
          isCumpleanos: true,
          estado: ev.estado,
          nombreFestejado: ev.nombre_festejado,
          anticipoPagado: ev.anticipo_pagado,
          precioPorNino: ev.precio_por_nino,
          horaInicio: ev.hora_inicio,
          horaFin: horaFin
      };
  });

  // 2. Obtener eventos pendientes en la cola offline (syncService)
  // Necesitamos buscar en la cola de sincronización
  const [offlinePrivateEvents, setOfflinePrivateEvents] = useState<any[]>([]);
  
  useEffect(() => {
    const fetchOfflinePrivate = async () => {
        const pending = await syncService.getPendingItems();
        const offPrivates = pending
            .filter(item => item.type === 'sale' && item.data.esPrivado)
            .map(item => ({
                transaccionId: `off-${item.id}`,
                tutorName: item.data.customer?.name || 'Tutor',
                tutorId: item.data.customer?.id,
                packageName: 'Paquete Privado', // El nombre real está en availablePackages, pero simplificamos
                packageId: item.data.paquete_id,
                area: 'Mundo de Pekes',
                duration: 60,
                eventStartTime: null,
                eventEndTime: null,
                sessions: [],
                isOffline: true
            }));
        setOfflinePrivateEvents(offPrivates);
    };
    fetchOfflinePrivate();
  }, [isRefreshing]);

  const privateEventGroups = [...onlinePrivateGroups, ...cumpleanosGroups, ...offlinePrivateEvents];

  const allSessionsShown = allSessions.filter(s => !privateEventGroups.some(p => p.transaccionId === s.transaccionId));


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
            tutorName: session.tutorName || 'Tutor',
            isReentry: true
        });
    }
  };

  // Áreas reconocidas por el sistema
  const KNOWN_AREAS = Object.keys(AREA_MAP); // ['Mundo Pekes', 'Trampolin', 'Mixto']



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
  const [scheduledCount, setScheduledCount] = useState(0);
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
            <button 
              className={styles.refreshBtn} 
              onClick={refreshData} 
              disabled={isRefreshing}
              title="Actualizar registros del portal"
            >
              <FontAwesomeIcon icon={faSync} spin={isRefreshing} />
              <span>{isRefreshing ? 'Actualizando...' : 'Refrescar'}</span>
            </button>
            {/* Indicador de actualización en tiempo real */}
            <div className={styles.liveIndicator} title={`Actualizado: ${lastRefreshed.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`}>
              <span className={`${styles.liveDot} ${isRefreshing ? styles.liveDotRefreshing : ''}`} />
              <span className={styles.liveText}>En Vivo</span>
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
                      <div style={{ display: 'grid', gridTemplateColumns: scheduledCount > 0 ? '1fr 1fr' : '1fr', gap: '0.6rem', marginTop: '0.5rem' }}>
                          {scheduledCount > 0 && (
                            <button 
                                className={styles.actionPill} 
                                style={{ background: 'linear-gradient(135deg, #d97706, #b45309)' }}
                                onClick={() => onReentry?.({ isPrivateEvent: true } as any)}
                            >
                                <FontAwesomeIcon icon={faBirthdayCake} />
                                <span>Evento Privado</span>
                            </button>
                          )}
                          <button 
                            className={styles.actionPill} 
                            style={{ background: 'linear-gradient(135deg, #1e40af, #1e3a8a)' }} 
                            onClick={() => onReentry?.(null)}
                          >
                              <FontAwesomeIcon icon={faPlus} />
                              <span>Nuevo Ingreso</span>
                          </button>
                      </div>
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

        {/* ─── Bloque: Total Ingresos del Día ─── */}
        <div className={styles.todayCounterBanner} style={{ flexDirection: 'column', alignItems: 'stretch', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', flexWrap: 'wrap', width: '100%' }}>
            <div className={styles.todayCounterIcon}>👦</div>
            <div className={styles.todayCounterBody}>
              <span className={styles.todayCounterLabel}>Ingresos del día</span>
              <span className={styles.todayCounterValue}>{totalChildrenToday.total}</span>
            </div>
            <div className={styles.todayCounterStats}>
              <div className={styles.todayCounterStatItem}>
                <span className={styles.todayCounterStatNum}>{totalChildrenToday.unique}</span>
                <span className={styles.todayCounterStatLabel}>niños únicos</span>
              </div>
              <div className={styles.todayCounterDivider} />
              <div className={styles.todayCounterStatItem}>
                <span className={styles.todayCounterStatNum}>{totalChildrenToday.total - totalChildrenToday.unique}</span>
                <span className={styles.todayCounterStatLabel}>reingresos</span>
              </div>
            </div>
          </div>

          {/* ─── Fila Secundaria: Productos vendidos en el corte ─── */}
          {shiftProducts.length > 0 && (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '0.6rem',
              paddingTop: '0.8rem',
              borderTop: '1px dashed rgba(255, 255, 255, 0.25)',
              width: '100%'
            }}>
              <span style={{
                fontSize: '0.68rem',
                fontWeight: 800,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                color: 'rgba(255, 255, 255, 0.85)'
              }}>
                🛍️ Productos vendidos en el corte activo:
              </span>
              <div style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: '0.8rem 1.2rem',
                alignItems: 'center'
              }}>
                {shiftProducts.map((prod, index) => {
                  const ui = getProductIconAndColor(prod.nombre);
                  return (
                    <React.Fragment key={prod.nombre}>
                      {index > 0 && (
                        <div style={{
                          width: '1px',
                          height: '1.2rem',
                          backgroundColor: 'rgba(255, 255, 255, 0.2)'
                        }} />
                      )}
                      <div className={styles.todayCounterStatItem} style={{ alignItems: 'flex-start' }}>
                        <span className={styles.todayCounterStatNum} style={{ color: ui.color, display: 'flex', alignItems: 'center', gap: '4px' }}>
                          {ui.icon} {prod.cantidad}
                        </span>
                        <span className={styles.todayCounterStatLabel} style={{ textTransform: 'none', letterSpacing: 'normal', color: 'rgba(255,255,255,0.7)' }}>
                          {prod.nombre}
                        </span>
                      </div>
                    </React.Fragment>
                  );
                })}
              </div>
            </div>
          )}
        </div>

      </header>

      {/* Cola de Preventas del Portal Público */}
      <PresaleQueue
        refreshTrigger={presaleRefreshTrigger}
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

      {/* 🚨 SECCIÓN DE TIEMPOS EXCEDIDOS */}
      {expiredSessions.length > 0 && (
        <section className={styles.expiredBannerSection}>
           <div className={styles.expiredBannerHeader}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <FontAwesomeIcon icon={faTriangleExclamation} className={styles.expiredBannerIcon} />
                <div>
                  <h2 className={styles.expiredBannerTitle}>Pekes con Tiempo Excedido ({expiredSessions.length})</h2>
                  <span className={styles.expiredBannerSubtitle}>Se recomienda dar salida o contactar al tutor inmediatamente.</span>
                </div>
              </div>
           </div>
           <div className={styles.expiredBannerGrid}>
              {expiredSessions.map(session => (
                <div key={session.id} className={styles.expiredMiniCard}>
                   <div className={styles.expiredMiniInfo}>
                      <span className={styles.expiredMiniName}>{session.childName}</span>
                      <div className={styles.expiredMiniMeta}>
                        <span className={styles.expiredMiniTime}>
                          Excedido: <strong>{Math.abs(Math.round((currentTime.getTime() - session.rawEndTime.getTime()) / 60000))}m</strong>
                        </span>
                        <span className={styles.expiredMiniArea}>{session.area}</span>
                      </div>
                   </div>
                   <div className={styles.expiredMiniActions}>
                      <button onClick={() => setContactChild(session)} className={styles.miniActionBtn} title="Contactar">
                        <FontAwesomeIcon icon={faPhone} />
                      </button>
                      <button onClick={() => setCheckoutChild(session)} className={`${styles.miniActionBtn} ${styles.miniActionCheckout}`} title="Dar Salida">
                        <FontAwesomeIcon icon={faArrowRightFromBracket} />
                      </button>
                   </div>
                </div>
              ))}
           </div>
        </section>
      )}

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
                const areaSessionsRaw = allSessionsShown.filter(s => AREA_MAP[s.area] === uiArea);
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
                           normalizeText(s.tutorContact).includes(query) ||
                           normalizeText(s.id).includes(query) ||
                           (s.childId && normalizeText(s.childId).includes(query));
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
                                    <small style={{ fontSize: '0.6rem', color: 'var(--brand-600)', background: 'var(--brand-50)', padding: '1px 4px', borderRadius: '4px', marginLeft: '6px', fontWeight: 800 }}>
                                        #{ (session.childId || session.id).substring(0,8).toUpperCase() }
                                    </small>
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

      {/* 🎂 EVENTOS PRIVADOS ACTIVOS */}
      {privateEventGroups.length > 0 && (
        <section style={{ margin: '1.5rem 0', padding: '0 0.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
            <span style={{ fontSize: '1.4rem' }}>&#x1F382;</span>
            <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#92400e' }}>Eventos Privados Activos</h2>
            <span style={{ background: '#fef3c7', color: '#92400e', borderRadius: '50px', padding: '2px 10px', fontSize: '0.75rem', fontWeight: 700, border: '1px solid #fde68a' }}>
              {privateEventGroups.length} evento{privateEventGroups.length > 1 ? 's' : ''}
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {privateEventGroups.map(event => {
              const isPending = !event.eventEndTime || event.estado === 'agendado';
              const now = currentTime.getTime();
              
              let progressPct = 0;
              let remainMins = 0;
              let isExpiredEvent = false;
              let isCritical = false;
              let endStr = 'Por iniciar';
              let elapsedMs = 0;
              let totalMs = 0;

              if (!isPending && event.eventEndTime && event.eventStartTime) {
                  const eventEnd = event.eventEndTime.getTime();
                  const eventStart = event.eventStartTime.getTime();
                  totalMs = Math.max(1, eventEnd - eventStart);
                  elapsedMs = now - eventStart;
                  progressPct = Math.min(100, Math.max(0, (elapsedMs / totalMs) * 100));
                  remainMins = Math.max(0, Math.round((eventEnd - now) / 60000));
                  isExpiredEvent = remainMins === 0;
                  isCritical = remainMins > 0 && remainMins <= 10;
                  endStr = event.eventEndTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
              }

              return (
                <div key={event.transaccionId} style={{
                  background: isExpiredEvent ? '#fef2f2' : '#fffbeb',
                  border: `2px solid ${isExpiredEvent ? '#fca5a5' : isCritical ? '#fb923c' : '#fde68a'}`,
                  borderRadius: '1rem',
                  padding: '1.25rem',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
                  position: 'relative',
                  opacity: (event as any).isOffline ? 0.7 : 1
                }}>
                  {(event as any).isOffline && (
                      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(255,255,255,0.5)', zIndex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '1rem', flexDirection: 'column', gap: '0.5rem' }}>
                          <FontAwesomeIcon icon={faCloudUploadAlt} spin size="lg" style={{ color: '#d97706' }} />
                          <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#d97706' }}>SINCRONIZANDO VENTA...</span>
                      </div>
                  )}
                  {/* Header del evento */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                    <div style={{ flex: 1 }}>
                      <h3 style={{ margin: 0, fontSize: '1.2rem', color: '#92400e', fontWeight: 800 }}>
                        {event.isCumpleanos ? `Cumpleaños de ${event.nombreFestejado}` : event.packageName}
                      </h3>
                      <div style={{ display: 'flex', gap: '0.8rem', marginTop: '0.2rem', flexWrap: 'wrap', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.85rem', color: '#78350f', fontWeight: 600 }}>
                          <FontAwesomeIcon icon={faUser} style={{ marginRight: '4px', opacity: 0.7 }} /> {event.isCumpleanos ? `Cliente: ${event.tutorName}` : event.tutorName}
                        </span>
                        {(event as any).tutorPhone && (
                          <span style={{ fontSize: '0.85rem', color: '#16a34a', fontWeight: 800 }}>
                            <FontAwesomeIcon icon={faWhatsapp} style={{ marginRight: '4px' }} /> {formatDisplayPhone((event as any).tutorPhone)}
                          </span>
                        )}
                        <span style={{ fontSize: '0.8rem', background: '#fef3c7', padding: '2px 8px', borderRadius: '6px', color: '#92400e', fontWeight: 800, border: '1px solid #fde68a' }}>
                           Fin: {endStr}
                        </span>
                        {(event as any).guestLimit > 0 && (
                          <span style={{ 
                            fontSize: '0.8rem', 
                            background: event.sessions.length >= (event as any).guestLimit ? '#fee2e2' : '#f0fdf4', 
                            padding: '2px 8px', 
                            borderRadius: '6px', 
                            color: event.sessions.length >= (event as any).guestLimit ? '#991b1b' : '#166534', 
                            fontWeight: 800, 
                            border: `1px solid ${event.sessions.length >= (event as any).guestLimit ? '#fecaca' : '#bbf7d0'}` 
                          }}>
                            Invitados: {event.sessions.length} / {(event as any).guestLimit}
                          </span>
                        )}
                      </div>
                      
                      {event.isCumpleanos && (
                        <div style={{ 
                          display: 'grid', 
                          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', 
                          gap: '0.5rem 1rem', 
                          marginTop: '0.75rem', 
                          paddingTop: '0.75rem', 
                          borderTop: '1px dashed rgba(217, 119, 6, 0.25)',
                          fontSize: '0.85rem',
                          color: '#78350f'
                        }}>
                          <div>⏰ <strong>{event.horaInicio.substring(0, 5)} - {event.horaFin}</strong> ({event.packageName})</div>
                          <div>📍 <strong>{event.area}</strong></div>
                          <div>💰 Anticipo: <strong>${event.anticipoPagado}</strong></div>
                          <div>🧒 Costo: <strong>${event.precioPorNino}/niño</strong></div>
                        </div>
                      )}
                    </div>
                    {!(event as any).isCumpleanos ? (
                      <button
                        disabled={(event as any).guestLimit > 0 && event.sessions.length >= (event as any).guestLimit}
                        style={{ 
                          background: ((event as any).guestLimit > 0 && event.sessions.length >= (event as any).guestLimit) ? '#d1d5db' : '#d97706', 
                          color: 'white', 
                          border: 'none', 
                          borderRadius: '8px', 
                          padding: '0.5rem 1rem', 
                          fontWeight: 700, 
                          fontSize: '0.8rem', 
                          cursor: ((event as any).guestLimit > 0 && event.sessions.length >= (event as any).guestLimit) ? 'not-allowed' : 'pointer', 
                          display: 'flex', 
                          alignItems: 'center', 
                          gap: '0.4rem' 
                        }}
                        onClick={() => {
                          setNewPekeName('');
                          setAddToEventModal({ 
                              transaccionId: event.transaccionId, 
                              packageId: event.packageId, 
                              area: event.area, 
                              tutorId: event.tutorId, 
                              eventEndTime: event.eventEndTime, 
                              packageName: event.packageName,
                              tutorName: event.tutorName
                          } as any);
                        }}
                      >
                        <FontAwesomeIcon icon={faPlus} /> { ((event as any).guestLimit > 0 && event.sessions.length >= (event as any).guestLimit) ? 'CUPO LLENO' : 'Ingresar Peke' }
                      </button>
                    ) : (
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        {event.estado === 'agendado' ? (
                          <>
                            <button
                              style={{ 
                                background: '#3b82f6', 
                                color: 'white', 
                                border: 'none', 
                                borderRadius: '8px', 
                                padding: '0.5rem 1rem', 
                                fontWeight: 700, 
                                fontSize: '0.8rem', 
                                cursor: 'pointer',
                                boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
                              }}
                              onClick={() => handleIniciarBirthdayDirecto(event.transaccionId)}
                            >
                              ▶️ Iniciar
                            </button>
                            <button
                              style={{ 
                                background: '#f59e0b', 
                                color: 'white', 
                                border: 'none', 
                                borderRadius: '8px', 
                                padding: '0.5rem 0.8rem', 
                                fontWeight: 700, 
                                fontSize: '0.8rem', 
                                cursor: 'pointer',
                                boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
                              }}
                              onClick={() => onManageBirthday?.(event.transaccionId)}
                              title="Editar / Cancelar"
                            >
                              ✏️ Gestionar
                            </button>
                          </>
                        ) : (
                          <button
                            style={{ 
                              background: '#16a34a', 
                              color: 'white', 
                              border: 'none', 
                              borderRadius: '8px', 
                              padding: '0.5rem 1rem', 
                              fontWeight: 700, 
                              fontSize: '0.8rem', 
                              cursor: 'pointer',
                              boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
                            }}
                            onClick={() => onManageBirthday?.(event.transaccionId)}
                          >
                            ⚙️ Administrar
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Barra de tiempo SINCRONIZADA para TODO el evento */}
                  <div style={{ marginBottom: '1rem' }}>
                    <div style={{ height: '8px', background: '#e5e7eb', borderRadius: '99px', overflow: 'hidden', marginBottom: '4px' }}>
                      <div style={{
                        height: '100%',
                        width: `${progressPct}%`,
                        background: isExpiredEvent ? '#ef4444' : isCritical ? '#f97316' : '#d97706',
                        borderRadius: '99px',
                        transition: 'width 1s linear'
                      }} />
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#78716c', textAlign: 'right' }}>
                      {isPending 
                        ? <span style={{ color: '#d97706', fontWeight: 700 }}>
                            {event.isCumpleanos ? '⌛ ESPERANDO INICIO' : '⏳ ESPERANDO INGRESO'}
                          </span>
                        : isExpiredEvent
                            ? <span style={{ color: '#ef4444', fontWeight: 700 }}>&#x26A0; TIEMPO EXPIRADO</span>
                            : <span>{remainMins >= 60 ? `${Math.floor(remainMins/60)}h ${remainMins%60}m` : `${remainMins}m`} restantes &bull; todos salen a las {endStr}</span>
                      }
                    </div>
                  </div>

                  {/* Lista de pekes en el evento */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                    {event.sessions.map((s: ActiveSession) => (
                      <div key={s.id} style={{ background: 'white', border: '1px solid #fde68a', borderRadius: '8px', padding: '4px 12px', fontSize: '0.82rem', fontWeight: 600, color: '#44403c', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        &#x1F476; {s.childName}
                        <button
                          title="Dar salida"
                          onClick={() => setCheckoutChild(s)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: '0 2px', fontSize: '0.75rem' }}
                        >
                          &#x2715;
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

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
              if (clean.length === 12 && clean.startsWith('52')) return `+52 (${clean.slice(2,5)}) ${clean.slice(5,8)}-${clean.slice(8)}`;
              if (clean.length === 11 && clean.startsWith('1')) return `+1 (${clean.slice(1,4)}) ${clean.slice(4,7)}-${clean.slice(7)}`;
              if (clean.length === 10) return `(${clean.slice(0,3)}) ${clean.slice(3,6)}-${clean.slice(6)}`;
              return p; // original if doesn't match
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
                      paymentMethod: viewPurchase.metodoPago,
                      mensaje: "*** REIMPRESION DE TICKET ***"
                    };
                    const original = PrinterService.formatEpsonTicket(ticketData as any, false);
                    const copia = PrinterService.formatEpsonTicket(ticketData as any, true);
                    
                    // Enviamos dos trabajos de impresión separados
                    PrinterService.printRaw(original, 'TICKET');
                    PrinterService.printRaw(copia, 'TICKET');
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
                    PrinterService.printRaw(content, 'WRISTBAND');
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

      {/* 🎂 MODAL PARA AGREGAR PEKE A EVENTO PRIVADO */}
      {addToEventModal && (
        <div className={styles.modalOverlay}>
            <div className={styles.modal} style={{ maxWidth: '480px' }}>
                <div className={styles.modalHeader} style={{ background: 'linear-gradient(135deg, #d97706, #b45309)', color: 'white', borderRadius: '1rem 1rem 0 0', padding: '1.5rem', border: 'none' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <FontAwesomeIcon icon={faBirthdayCake} style={{ fontSize: '1.8rem' }} />
                        <div>
                            <h3 style={{ margin: 0, fontSize: '1.25rem', color: 'white', fontWeight: 800 }}>Ingreso a Evento</h3>
                            <p style={{ margin: 0, fontSize: '0.8rem', opacity: 0.9 }}>{addToEventModal.packageName} &bull; Fin {addToEventModal.eventEndTime ? addToEventModal.eventEndTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Por definir'}</p>
                        </div>
                    </div>
                </div>
                <div className={styles.modalBody} style={{ padding: '2rem 1.5rem' }}>
                    <div className={styles.formGroup} style={{ marginBottom: '1.5rem' }}>
                        <label style={{ fontSize: '0.9rem', fontWeight: 700, color: '#334155', marginBottom: '0.6rem', display: 'block' }}>Nombre Completo del Niño</label>
                        <input 
                            type="text" 
                            className={styles.input} 
                            placeholder="Ej. Juanito Pérez" 
                            value={newPekeName}
                            onChange={(e) => setNewPekeName(e.target.value)}
                            autoFocus
                        />
                    </div>
                    <div style={{ marginTop: '2rem', fontSize: '0.75rem', color: '#92400e', background: '#fffbeb', padding: '1rem', borderRadius: '12px', border: '1px solid #fef3c7', display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
                        <FontAwesomeIcon icon={faBell} style={{ marginTop: '2px' }} />
                        <span><strong>Nota de Sincronización:</strong> {addToEventModal.eventEndTime ? `El tiempo de este peke terminará automáticamente a las ${addToEventModal.eventEndTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} junto con todo el evento.` : 'El tiempo del evento comenzará a correr a partir de este primer ingreso.'}</span>
                    </div>
                </div>
                <div className={styles.modalFooter} style={{ padding: '1.25rem 1.5rem', background: '#f8fafc', gap: '1rem' }}>
                    <button 
                        className="btn btn-ghost" 
                        style={{ flex: 1, fontWeight: 700 }} 
                        onClick={() => setAddToEventModal(null)}
                        disabled={isRefreshing}
                    >
                        Cancelar
                    </button>
                    <button 
                        className="btn btn-primary" 
                        style={{ 
                            flex: 1.5, 
                            background: 'linear-gradient(135deg, #d97706, #b45309)', 
                            border: 'none', 
                            fontWeight: 800,
                            boxShadow: '0 4px 12px rgba(180, 83, 9, 0.3)'
                        }}
                        disabled={!newPekeName || isRefreshing}
                        onClick={async () => {
                            if (!newPekeName) return;
                            setIsRefreshing(true);
                            try {
                                await addChildToPrivateEvent({
                                    childName: newPekeName,
                                    childAge: 0, // Age is now omitted, using default
                                    tutorId: addToEventModal.tutorId,
                                    packageId: addToEventModal.packageId,
                                    area: addToEventModal.area,
                                    transaccionId: addToEventModal.transaccionId,
                                    eventEndTime: addToEventModal.eventEndTime,
                                    durationMinutes: (addToEventModal as any).durationMinutes
                                });
                                showToast(`${newPekeName} ingresó al evento con éxito.`, 'success');
                                setAddToEventModal(null);
                                refreshData();
                            } catch (error) {
                                console.error(error);
                                showToast('Error al ingresar el peke al evento.', 'error');
                            } finally {
                                setIsRefreshing(false);
                            }
                        }}
                    >
                        {isRefreshing ? 'Registrando...' : 'Confirmar Ingreso'}
                    </button>
                </div>
            </div>
        </div>
      )}

      {/* Expired Sessions Alerts */}
      {activeExpiredToasts.length > 0 && (
          <div className={styles.expiredAlertsContainer} style={{ maxHeight: '35vh', overflowY: 'auto', paddingRight: '5px' }}>
            {activeExpiredToasts.map(session => (
                <div key={session.id} className={styles.expiredMiniCard} style={{ boxShadow: '0 8px 20px rgba(220,38,38,0.3)', background: 'var(--danger)', color: 'white', border: 'none' }}>
                    <div className={styles.expiredMiniInfo}>
                        <span className={styles.expiredMiniName} style={{ color: 'white' }}>{session.childName}</span>
                        <div className={styles.expiredMiniMeta}>
                            <span className={styles.expiredMiniTime} style={{ color: '#fef2f2' }}>
                                <FontAwesomeIcon icon={faTriangleExclamation} style={{ marginRight: '4px' }} /> Excedido
                            </span>
                            <span className={styles.expiredMiniArea} style={{ background: 'rgba(255,255,255,0.2)', color: 'white' }}>{session.area}</span>
                        </div>
                    </div>
                    <div className={styles.expiredMiniActions}>
                        <button 
                            onClick={() => {
                                setDismissedExpired(prev => new Set(prev).add(session.id));
                                setCheckoutChild(session);
                            }} 
                            title="Dar Salida"
                            style={{ border: 'none', padding: '0 12px', height: '34px', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', width: 'auto', fontWeight: 800, fontSize: '0.8rem', background: 'white', color: 'var(--danger)' }}
                        >
                            <FontAwesomeIcon icon={faArrowRightFromBracket} style={{ marginRight: '6px' }} /> Salida
                        </button>
                        <button 
                            onClick={() => setDismissedExpired(prev => new Set(prev).add(session.id))} 
                            title="Ignorar por ahora"
                            style={{ border: '1px solid rgba(255,255,255,0.4)', background: 'transparent', height: '34px', width: '34px', borderRadius: '8px', cursor: 'pointer', color: 'rgba(255,255,255,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        >
                            <FontAwesomeIcon icon={faTimes} />
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

