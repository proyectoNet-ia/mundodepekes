import React, { useState, useEffect, useRef, useCallback } from 'react';
import styles from './RemoteAuthBell.module.css';
import { authService, type UserProfile } from '../lib/authService';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faBell, faTimes, faInfoCircle, faBoxOpen, faUnlockAlt } from '@fortawesome/free-solid-svg-icons';
import { useToast } from './Toast';
import { notificationsService, type Notification } from '../lib/notificationsService';
import { stockService, type StockItem } from '../lib/stockService';
import { formatTime12H } from '../lib/dateUtils';

export const RemoteAuthBell: React.FC = () => {
    const { showToast } = useToast();
    const [user, setUser] = useState<UserProfile | null>(null);
    const [notifications, setNotifications] = useState<(Notification & { readAt?: number })[]>([]);
    const [showPanel, setShowPanel] = useState(false);

    const panelOpenRef = useRef(false);

    // Tipos de notificaciones permitidas
    const allowedTypes = ['cash_open', 'cash_close', 'low_stock', 'expense'];

    // Marca todas las no-leídas como leídas
    const autoMarkAllRead = useCallback(async () => {
        await notificationsService.markAllAsRead();
        setNotifications(prev => prev.map(n => ({ ...n, read: true, readAt: n.readAt || Date.now() })));
    }, []);

    // Abre/cierra el panel
    const handleTogglePanel = useCallback((forceOpen?: boolean) => {
        const nextOpen = forceOpen !== undefined ? forceOpen : !panelOpenRef.current;
        panelOpenRef.current = nextOpen;
        setShowPanel(nextOpen);

        if (nextOpen) {
            autoMarkAllRead();
        }
    }, [autoMarkAllRead]);

    // Gestión del usuario actual
    useEffect(() => {
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

    // Carga de alertas y escucha local
    useEffect(() => {
        if (!user) return;

        let isMounted = true;

        const loadNotifications = async () => {
            try {
                const initialOps = await notificationsService.getRecent(15);
                if (isMounted) {
                    const filtered = initialOps.filter(n => allowedTypes.includes(n.type) && !n.read);
                    setNotifications(filtered);
                }

                // Auditoría de inventario inicial para staff no-cajero
                if (user.role !== 'cajero') {
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
                }
            } catch (e) {
                // Silencioso
            }
        };

        loadNotifications();

        // Escucha local instantánea entre pestañas (BroadcastChannel)
        const sub = notificationsService.subscribe((notification) => {
            if (!isMounted) return;
            if (!allowedTypes.includes(notification.type)) return;

            if (panelOpenRef.current) {
                setNotifications(prev => [{ ...notification, read: true, readAt: Date.now() }, ...prev]);
                notificationsService.markAsRead(notification.id);
            } else {
                setNotifications(prev => {
                    if (prev.some(n => n.id === notification.id)) return prev;
                    return [notification, ...prev];
                });
            }
            showToast(notification.title, 'warning');
        });

        // Limpiador automático cada 10s
        const sweepInterval = setInterval(() => {
            if (isMounted) {
                setNotifications(prev => prev.filter(n => !n.read || !n.readAt || (Date.now() - n.readAt < 30000)));
            }
        }, 10000);

        return () => {
            isMounted = false;
            sub.unsubscribe();
            clearInterval(sweepInterval);
        };
    }, [user, showToast]);

    if (!user) return null;

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

    const unreadOps = notifications.filter(n => !n.read).length;

    return (
        <div className={styles.container}>
            <button
                className={`${styles.bellBtn} ${unreadOps > 0 ? styles.pulse : ''}`}
                onClick={() => handleTogglePanel()}
                title="Centro de Alertas Operativas"
            >
                <FontAwesomeIcon icon={faBell} />
                {unreadOps > 0 && <span className={styles.badge}>{unreadOps}</span>}
            </button>

            {showPanel && (
                <div className={styles.panel}>
                    <div className={styles.header}>
                        <h3>Alertas Operativas</h3>
                        <button onClick={() => handleTogglePanel(false)} className={styles.closeBtn}>
                            <FontAwesomeIcon icon={faTimes} />
                        </button>
                    </div>

                    <div className={styles.list}>
                        {notifications.length === 0 ? (
                            <div className={styles.empty}>Historial de alertas limpio.</div>
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
                                                    <small style={{ color: '#94a3b8' }}>{formatTime12H(notif.created_at)}</small>
                                                </div>
                                                <p style={{ margin: '4px 0 0 0', fontSize: '0.8rem', color: '#64748b' }}>{notif.message}</p>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};
