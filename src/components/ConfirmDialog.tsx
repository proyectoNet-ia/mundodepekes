import React from 'react';
import { StatusModal } from './StatusModal';

interface ConfirmDialogProps {
    isOpen: boolean;
    title: string;
    message: string;
    onCancel: () => void;
    onConfirm: () => void;
    confirmText?: string;
    cancelText?: string;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({ 
    isOpen, title, message, onCancel, onConfirm, 
    confirmText = 'Continuar', cancelText = 'Regresar / Cancelar' 
}) => {
    return (
        <StatusModal
            isOpen={isOpen}
            status="info"
            title={title}
            message={message}
            onAction={onConfirm}
            actionLabel={confirmText}
            onCancel={onCancel}
            cancelLabel={cancelText}
        />
    );
};
