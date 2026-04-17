import React from 'react';
import styles from './StatusModal.module.css';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
    faCheckCircle, 
    faTimesCircle, 
    faExclamationTriangle, 
    faInfoCircle 
} from '@fortawesome/free-solid-svg-icons';

export type ModalStatus = 'success' | 'error' | 'warning' | 'info' | 'danger';

interface StatusModalProps {
    isOpen: boolean;
    status: ModalStatus;
    title: string;
    message: string;
    onAction?: () => void;
    actionLabel?: string;
    onCancel?: () => void;
    cancelLabel?: string;
    children?: React.ReactNode;
}

export const StatusModal: React.FC<StatusModalProps> = ({ 
    isOpen, status, title, message, onAction, actionLabel, onCancel, cancelLabel, children 
}) => {
    if (!isOpen) return null;

    const getIcon = () => {
        switch (status) {
            case 'success': return faCheckCircle;
            case 'error': return faTimesCircle;
            case 'warning': return faExclamationTriangle;
            case 'danger': return faExclamationTriangle;
            case 'info': return faInfoCircle;
            default: return faInfoCircle;
        }
    };

    return (
        <div className={styles.overlay} onClick={onCancel}>
            <div className={`${styles.modal} ${styles[status]}`} onClick={e => e.stopPropagation()}>
                <FontAwesomeIcon icon={getIcon()} className={styles.icon} />
                <h2 className={styles.title}>{title}</h2>
                <p className={styles.message}>{message}</p>
                
                {children && <div className={styles.extraContent}>{children}</div>}

                <div className={styles.actions}>
                    {onAction && (
                        <button className={styles.actionBtn} onClick={onAction}>
                            {actionLabel || 'Aceptar'}
                        </button>
                    )}
                    {onCancel && (
                        <button className={styles.cancelBtn} onClick={onCancel}>
                            {cancelLabel || 'Cancelar'}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};
