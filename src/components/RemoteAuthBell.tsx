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

// Resolver alias amigable de usuario a partir de nombres o correos registrados
const resolveUserAlias = (rawName?: string): string => {
    if (!rawName) return 'Usuario';
    const lower = rawName.toLowerCase();
    if (lower.includes('gerente')) return 'Gerente Operativo';
    if (lower.includes('admin_roster')) return 'Andrea Bañales';
    if (lower.includes('admin')) return 'Fernando Admin';
    if (lower.includes('cajero')) return 'Fanny';
    if (lower.includes('andrea1')) return 'Andrea Rodríguez';
    if (lower.includes('supervisor')) return 'Supervisor de Turno';
    if (lower.includes('analista')) return 'Analista de Datos';
    return rawName;
};

// Extrae y estructura los campos de ajuste de stock y motivos
const parseAuthRequestDetails = (req: AuthRequest) => {
    const meta = req.metadata || {};
    const desc = req.descripcion || '';
    const isStock = req.accion_tipo?.toLowerCase().includes('stock') || req.accion_tipo?.toLowerCase().includes('ajuste') || meta.item_id || desc.includes('Existencia actual:');

    if (isStock) {
        let stockActual = meta.stock_actual !== undefined ? meta.stock_actual : null;
        if (stockActual === null) {
            const matchStock = desc.match(/Existencia actual:\s*(\d+)/i);
            if (matchStock) stockActual = matchStock[1];
        }

        let motivo = meta.motivo || '';
        if (!motivo) {
            const matchMotivo = desc.match(/Motivo:\s*(.+)$/i);
            if (matchMotivo) motivo = matchMotivo[1].trim();
        }

        let detalleStock = req.accion_tipo || '';
        if (detalleStock.toLowerCase().startsWith('ajuste de stock:')) {
            detalleStock = detalleStock.replace(/ajuste de stock:\s*/i, '').trim();
        }

        return {
            isStock: true,
            title: 'AJUSTE DE STOCK:',
            detalle: detalleStock,
            stockActual: stockActual !== null ? stockActual : 0,
            motivo: motivo || 'Ajuste manual de inventario'
        };
    }

    return {
        isStock: false,
        title: req.accion_tipo || 'SOLICITUD DE AUTORIZACIÓN',
        detalle: desc,
        stockActual: null,
        motivo: meta.motivo || desc
    };
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

    // Tipos de notificaciones permitidas según rol (auth_request solo para Admin y Supervisor)
    const getAllowedTypes = (role?: string): string[] => {
        if (role === 'admin' || role === 'supervisor') {
            return ['cash_open', 'cash_close', 'low_stock', 'expense', 'auth_request'];
        }
        return ['cash_open', 'cash_close', 'low_stock', 'expense'];
    };

    // ¿El rol puede ver la tab de firmas (solicitudes de autorización)? Exclusivo Admin y Supervisor
    const canSeeAuthRequests = (role?: string) =>
        role === 'admin' || role === 'supervisor';

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
            // 1. Carga inicial de datos (filtrando cualquier solicitud propia por seguridad)
            if (canSeeAuthRequests(user.role)) {
                const initialAuth = await authRequestService.getPendingRequests();
                if (isMounted) setPendingRequests(initialAuth.filter(r => r.solicitante_id !== user.id));
            } else {
                setActiveTab('ops');
            }

            const initialOps = await notificationsService.getRecent(15);
            if (isMounted) {
                const filtered = initialOps.filter(n => allowedTypes.includes(n.type) && !n.read);
                setNotifications(filtered);
            }

            // 2. Suscripción en Tiempo Real para Solicitudes de Firma (Admin/Supervisor)
            if (canSeeAuthRequests(user.role)) {
                if (authChannelRef.current) {
                    supabase.removeChannel(authChannelRef.current);
                }
                authChannelRef.current = authRequestService.subscribeToNewRequests(
                    // On New Request
                    (newReq) => {
                        if (!isMounted) return;
                        // 🚫 CANDADO DE SEGURIDAD: El solicitante NUNCA debe recibir ni auto-aprobar su propia solicitud
                        if (newReq.solicitante_id === user.id) return;

                        const alias = resolveUserAlias(newReq.solicitante_nombre);
                        setPendingRequests(prev => {
                            if (prev.some(r => r.id === newReq.id)) return prev;
                            return [newReq, ...prev];
                        });
                        playChime();
                        showToast(`🔐 Firma Requerida: ${alias}`, 'info');
                        setActiveTab('auth');
                        handleTogglePanel(true);

                        if (Notification.permission === 'granted') {
                            new Notification(`🔐 Firma Requerida: ${alias}`, {
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

                // 🚫 CANDADO DE SEGURIDAD: Ignorar notificaciones de firmas generadas por el propio usuario
                if (notification.type === 'auth_request' && (notification.user_id === user.id || notification.metadata?.solicitante_id === user.id)) {
                    return;
                }

                if (notification.type === 'auth_request' && canSeeAuthRequests(user.role)) {
                    // Refrescar lista de firmas de inmediato excluyendo solicitudes propias
                    const currentPending = await authRequestService.getPendingRequests();
                    if (isMounted) {
                        const validPending = currentPending.filter(r => r.solicitante_id !== user.id);
                        setPendingRequests(validPending);
                        if (validPending.length > 0) {
                            playChime();
                            handleTogglePanel(true);
                            setActiveTab('auth');
                        }
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
                            const validRequests = freshRequests.filter(r => r.solicitante_id !== user.id);
                            setPendingRequests(prev => {
                                const newArrived = validRequests.filter(fr => !prev.some(p => p.id === fr.id));
                                if (newArrived.length > 0) {
                                    playChime();
                                    showToast(`🔐 ${newArrived.length} nueva(s) firma(s) pendiente(s)`, 'info');
                                }
                                return validRequests;
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
            // Seguridad: verificar que el usuario no esté aprobando su propia solicitud
            const targetReq = pendingRequests.find(r => r.id === id);
            if (targetReq && targetReq.solicitante_id === user.id) {
                showToast('Error de seguridad: no puedes auto-aprobar tus propias solicitudes.', 'error');
                return;
            }
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
                                    const alias = resolveUserAlias(req.solicitante_nombre);
                                    const parsed = parseAuthRequestDetails(req);

                                    return (
                                        <div key={req.id} className={styles.card}>
                                            <div className={styles.cardInfo}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', alignItems: 'center' }}>
                                                    <strong style={{ fontSize: '0.95rem', color: '#0f172a', fontWeight: 800 }}>{alias}</strong>
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

                                                <div style={{ background: '#f8fafc', padding: '10px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', margin: '6px 0 12px 0' }}>
                                                    <div style={{ fontSize: '0.82rem', fontWeight: 800, color: '#0369a1', textTransform: 'uppercase', marginBottom: '4px', letterSpacing: '0.02em' }}>
                                                        {parsed.title}
                                                    </div>

                                                    <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#1e293b', marginBottom: '4px' }}>
                                                        {parsed.detalle}
                                                    </div>

                                                    {parsed.isStock && (
                                                        <div style={{ fontSize: '0.78rem', color: '#475569', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                            <span style={{ fontWeight: 800, color: '#64748b' }}>EXISTENCIA ACTUAL:</span>
                                                            <span style={{ background: '#e2e8f0', padding: '1px 7px', borderRadius: '4px', fontWeight: 800, color: '#0f172a' }}>
                                                                {parsed.stockActual}
                                                            </span>
                                                        </div>
                                                    )}

                                                    <div style={{ marginTop: '8px', paddingTop: '6px', borderTop: '1px dashed #cbd5e1' }}>
                                                        <span style={{ fontSize: '0.72rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', display: 'block', marginBottom: '2px' }}>
                                                            MOTIVO:
                                                        </span>
                                                        <p style={{ margin: 0, fontSize: '0.82rem', color: '#334155', fontWeight: 600 }}>
                                                            {parsed.motivo}
                                                        </p>
                                                    </div>
                                                </div>
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
