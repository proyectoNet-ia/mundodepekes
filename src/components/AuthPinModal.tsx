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

export const AuthPinModal: React.FC<AuthPinModalProps> = ({ isOpen, onClose, onAuthorized, actionLabel, description }) => {
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

    const handleSubmit = async (e?: React.FormEvent) => {
        if (e && e.preventDefault) e.preventDefault();
        if (pin.length < 4) return;

        setIsValidating(true);
        setError('');
        
        try {
            const authorizer = await authService.validateManagerPin(pin);
            if (authorizer) {
                await onAuthorized(authorizer);
                resetState();
            } else {
                setError('PIN Incorrecto o sin permisos de Supervisor.');
            }
        } catch {
            setError('Error al validar el PIN. Intente de nuevo.');
        } finally {
            setIsValidating(false);
        }
    };

    const addDigit = (digit: string) => {
        if (pin.length < 6) {
            const nextPin = pin + digit;
            setPin(nextPin);
            if (nextPin.length === 4) {
                // Validación automática al ingresar 4 dígitos
                setTimeout(() => {
                    authService.validateManagerPin(nextPin).then(async (authorizer) => {
                        if (authorizer) {
                            await onAuthorized(authorizer);
                            resetState();
                        } else {
                            setError('PIN Incorrecto o sin permisos de Supervisor.');
                        }
                    }).catch(() => {
                        setError('Error al validar el PIN.');
                    });
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
                    <small>Ingrese el PIN de Supervisor o Administrador.</small>
                </div>
            </div>
        </div>
    );
};
