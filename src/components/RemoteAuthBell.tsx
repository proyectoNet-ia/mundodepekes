import React, { useState, useEffect } from 'react';
import styles from './RemoteAuthBell.module.css';
import { authRequestService, type AuthRequest } from '../lib/authRequestService';
import { authService, type UserProfile } from '../lib/authService';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faBell, faTimes, faCheck, faBan } from '@fortawesome/free-solid-svg-icons';
import { useToast } from './Toast';

export const RemoteAuthBell: React.FC = () => {
    const { showToast } = useToast();
    const [user, setUser] = useState<UserProfile | null>(null);
    const [pendingRequests, setPendingRequests] = useState<AuthRequest[]>([]);
    const [showPanel, setShowPanel] = useState(false);

    useEffect(() => {
        const init = async () => {
            const currUser = await authService.getCurrentUser();
            setUser(currUser);

            if (currUser && ['admin', 'supervisor'].includes(currUser.role)) {
                const initial = await authRequestService.getPendingRequests();
                setPendingRequests(initial);

                const channel = authRequestService.subscribeToNewRequests((newReq) => {
                    setPendingRequests(prev => [newReq, ...prev]);
                    showToast(`Nueva solicitud de ${newReq.solicitante_nombre}`, 'info');
                    
                    // Notificación nativa si el navegador lo permite
                    if (Notification.permission === 'granted') {
                        new Notification("Nueva Solicitud de Autorización", {
                            body: `${newReq.solicitante_nombre} requiere: ${newReq.accion_tipo}`
                        });
                    }
                });

                return () => {
                    channel.unsubscribe();
                };
            }
        };

        const { data: { subscription } } = authService.onAuthStateChange((newUser) => {
            setUser(newUser);
        });

        init();
        return () => subscription.unsubscribe();
    }, []);

    if (!user || !['admin', 'supervisor'].includes(user.role)) return null;

    const handleRespond = async (id: string, status: 'aprobada' | 'rechazada') => {
        try {
            await authRequestService.respondToRequest(id, status, user.id);
            setPendingRequests(prev => prev.filter(r => r.id !== id));
            showToast(`Solicitud ${status} correctamente.`, 'success');
        } catch (e) {
            showToast('Error al responder la solicitud.', 'error');
        }
    };

    return (
        <div className={styles.container}>
            <button 
                className={`${styles.bellBtn} ${pendingRequests.length > 0 ? styles.pulse : ''}`}
                onClick={() => setShowPanel(!showPanel)}
                title="Autorizaciones Pendientes"
            >
                <FontAwesomeIcon icon={faBell} />
                {pendingRequests.length > 0 && <span className={styles.badge}>{pendingRequests.length}</span>}
            </button>

            {showPanel && (
                <div className={styles.panel}>
                    <div className={styles.header}>
                        <h3>Autorizaciones Remotas</h3>
                        <button onClick={() => setShowPanel(false)} className={styles.closeBtn}>
                            <FontAwesomeIcon icon={faTimes} />
                        </button>
                    </div>
                    <div className={styles.list}>
                        {pendingRequests.length === 0 ? (
                            <div className={styles.empty}>No hay solicitudes pendientes.</div>
                        ) : (
                            pendingRequests.map(req => (
                                <div key={req.id} className={styles.card}>
                                    <div className={styles.cardInfo}>
                                        <strong>{req.solicitante_nombre}</strong>
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
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};
