import React, { useState } from 'react';
import styles from './AuthPinModal.module.css';
import { authService, type UserProfile } from '../lib/authService';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faShieldAlt, faSpinner, faTimes, faPaperPlane, faSatellite } from '@fortawesome/free-solid-svg-icons';
import { authRequestService, type AuthRequest } from '../lib/authRequestService';

interface AuthPinModalProps {
    isOpen: boolean;
    onClose: () => void;
    onAuthorized: (authorizer: UserProfile) => void;
    actionLabel: string;
}

export const AuthPinModal: React.FC<AuthPinModalProps> = ({ isOpen, onClose, onAuthorized, actionLabel }) => {
    const [pin, setPin] = useState('');
    const [error, setError] = useState('');
    const [isValidating, setIsValidating] = useState(false);
    const [isRemoteMode, setIsRemoteMode] = useState(false);
    const [isWaitingRemote, setIsWaitingRemote] = useState(false);
    const [requestId, setRequestId] = useState<string | null>(null);

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        if (e && e.preventDefault) e.preventDefault();
        if (pin.length < 4) return;

        setIsValidating(true);
        setError('');
        
        try {
            const authorizer = await authService.validateManagerPin(pin);
            if (authorizer) {
                onAuthorized(authorizer);
                setPin('');
                setIsRemoteMode(false);
            } else {
                setError('PIN Incorrecto o sin permisos de Supervisor.');
            }
        } catch (err) {
            setError('Error de conexión con el servidor de seguridad.');
        } finally {
            setIsValidating(false);
        }
    };

    const handleRemoteRequest = async () => {
        setIsWaitingRemote(true);
        setError('');
        try {
            const req = await authRequestService.createRequest({
                accion_tipo: actionLabel,
                descripcion: `Solicitud de autorización para: ${actionLabel}`
            });
            
            setRequestId(req.id);
            
            // Suscribirse a la respuesta en tiempo real
            authRequestService.subscribeToRequest(req.id, (updatedReq) => {
                if (updatedReq.estado === 'aprobada') {
                    // Si se aprueba, buscamos el perfil del autorizador (simulado o real)
                    onAuthorized({ id: updatedReq.autorizador_id || '', email: 'Supervisor Remoto', role: 'supervisor' });
                    resetState();
                } else if (updatedReq.estado === 'rechazada') {
                    setError('Solicitud rechazada por el Supervisor.');
                    setIsWaitingRemote(false);
                }
            });

        } catch (err) {
            setError('No se pudo enviar la solicitud remota.');
            setIsWaitingRemote(false);
        }
    };

    const resetState = () => {
        setPin('');
        setError('');
        setIsRemoteMode(false);
        setIsWaitingRemote(false);
        setRequestId(null);
    };

    const addDigit = (digit: string) => {
        if (pin.length < 6) setPin(prev => prev + digit);
    };

    return (
        <div className={styles.overlay}>
            <div className={styles.modal}>
                <div className={styles.header}>
                    <FontAwesomeIcon icon={faShieldAlt} className={styles.shieldIcon} />
                    <div>
                        <h3>Autorización Requerida</h3>
                        <p>{actionLabel}</p>
                    </div>
                    <button onClick={onClose} className={styles.closeBtn}><FontAwesomeIcon icon={faTimes} /></button>
                </div>

                <div className={styles.tabs}>
                    <button className={!isRemoteMode ? styles.activeTab : ''} onClick={() => setIsRemoteMode(false)}>Directo (PIN)</button>
                    <button className={isRemoteMode ? styles.activeTab : ''} onClick={() => setIsRemoteMode(true)}>Remoto</button>
                </div>

                <div className={styles.body}>
                    {!isRemoteMode ? (
                        <>
                            <div className={styles.pinDisplay}>
                                {'•'.repeat(pin.length).padEnd(4, ' ')}
                            </div>
                            
                            {error && <div className={styles.errorMessage}>{error}</div>}

                            <div className={styles.numpad}>
                                {[1, 2, 3, 4, 5, 6, 7, 8, 9, '✕', 0, '✓'].map((btn, i) => (
                                    <button 
                                        key={i}
                                        className={typeof btn === 'number' ? styles.numBtn : (btn === '✓' ? styles.confirmBtn : styles.clearBtn)}
                                        onClick={() => {
                                            if (typeof btn === 'number') addDigit(btn.toString());
                                            else if (btn === '✕') setPin('');
                                            else if (btn === '✓') handleSubmit(null as any);
                                        }}
                                        disabled={isValidating}
                                    >
                                        {btn === '✓' && isValidating ? <FontAwesomeIcon icon={faSpinner} spin /> : btn}
                                    </button>
                                ))}
                            </div>
                        </>
                    ) : (
                        <div className={styles.remoteContent}>
                            {!isWaitingRemote ? (
                                <>
                                    <div className={styles.remoteIcon}><FontAwesomeIcon icon={faPaperPlane} /></div>
                                    <p>Se enviará una notificación al Supervisor con la descripción de esta acción.</p>
                                    <button className={styles.remoteBtn} onClick={handleRemoteRequest}>
                                        ENVIAR SOLICITUD AHORA
                                    </button>
                                </>
                            ) : (
                                <div className={styles.waitingBox}>
                                    <div className={styles.waitingAnim}><FontAwesomeIcon icon={faSatellite} spin /></div>
                                    <h3>Esperando al Supervisor...</h3>
                                    <p>Tu solicitud ha sido enviada. Por favor espera a que se apruebe remotamente.</p>
                                    {error && <div className={styles.errorMessage}>{error}</div>}
                                    <button className={styles.cancelRemoteBtn} onClick={() => setIsWaitingRemote(false)}>
                                        Cancelar y usar PIN físico
                                    </button>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                <div className={styles.footer}>
                    <small>Acción protegida por seguridad de Supervisor.</small>
                </div>
            </div>
        </div>
    );
};
