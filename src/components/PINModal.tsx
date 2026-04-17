import React, { useState, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faLock, faCheckCircle, faSpinner } from '@fortawesome/free-solid-svg-icons';
import { authService } from '../lib/authService';

interface PINModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: (managerData: any) => void;
    title?: string;
    message?: string;
    actionDescription: string;
}

export const PINModal: React.FC<PINModalProps> = ({ 
    isOpen, 
    onClose, 
    onSuccess, 
    title = 'Autorización Requerida',
    message = 'Para proceder con esta acción, se requiere de la autorización de un Gerente o Supervisor.',
    actionDescription
}) => {
    const [pin, setPin] = useState('');
    const [isError, setIsError] = useState(false);
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        if (!isOpen) {
            setPin('');
            setIsError(false);
            setIsLoading(false);
        }
    }, [isOpen]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (pin.length < 4) return;
        
        setIsLoading(true);
        setIsError(false);

        try {
            const manager = await authService.validateManagerPin(pin);
            if (manager) {
                // Log the security event
                await authService.logSecurityEvent({
                    autorizadorId: manager.id,
                    solicitanteId: 'self',
                    accion: 'AUTORIZACION_ESPECIAL',
                    motivo: `Autorización de: ${actionDescription}`
                });
                onSuccess(manager);
                onClose();
            } else {
                setIsError(true);
                setPin('');
            }
        } catch (error) {
            console.error(error);
            setIsError(true);
        } finally {
            setIsLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.75)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '1rem'
        }}>
            <div style={{
                background: '#ffffff',
                width: '100%',
                maxWidth: '400px',
                borderRadius: '1.5rem',
                overflow: 'hidden',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
                animation: 'modalFadeIn 0.3s ease-out'
            }}>
                <div style={{
                    padding: '2rem',
                    textAlign: 'center',
                    borderBottom: '1px solid #f1f5f9'
                }}>
                    <div style={{
                        width: '64px',
                        height: '64px',
                        background: '#f8fafc',
                        color: '#001b48',
                        borderRadius: '1rem',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '1.5rem',
                        margin: '0 auto 1.5rem'
                    }}>
                        <FontAwesomeIcon icon={faLock} />
                    </div>
                    <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0f172a', margin: '0 0 0.5rem 0' }}>{title}</h3>
                    <p style={{ fontSize: '0.875rem', color: '#64748b', margin: 0 }}>{message}</p>
                </div>

                <form onSubmit={handleSubmit} style={{ padding: '2rem' }}>
                    <div style={{ marginBottom: '1.5rem' }}>
                        <label style={{ 
                            display: 'block', 
                            fontSize: '0.75rem', 
                            fontWeight: 800, 
                            textTransform: 'uppercase', 
                            letterSpacing: '0.05em',
                            color: '#475569',
                            marginBottom: '0.5rem',
                            textAlign: 'center'
                        }}>Introduzca PIN de Seguridad</label>
                        <input 
                            type="password"
                            value={pin}
                            autoComplete="off"
                            onChange={(e) => {
                                setIsError(false);
                                setPin(e.target.value.replace(/\D/g, '').substring(0, 6));
                            }}
                            placeholder="••••••"
                            autoFocus
                            style={{
                                width: '100%',
                                textAlign: 'center',
                                fontSize: '2rem',
                                letterSpacing: '0.5rem',
                                padding: '0.75rem',
                                border: `2px solid ${isError ? '#ef4444' : '#e2e8f0'}`,
                                borderRadius: '1rem',
                                outline: 'none',
                                transition: 'all 0.2s',
                                background: isError ? '#fef2f2' : '#f8fafc'
                            }}
                        />
                        {isError && (
                            <p style={{ color: '#ef4444', fontSize: '0.8rem', marginTop: '0.5rem', textAlign: 'center', fontWeight: 'bold' }}>
                                PIN incorrecto o sin privilegios de Gerencia.
                            </p>
                        )}
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                        <button 
                            type="button" 
                            className="btn btn-ghost" 
                            onClick={onClose}
                            style={{ borderRadius: '1rem' }}
                        >Cancelar</button>
                        <button 
                            type="submit" 
                            className="btn btn-primary" 
                            disabled={isLoading || pin.length < 4}
                            style={{ borderRadius: '1rem', background: '#001b48', color: '#fff' }}
                        >
                            {isLoading ? <FontAwesomeIcon icon={faSpinner} spin /> : <><FontAwesomeIcon icon={faCheckCircle} /> Autorizar</>}
                        </button>
                    </div>
                </form>
            </div>
            <style>{`
                @keyframes modalFadeIn {
                    from { opacity: 0; transform: scale(0.95) translateY(10px); }
                    to { opacity: 1; transform: scale(1) translateY(0); }
                }
            `}</style>
        </div>
    );
};
