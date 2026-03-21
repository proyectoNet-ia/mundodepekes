import React, { useState } from 'react';
import styles from './AuthPinModal.module.css';
import { authService, type UserProfile } from '../lib/authService';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faShieldAlt, faSpinner, faTimes } from '@fortawesome/free-solid-svg-icons';

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

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (pin.length < 4) return;

        setIsValidating(true);
        setError('');
        
        try {
            const authorizer = await authService.validateManagerPin(pin);
            if (authorizer) {
                onAuthorized(authorizer);
                setPin('');
            } else {
                setError('PIN Incorrecto o sin permisos de Gerente.');
            }
        } catch (err) {
            setError('Error de conexión con el servidor de seguridad.');
        } finally {
            setIsValidating(false);
        }
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

                <div className={styles.body}>
                    <div className={styles.pinDisplay}>
                        {'•'.repeat(pin.length).padEnd(6, ' ')}
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
                                    else if (btn === '✓') handleSubmit(new Event('submit') as any);
                                }}
                                disabled={isValidating}
                            >
                                {btn === '✓' && isValidating ? <FontAwesomeIcon icon={faSpinner} spin /> : btn}
                            </button>
                        ))}
                    </div>
                </div>

                <div className={styles.footer}>
                    <small>Solo un Administrador o Gerente puede autorizar esta acción.</small>
                </div>
            </div>
        </div>
    );
};
