import React, { useState, useEffect } from 'react';
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

    const init = async () => {
        // Pedir permiso para notificaciones nativas (Celular/Desktop)
        if (Notification.permission === 'default') {
            await Notification.requestPermission();
        }

        const currUser = await authService.getCurrentUser();
        setUser(currUser);

        if (currUser) {
            // Cargar solicitudes de PIN
            const initialAuth = await authRequestService.getPendingRequests();
            setPendingRequests(initialAuth);

            // Cargar notificaciones operativas
            const initialOps = await notificationsService.getRecent(15);
            setNotifications(initialOps);

            // Suscribirse a Autorizaciones (PINS)
            const authChannel = authRequestService.subscribeToNewRequests((newReq) => {
                setPendingRequests(prev => [newReq, ...prev]);
                showToast(`Firma Requerida: ${newReq.solicitante_nombre}`, 'info');
                setActiveTab('auth');
            });

            // Suscribirse a Operaciones (Caja, Stock)
            const opsChannel = notificationsService.subscribe((notification) => {
                setNotifications(prev => [notification, ...prev]);
                showToast(notification.title, 'warning');
                if (!showPanel) setActiveTab('ops');

                // 📱 Lanzar Notificación Nativa (Push-style)
                if (Notification.permission === 'granted') {
                    new Notification(notification.title, {
                        body: notification.message,
                        icon: '/favicon.ico'
                    });
                }
                
                // 📳 Vibración táctil
                if (navigator.vibrate) {
                    navigator.vibrate([100, 50, 100]);
                }
            });

            // 📦 Realizar Auditoría de Stock de Inicio (Ahora que estamos suscritos)
            const auditStock = async () => {
                try {
                    const items: StockItem[] = await stockService.getInventory();
                    const lowItems = items.filter((i: StockItem) => i.cantidad <= (i.minimo_alert || 5));
                    
                    if (lowItems.length > 0) {
                        // Solo notificar si no hay una notificación reciente similar (Deduplicación)
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

            return () => {
                authChannel.unsubscribe();
                opsChannel.unsubscribe();
            };
        }
    };

    useEffect(() => {
        const { data: { subscription } } = authService.onAuthStateChange((newUser) => {
            setUser(newUser);
        });

        init();
        return () => subscription.unsubscribe();
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

    const handleMarkRead = async (id: string) => {
        try {
            await notificationsService.markAsRead(id);
            setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
        } catch (e) {
            console.error('Error marking as read', e);
        }
    };

    const handleMarkAllRead = async () => {
        try {
            await notificationsService.markAllAsRead();
            setNotifications(prev => prev.map(n => ({ ...n, read: true })));
            showToast('Todas las alertas marcadas como leídas.', 'success');
        } catch (e) {
            showToast('Error al limpiar alertas.', 'error');
        }
    };

    const getIcon = (type: string) => {
        switch(type) {
            case 'cash_open': return faUnlockAlt;
            case 'cash_close': return faInfoCircle;
            case 'low_stock': return faBoxOpen;
            default: return faBell;
        }
    };
    const getIconColor = (type: string) => {
        switch(type) {
            case 'low_stock': return '#ef4444';
            case 'cash_open': return '#f59e0b';
            case 'cash_close': return '#0284c7';
            default: return '#64748b';
        }
    };

    const unreadCount = pendingRequests.length + notifications.filter(n => !n.read).length;

    return (
        <div className={styles.container}>
            <button 
                className={`${styles.bellBtn} ${unreadCount > 0 ? styles.pulse : ''}`}
                onClick={() => setShowPanel(!showPanel)}
                title="Centro de Operaciones"
            >
                <FontAwesomeIcon icon={faBell} />
                {unreadCount > 0 && <span className={styles.badge}>{unreadCount}</span>}
            </button>

            {showPanel && (
                <div className={styles.panel}>
                    <div className={styles.header}>
                        <h3>Centro Operativo</h3>
                        <button onClick={() => setShowPanel(false)} className={styles.closeBtn}>
                            <FontAwesomeIcon icon={faTimes} />
                        </button>
                    </div>

                    <div className={styles.tabs}>
                        <button 
                            className={`${styles.tabBtn} ${activeTab === 'auth' ? styles.tabActive : ''}`}
                            onClick={() => setActiveTab('auth')}
                        >
                            Firmas ({pendingRequests.length})
                        </button>
                        <button 
                            className={`${styles.tabBtn} ${activeTab === 'ops' ? styles.tabActive : ''}`}
                            onClick={() => setActiveTab('ops')}
                        >
                            Alertas ({notifications.filter(n => !n.read).length})
                        </button>
                        {activeTab === 'ops' && notifications.some(n => !n.read) && (
                            <button className={styles.clearBtn} onClick={handleMarkAllRead} title="Marcar todas como leídas">
                                Limpiar todo
                            </button>
                        )}
                    </div>

                    <div className={styles.list}>
                        {activeTab === 'auth' ? (
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
                                        onClick={() => !notif.read && handleMarkRead(notif.id)}
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
