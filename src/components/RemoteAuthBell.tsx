import React, { useState, useEffect, useRef, useCallback } from 'react';
import styles from './RemoteAuthBell.module.css';
import { authRequestService, type AuthRequest } from '../lib/authRequestService';
import { authService, type UserProfile } from '../lib/authService';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faBell, faTimes, faCheck, faBan, faInfoCircle, faBoxOpen, faUnlockAlt } from '@fortawesome/free-solid-svg-icons';
import { useToast } from './Toast';
import { notificationsService, type Notification } from '../lib/notificationsService';
import { stockService, type StockItem } from '../lib/stockService';

export const RemoteAuthBell: React.FC = () => {
    const { showToast } = useToast();
    const [user, setUser] = useState<UserProfile | null>(null);
    const [pendingRequests, setPendingRequests] = useState<AuthRequest[]>([]);
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [showPanel, setShowPanel] = useState(false);
    const [activeTab, setActiveTab] = useState<'auth' | 'ops'>('auth');

    // Ref para rastrear si el panel está abierto en callbacks asíncronos (evita closure stale)
    const panelOpenRef = useRef(false);
    const markReadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Tipos de notificaciones permitidas según rol
    const getAllowedTypes = (role?: string): string[] => {
        if (role === 'cajero') return ['cash_open', 'cash_close', 'expense'];
        return ['cash_open', 'cash_close', 'low_stock', 'expense', 'auth_request'];
    };

    // ¿El rol puede ver la tab de firmas (solicitudes de autorización)?
    const canSeeAuthRequests = (role?: string) =>
        role === 'admin' || role === 'supervisor';

    // Marca todas las no-leídas como leídas en BD y en estado local
    const autoMarkAllRead = useCallback(async () => {
        await notificationsService.markAllAsRead();
        setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    }, []);

    // Abre/cierra el panel y dispara el auto-read al abrir
    const handleTogglePanel = useCallback((forceOpen?: boolean) => {
        const nextOpen = forceOpen !== undefined ? forceOpen : !panelOpenRef.current;
        panelOpenRef.current = nextOpen;
        setShowPanel(nextOpen);

        if (nextOpen) {
            // 1.5s de delay para que el usuario vea el resaltado antes de que desaparezca
            if (markReadTimerRef.current) clearTimeout(markReadTimerRef.current);
            markReadTimerRef.current = setTimeout(() => {
                autoMarkAllRead();
            }, 1500);
        } else {
            if (markReadTimerRef.current) clearTimeout(markReadTimerRef.current);
        }
    }, [autoMarkAllRead]);

    const init = async () => {
        if (Notification.permission === 'default') {
            await Notification.requestPermission();
        }

        const currUser = await authService.getCurrentUser();
        setUser(currUser);

        if (currUser) {
            const allowedTypes = getAllowedTypes(currUser.role);

            if (canSeeAuthRequests(currUser.role)) {
                const initialAuth = await authRequestService.getPendingRequests();
                setPendingRequests(initialAuth);
            } else {
                setActiveTab('ops');
            }

            const initialOps = await notificationsService.getRecent(15);
            const filtered = initialOps.filter(n => allowedTypes.includes(n.type));
            setNotifications(filtered);

            let authChannel: any = null;
            if (canSeeAuthRequests(currUser.role)) {
                authChannel = authRequestService.subscribeToNewRequests((newReq) => {
                    setPendingRequests(prev => {
                        // Deduplicar (por si llega por broadcast y luego por postgres_changes)
                        if (prev.some(r => r.id === newReq.id)) return prev;
                        return [newReq, ...prev];
                    });
                    showToast(`Firma Requerida: ${newReq.solicitante_nombre}`, 'info');
                    setActiveTab('auth');
                });
            }

            const opsChannel = notificationsService.subscribe(async (notification) => {
                if (!allowedTypes.includes(notification.type)) return;

                if (notification.type === 'auth_request' && canSeeAuthRequests(currUser.role)) {
                    // No hace falta re-fetchear todo, el authChannel ya debió capturarlo
                    // Solo abrimos el panel para alertar al supervisor
                    handleTogglePanel(true);
                    setActiveTab('auth');
                } else {
                    // Si el panel ya está abierto, marcar como leída de inmediato
                    if (panelOpenRef.current) {
                        setNotifications(prev => [{ ...notification, read: true }, ...prev]);
                        await notificationsService.markAsRead(notification.id);
                    } else {
                        setNotifications(prev => [notification, ...prev]);
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

            if (currUser.role !== 'cajero') {
                const auditStock = async () => {
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
                    } catch (e) { console.warn('Error en auditoría de inicio:', e); }
                };
                auditStock();
            }

            return () => {
                if (authChannel) authChannel.unsubscribe();
                opsChannel.unsubscribe();
            };
        }
    };

    useEffect(() => {
        const { data: { subscription } } = authService.onAuthStateChange((newUser) => {
            setUser(newUser);
        });

        init();
        return () => {
            subscription.unsubscribe();
            if (markReadTimerRef.current) clearTimeout(markReadTimerRef.current);
        };
    }, []);

    if (!user) return null;

    const handleRespond = async (id: string, status: 'aprobada' | 'rechazada') => {
        try {
            await authRequestService.respondToRequest(id, status, user.id);
            setPendingRequests(prev => prev.filter(r => r.id !== id));
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
                                pendingRequests.map(req => (
                                    <div key={req.id} className={styles.card}>
                                        <div className={styles.cardInfo}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                                                <strong>{req.solicitante_nombre}</strong>
                                                <small style={{ color: '#0284c7', fontWeight: 900 }}>SOLICITUD</small>
                                            </div>
                                            <span className={styles.actionType}>{req.accion_tipo}</span>
                                            <p>{req.descripcion}</p>
                                        </div>
                                        <div className={styles.actions}>
                                            <button className={styles.rejectBtn} onClick={() => handleRespond(req.id, 'rechazada')}>
                                                <FontAwesomeIcon icon={faBan} />
                                            </button>
                                            <button className={styles.approveBtn} onClick={() => handleRespond(req.id, 'aprobada')}>
                                                <FontAwesomeIcon icon={faCheck} /> Aprobar
                                            </button>
                                        </div>
                                    </div>
                                ))
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
