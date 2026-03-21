import React, { createContext, useContext, useState, useCallback } from 'react';
import styles from './Toast.module.css';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCheckCircle, faExclamationCircle, faInfoCircle, faTimes, faShieldAlt } from '@fortawesome/free-solid-svg-icons';

type ToastType = 'success' | 'error' | 'warning' | 'info';

interface Toast {
    id: string;
    message: string;
    type: ToastType;
    title?: string;
}

interface ToastContextType {
    showToast: (message: string, type: ToastType, title?: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [toasts, setToasts] = useState<Toast[]>([]);

    const removeToast = useCallback((id: string) => {
        setToasts(prev => prev.filter(t => t.id !== id));
    }, []);

    const showToast = useCallback((message: string, type: ToastType, title?: string) => {
        const id = Math.random().toString(36).substr(2, 9);
        setToasts(prev => [...prev, { id, message, type, title }]);
        setTimeout(() => removeToast(id), 5000);
    }, [removeToast]);

    const getIcon = (type: ToastType) => {
        switch (type) {
            case 'success': return faCheckCircle;
            case 'error': return faExclamationCircle;
            case 'warning': return faShieldAlt;
            default: return faInfoCircle;
        }
    };

    return (
        <ToastContext.Provider value={{ showToast }}>
            {children}
            <div className={styles.toastContainer}>
                {toasts.map(toast => (
                    <div key={toast.id} className={`${styles.toast} ${styles[toast.type]}`}>
                        <div className={styles.iconWrapper}>
                            <FontAwesomeIcon icon={getIcon(toast.type)} />
                        </div>
                        <div className={styles.content}>
                            {toast.title && <h4 className={styles.toastTitle}>{toast.title}</h4>}
                            <p className={styles.toastMessage}>{toast.message}</p>
                        </div>
                        <button onClick={() => removeToast(toast.id)} className={styles.closeBtn}>
                            <FontAwesomeIcon icon={faTimes} />
                        </button>
                        <div className={styles.progressBar} />
                    </div>
                ))}
            </div>
        </ToastContext.Provider>
    );
};

export const useToast = () => {
    const context = useContext(ToastContext);
    if (!context) throw new Error('useToast must be used within a ToastProvider');
    return context;
};
