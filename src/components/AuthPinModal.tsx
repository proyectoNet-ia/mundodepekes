import React, { useState } from 'react';
import styles from './AuthPinModal.module.css';
import { authService, type UserProfile } from '../lib/authService';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faShieldAlt, faSpinner, faTimes } from '@fortawesome/free-solid-svg-icons';

interface AuthPinModalProps {
    isOpen: boolean;
    onClose: () => void;
    onAuthorized: (authorizer: UserProfile) => Promise<void> | void;
    actionLabel: string;
    description?: string;
    metadata?: any;
}

export const AuthPinModal: React.FC<AuthPinModalProps> = ({ isOpen, onClose, onAuthorized, actionLabel, description, metadata }) => {
    const [pin, setPin] = useState('');
    const [error, setError] = useState('');
    const [isValidating, setIsValidating] = useState(false);

    const resetState = () => {
        setPin('');
        setError('');
    };

    const handleClose = () => {
        resetState();
        onClose();
    };

    if (!isOpen) return null;

    const performValidation = async (pinToValidate: string) => {
        if (pinToValidate.length < 4 || isValidating) return;

        setIsValidating(true);
        setError('');
        
        try {
            const result = await authService.validateManagerPinDetailed(pinToValidate, {
                accion: actionLabel,
                motivo: description || metadata?.motivo || 'Autorización en caja',
                folio: metadata?.folio || metadata?.id
            });

            if (result.success && result.user) {
                await onAuthorized(result.user);
                resetState();
            } else {
                setError(result.error || 'PIN Incorrecto o sin permisos de Supervisor.');
            }
        } catch {
            setError('Error al validar el PIN. Intente de nuevo.');
        } finally {
            setIsValidating(false);
        }
    };

    const handleSubmit = async (e?: React.FormEvent) => {
        if (e && e.preventDefault) e.preventDefault();
        await performValidation(pin);
    };

    const addDigit = (digit: string) => {
        if (pin.length < 6) {
            const nextPin = pin + digit;
            setPin(nextPin);
            setError('');

            // Si completa 4 dígitos, intentamos validación automática inmediata
            if (nextPin.length === 4) {
                setTimeout(() => {
                    authService.validateManagerPinDetailed(nextPin, {
                        accion: actionLabel,
                        motivo: description || metadata?.motivo || 'Autorización en caja',
                        folio: metadata?.folio || metadata?.id
                    }).then(async (res) => {
                        if (res.success && res.user) {
                            await onAuthorized(res.user);
                            resetState();
                        }
                    }).catch(() => {});
                }, 100);
            } else if (nextPin.length === 6) {
                // Si completa 6 dígitos, ejecuta validación
                setTimeout(() => {
                    performValidation(nextPin);
                }, 100);
            }
        }
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
                    <button onClick={handleClose} className={styles.closeBtn}><FontAwesomeIcon icon={faTimes} /></button>
                </div>

                <div className={styles.body}>
                    {description && <p style={{ fontSize: '0.85rem', color: '#64748b', textAlign: 'center', marginBottom: '0.5rem' }}>{description}</p>}
                    
                    <div className={styles.pinDisplay}>
                        {'•'.repeat(pin.length).padEnd(Math.max(4, pin.length), ' ')}
                    </div>
                    
                    {error && (
                        <div className={styles.errorMessage} style={{ fontSize: '0.8rem', lineHeight: '1.25', padding: '0.5rem' }}>
                            {error}
                        </div>
                    )}

                    <div className={styles.numpad}>
                        {[1, 2, 3, 4, 5, 6, 7, 8, 9, '✕', 0, '✓'].map((btn, i) => (
                            <button 
                                key={i}
                                className={typeof btn === 'number' ? styles.numBtn : (btn === '✓' ? styles.confirmBtn : styles.clearBtn)}
                                onClick={() => {
                                    if (typeof btn === 'number') addDigit(btn.toString());
                                    else if (btn === '✕') { setPin(''); setError(''); }
                                    else if (btn === '✓') handleSubmit();
                                }}
                                disabled={isValidating}
                            >
                                {btn === '✓' && isValidating ? <FontAwesomeIcon icon={faSpinner} spin /> : btn}
                            </button>
                        ))}
                    </div>
                </div>

                <div className={styles.footer}>
                    <small>Ingrese PIN de Supervisor o PIN Dinámico OTP.</small>
                </div>
            </div>
        </div>
    );
};
