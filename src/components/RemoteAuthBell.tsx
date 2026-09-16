import React, { useState, useEffect, useRef, useCallback } from 'react';
import styles from './RemoteAuthBell.module.css';
import { authRequestService, type AuthRequest } from '../lib/authRequestService';
import { authService, type UserProfile } from '../lib/authService';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faBell, faTimes, faCheck, faBan, faInfoCircle, faBoxOpen, faUnlockAlt } from '@fortawesome/free-solid-svg-icons';
import { useToast } from './Toast';
import { notificationsService, type Notification } from '../lib/notificationsService';
import { stockService, type StockItem } from '../lib/stockService';
import { supabase } from '../lib/supabase';

// Reproductor de alerta sonora discreta mediante Web Audio API
const playChime = () => {
    try {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        if (!AudioCtx) return;
        const ctx = new AudioCtx();
        const playTone = (freq: number, start: number, dur: number) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, ctx.currentTime + start);
            gain.gain.setValueAtTime(0.15, ctx.currentTime + start);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + dur);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(ctx.currentTime + start);
            osc.stop(ctx.currentTime + start + dur);
        };
        playTone(587.33, 0, 0.12); // D5
        playTone(880, 0.14, 0.22);  // A5
    } catch (e) {
        // Ignorado si la política de autoplay del navegador lo bloquea antes de interacción
    }
};

export const RemoteAuthBell: React.FC = () => {
    const { showToast } = useToast();
    const [user, setUser] = useState<UserProfile | null>(null);
    const [pendingRequests, setPendingRequests] = useState<AuthRequest[]>([]);
    const [notifications, setNotifications] = useState<(Notification & { readAt?: number })[]>([]);
    const [showPanel, setShowPanel] = useState(false);
    const [activeTab, setActiveTab] = useState<'auth' | 'ops'>('auth');

    // Ref para rastrear si el panel está abierto en callbacks asíncronos (evita closure stale)
    const panelOpenRef = useRef(false);
    const markReadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Refs for active Supabase channels
    const authChannelRef = useRef<any>(null);
    const opsChannelRef = useRef<any>(null);

    // Tipos de notificaciones permitidas según rol
    const getAllowedTypes = (role?: string): string[] => {
        if (role === 'cajero') return ['cash_open', 'cash_close', 'expense'];
        return ['cash_open', 'cash_close', 'low_stock', 'expense', 'auth_request'];
    };

    // ¿El rol puede ver la tab de firmas (solicitudes de autorización)?
    const canSeeAuthRequests = (role?: string) =>
        role === 'admin' || role === 'supervisor' || role === 'gerente';

    // Marca todas las no-leídas como leídas en BD y en estado local
    const autoMarkAllRead = useCallback(async () => {
        await notificationsService.markAllAsRead();
        setNotifications(prev => prev.map(n => ({ ...n, read: true, readAt: n.readAt || Date.now() })));
    }, []);

    // Abre/cierra el panel y dispara el auto-read al abrir
    const handleTogglePanel = useCallback((forceOpen?: boolean) => {
        const nextOpen = forceOpen !== undefined ? forceOpen : !panelOpenRef.current;
        panelOpenRef.current = nextOpen;
        setShowPanel(nextOpen);

        if (nextOpen) {
            // Marcar leídas de inmediato para limpiar la campana
            autoMarkAllRead();
        }
    }, [autoMarkAllRead]);

    // Gestión del usuario actual y permisos de notificación
    useEffect(() => {
        if (Notification.permission === 'default') {
            Notification.requestPermission().catch(() => {});
        }

        authService.getCurrentUser().then(currUser => {
            if (currUser) setUser(currUser);
        });

        const { data: { subscription } } = authService.onAuthStateChange((newUser) => {
            setUser(newUser);
        });

        return () => {
            subscription.unsubscribe();
        };
    }, []);

    // Suscripciones en tiempo real y sondeo resiliente reactivos al usuario
    useEffect(() => {
        if (!user) return;

        let isMounted = true;
        let pollInterval: ReturnType<typeof setInterval> | null = null;
        const allowedTypes = getAllowedTypes(user.role);

        const initSubscriptions = async () => {
            // 1. Carga inicial de datos
            if (canSeeAuthRequests(user.role)) {
                const initialAuth = await authRequestService.getPendingRequests();
                if (isMounted) setPendingRequests(initialAuth);
            } else {
                setActiveTab('ops');
            }

            const initialOps = await notificationsService.getRecent(15);
            if (isMounted) {
                const filtered = initialOps.filter(n => allowedTypes.includes(n.type) && !n.read);
                setNotifications(filtered);
            }

            // 2. Suscripción en Tiempo Real para Solicitudes de Firma (Admin/Supervisor/Gerente)
            if (canSeeAuthRequests(user.role)) {
                if (authChannelRef.current) {
                    supabase.removeChannel(authChannelRef.current);
                }
                authChannelRef.current = authRequestService.subscribeToNewRequests(
                    // On New Request
                    (newReq) => {
                        if (!isMounted) return;
                        setPendingRequests(prev => {
                            if (prev.some(r => r.id === newReq.id)) return prev;
                            return [newReq, ...prev];
                        });
                        playChime();
                        showToast(`🔐 Firma Requerida: ${newReq.solicitante_nombre}`, 'info');
                        setActiveTab('auth');
                        handleTogglePanel(true);

                        if (Notification.permission === 'granted') {
                            new Notification(`🔐 Firma Requerida: ${newReq.solicitante_nombre}`, {
                                body: newReq.descripcion || `Solicitud para: ${newReq.accion_tipo}`,
                                icon: '/favicon.ico'
                            });
                        }
                        if (navigator.vibrate) {
                            navigator.vibrate([150, 80, 150]);
                        }
                    },
                    // On Update or Cancel
                    (updatedReq) => {
                        if (!isMounted) return;
                        if (updatedReq.estado !== 'pendiente') {
                            setPendingRequests(prev => prev.filter(r => r.id !== updatedReq.id));
                            if (updatedReq.estado === 'cancelada') {
                                showToast('Solicitud cancelada por el solicitante', 'info');
                            }
                        }
                    }
                );
            }

            // 3. Suscripción en Tiempo Real para Notificaciones Operativas
            if (opsChannelRef.current) {
                supabase.removeChannel(opsChannelRef.current);
            }
            opsChannelRef.current = notificationsService.subscribe(async (notification) => {
                if (!isMounted) return;
                if (!allowedTypes.includes(notification.type)) return;

                if (notification.type === 'auth_request' && canSeeAuthRequests(user.role)) {
                    // Refrescar lista de firmas de inmediato para consistencia total
                    const currentPending = await authRequestService.getPendingRequests();
                    if (isMounted) {
                        setPendingRequests(currentPending);
                        playChime();
                        handleTogglePanel(true);
                        setActiveTab('auth');
                    }
                } else {
                    // Si el panel ya está abierto, marcar como leída de inmediato
                    if (panelOpenRef.current) {
                        setNotifications(prev => [{ ...notification, read: true, readAt: Date.now() }, ...prev]);
                        await notificationsService.markAsRead(notification.id);
                    } else {
                        setNotifications(prev => {
                            if (prev.some(n => n.id === notification.id)) return prev;
                            return [notification, ...prev];
                        });
                    }
                    showToast(notification.title, 'warning');
                    if (!panelOpenRef.current) setActiveTab('ops');
                }

                if (Notification.permission === 'granted') {
                    new Notification(notification.title, {
                        body: notification.message,
                        icon: '/favicon.ico'
                    });
                }

                if (navigator.vibrate) {
                    navigator.vibrate([100, 50, 100]);
                }
            });

            // 4. Auditoría de inventario inicial para staff no-cajero
            if (user.role !== 'cajero') {
                try {
                    const items: StockItem[] = await stockService.getInventory();
                    const lowItems = items.filter((i: StockItem) => i.cantidad <= (i.minimo_alert || 5));
                    if (lowItems.length > 0) {
                        const hasRecent = initialOps.some(n =>
                            n.type === 'low_stock' &&
                            n.message.includes(`${lowItems.length} productos`) &&
                            !n.read
                        );
                        if (!hasRecent) {
                            await notificationsService.notify(
                                'low_stock',
                                '📦 Alerta de Inventario',
                                `Se han detectado ${lowItems.length} productos con stock crítico. Revise existencias.`,
                                { items: lowItems.map(i => i.nombre) }
                            );
                        }
                    }
                } catch (e) {
                    console.warn('Error en auditoría de inicio:', e);
                }
            }

            // 5. 🛡️ Sondeo de Respaldo Resiliente (Cada 5s para supervisores/administradores)
            if (canSeeAuthRequests(user.role)) {
                pollInterval = setInterval(async () => {
                    if (!isMounted || !navigator.onLine) return;
                    try {
                        const freshRequests = await authRequestService.getPendingRequests();
                        if (isMounted) {
                            setPendingRequests(prev => {
                                const newArrived = freshRequests.filter(fr => !prev.some(p => p.id === fr.id));
                                if (newArrived.length > 0) {
                                    playChime();
                                    showToast(`🔐 ${newArrived.length} nueva(s) firma(s) pendiente(s)`, 'info');
                                }
                                return freshRequests;
                            });
                        }
                    } catch (e) {
                        // Silencioso en caso de error de red transitorio
                    }
                }, 5000);
            }
        };

        initSubscriptions();

        // 🧹 Limpiador automático: remueve de la lista notificaciones leídas hace más de 30s
        const sweepInterval = setInterval(() => {
            if (isMounted) {
                setNotifications(prev => prev.filter(n => !n.read || !n.readAt || (Date.now() - n.readAt < 30000)));
            }
        }, 5000);

        return () => {
            isMounted = false;
            if (pollInterval) clearInterval(pollInterval);
            clearInterval(sweepInterval);
            if (authChannelRef.current) {
                supabase.removeChannel(authChannelRef.current);
                authChannelRef.current = null;
            }
            if (opsChannelRef.current) {
                supabase.removeChannel(opsChannelRef.current);
                opsChannelRef.current = null;
            }
            if (markReadTimerRef.current) clearTimeout(markReadTimerRef.current);
        };
    }, [user, handleTogglePanel, showToast]);


    if (!user) return null;

    const handleRespond = async (id: string, status: 'aprobada' | 'rechazada') => {
        try {
            await authRequestService.respondToRequest(id, status, user.id);
            setPendingRequests(prev => prev.filter(r => r.id !== id));
            setNotifications(prev => prev.map(n => n.type === 'auth_request' ? { ...n, read: true, readAt: Date.now() } : n));
            showToast(`Solicitud ${status} correctamente.`, 'success');
        } catch (e) {
            showToast('Error al responder la solicitud.', 'error');
        }
    };

    const getIcon = (type: string) => {
        switch (type) {
            case 'cash_open': return faUnlockAlt;
            case 'cash_close': return faInfoCircle;
            case 'low_stock': return faBoxOpen;
            default: return faBell;
        }
    };

    const getIconColor = (type: string) => {
        switch (type) {
            case 'low_stock': return '#ef4444';
            case 'cash_open': return '#f59e0b';
            case 'cash_close': return '#0284c7';
            default: return '#64748b';
        }
    };

    const showAuthTab = canSeeAuthRequests(user.role);
    const unreadOps = notifications.filter(n => !n.read).length;
    const unreadCount = (showAuthTab ? pendingRequests.length : 0) + unreadOps;

    return (
        <div className={styles.container}>
            <button
                className={`${styles.bellBtn} ${unreadCount > 0 ? styles.pulse : ''}`}
                onClick={() => handleTogglePanel()}
                title="Centro de Operaciones"
            >
                <FontAwesomeIcon icon={faBell} />
                {unreadCount > 0 && <span className={styles.badge}>{unreadCount}</span>}
            </button>

            {showPanel && (
                <div className={styles.panel}>
                    <div className={styles.header}>
                        <h3>Centro Operativo</h3>
                        <button onClick={() => handleTogglePanel(false)} className={styles.closeBtn}>
                            <FontAwesomeIcon icon={faTimes} />
                        </button>
                    </div>

                    <div className={styles.tabs}>
                        {showAuthTab && (
                            <button
                                className={`${styles.tabBtn} ${activeTab === 'auth' ? styles.tabActive : ''}`}
                                onClick={() => setActiveTab('auth')}
                            >
                                Firmas ({pendingRequests.length})
                            </button>
                        )}
                        <button
                            className={`${styles.tabBtn} ${activeTab === 'ops' ? styles.tabActive : ''}`}
                            onClick={() => setActiveTab('ops')}
                        >
                            Alertas {unreadOps > 0 ? `(${unreadOps} nuevas)` : ''}
                        </button>
                    </div>

                    <div className={styles.list}>
                        {activeTab === 'auth' && showAuthTab ? (
                            pendingRequests.length === 0 ? (
                                <div className={styles.empty}>No hay firmas requeridas.</div>
                            ) : (
                                pendingRequests.map(req => {
                                    const isEntrada = req.accion_tipo?.toUpperCase().includes('ENTRADA') || req.descripcion?.toUpperCase().includes('ENTRADA');
                                    const isSalida = req.accion_tipo?.toUpperCase().includes('SALIDA') || req.descripcion?.toUpperCase().includes('SALIDA');
                                    return (
                                        <div key={req.id} className={styles.card}>
                                            <div className={styles.cardInfo}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', alignItems: 'center' }}>
                                                    <strong>{req.solicitante_nombre}</strong>
                                                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                                                        {isEntrada && (
                                                            <span style={{ background: '#dcfce7', color: '#15803d', padding: '2px 8px', borderRadius: '6px', fontSize: '0.7rem', fontWeight: 800, border: '1px solid #bbf7d0' }}>
                                                                + ENTRADA
                                                            </span>
                                                        )}
                                                        {isSalida && (
                                                            <span style={{ background: '#fee2e2', color: '#b91c1c', padding: '2px 8px', borderRadius: '6px', fontSize: '0.7rem', fontWeight: 800, border: '1px solid #fecaca' }}>
                                                                - SALIDA
                                                            </span>
                                                        )}
                                                        <small style={{ color: '#0284c7', fontWeight: 900, background: '#e0f2fe', padding: '2px 6px', borderRadius: '4px', fontSize: '0.65rem' }}>FIRMA</small>
                                                    </div>
                                                </div>
                                                <span className={styles.actionType}>{req.accion_tipo}</span>
                                                <p style={{ margin: '6px 0 10px 0', fontSize: '0.82rem', color: '#334155', fontWeight: 500, lineHeight: 1.4 }}>
                                                    {req.descripcion}
                                                </p>
                                            </div>
                                            <div className={styles.actions}>
                                                <button className={styles.rejectBtn} onClick={() => handleRespond(req.id, 'rechazada')} title="Rechazar Solicitud">
                                                    <FontAwesomeIcon icon={faBan} /> Rechazar
                                                </button>
                                                <button className={styles.approveBtn} onClick={() => handleRespond(req.id, 'aprobada')} title="Aprobar Solicitud">
                                                    <FontAwesomeIcon icon={faCheck} /> Aprobar
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })

                            )
                        ) : (
                            notifications.length === 0 ? (
                                <div className={styles.empty}>Historial de alertas vacío.</div>
                            ) : (
                                notifications.map(notif => (
                                    <div
                                        key={notif.id}
                                        className={`${styles.card} ${!notif.read ? styles.unread : ''}`}
                                    >
                                        <div className={styles.cardInfo}>
                                            <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                                                <div className={styles.iconBox} style={{ color: getIconColor(notif.type), background: `${getIconColor(notif.type)}15` }}>
                                                    <FontAwesomeIcon icon={getIcon(notif.type)} />
                                                </div>
                                                <div style={{ flex: 1 }}>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                        <strong style={{ fontSize: '0.9rem' }}>{notif.title}</strong>
                                                        <small style={{ color: '#94a3b8' }}>{new Date(notif.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</small>
                                                    </div>
                                                    <p style={{ margin: '4px 0 0 0', fontSize: '0.8rem', color: '#64748b' }}>{notif.message}</p>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))
                            )
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};
