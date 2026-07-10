import React, { useState, useEffect } from 'react';
import styles from './MergeCustomersModal.module.css';
import { supabase } from '../lib/supabase';
import { mergeCustomers } from '../lib/salesService';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTimes, faSearch, faExclamationTriangle, faExchangeAlt, faUser, faPhone, faSpinner } from '@fortawesome/free-solid-svg-icons';
import { useToast } from './Toast';

interface CustomerData {
    id: string;
    nombre: string;
    telefono?: string;
    visitas_acumuladas?: number;
}

interface MergeCustomersModalProps {
    isOpen: boolean;
    sourceCustomer: { id: string; name: string; phone?: string; visitsCount?: number } | null;
    onClose: () => void;
    onSuccess: () => void;
    otherSearchResults?: any[]; // Resultados de la búsqueda actual para sugerencia rápida
}

export const MergeCustomersModal: React.FC<MergeCustomersModalProps> = ({
    isOpen,
    sourceCustomer,
    onClose,
    onSuccess,
    otherSearchResults = []
}) => {
    const { showToast } = useToast();
    const [searchTerm, setSearchTerm] = useState('');
    const [searchResults, setSearchResults] = useState<CustomerData[]>([]);
    const [selectedDest, setSelectedDest] = useState<CustomerData | null>(null);
    const [isSearching, setIsSearching] = useState(false);
    const [isMerging, setIsMerging] = useState(false);
    const [confirmed, setConfirmed] = useState(false);

    // Métricas del cliente origen a transferir
    const [stats, setStats] = useState({ ninos: 0, transacciones: 0, preventas: 0 });
    const [loadingStats, setLoadingStats] = useState(false);

    useEffect(() => {
        if (isOpen && sourceCustomer) {
            setSearchTerm('');
            setSearchResults([]);
            setSelectedDest(null);
            setConfirmed(false);
            loadSourceStats(sourceCustomer.id);
        }
    }, [isOpen, sourceCustomer]);

    // Buscar clientes destino al escribir
    useEffect(() => {
        if (!searchTerm.trim()) {
            setSearchResults([]);
            return;
        }

        const delayDebounce = setTimeout(async () => {
            setIsSearching(true);
            try {
                // Buscamos tutores excluyendo al origen
                const { data, error } = await supabase
                    .from('clientes')
                    .select('id, nombre, telefono, visitas_acumuladas')
                    .or(`nombre.ilike.%${searchTerm}%,telefono.ilike.%${searchTerm}%`)
                    .neq('id', sourceCustomer?.id)
                    .limit(5);

                if (!error && data) {
                    setSearchResults(data);
                }
            } catch (err) {
                console.error("Error searching destination customer:", err);
            } finally {
                setIsSearching(false);
            }
        }, 300);

        return () => clearTimeout(delayDebounce);
    }, [searchTerm, sourceCustomer]);

    const loadSourceStats = async (id: string) => {
        setLoadingStats(true);
        try {
            const [ninosRes, transRes, prevRes] = await Promise.all([
                supabase.from('ninos').select('*', { count: 'exact', head: true }).eq('cliente_id', id),
                supabase.from('transacciones').select('*', { count: 'exact', head: true }).eq('cliente_id', id),
                supabase.from('preventas').select('*', { count: 'exact', head: true }).eq('cliente_id', id)
            ]);

            setStats({
                ninos: ninosRes.count || 0,
                transacciones: transRes.count || 0,
                preventas: prevRes.count || 0
            });
        } catch (err) {
            console.error("Error loading source stats:", err);
        } finally {
            setLoadingStats(false);
        }
    };

    if (!isOpen || !sourceCustomer) return null;

    // Filtrar otros resultados de búsqueda para sugerencias rápidas (excluyendo al origen)
    const suggestedDestinations = otherSearchResults
        .filter(res => res.type === 'tutor' && res.id !== sourceCustomer.id)
        .map(res => ({
            id: res.id,
            nombre: res.name,
            telefono: res.phone,
            visitas_acumuladas: res.visitsCount
        }))
        // Quitar duplicados por id en sugerencias
        .filter((v, i, a) => a.findIndex(t => t.id === v.id) === i);

    const handleConfirmMerge = async () => {
        if (!selectedDest || !confirmed) return;
        setIsMerging(true);
        try {
            const res = await mergeCustomers(sourceCustomer.id, selectedDest.id);
            if (res.success) {
                showToast("Fusión de clientes completada con éxito", "success");
                onSuccess();
                onClose();
            } else {
                showToast(res.error?.message || "Error al fusionar clientes", "error");
            }
        } catch (err) {
            console.error(err);
            showToast("Error inesperado en la fusión", "error");
        } finally {
            setIsMerging(false);
        }
    };

    const formatDisplayPhone = (rawPhone?: string): string => {
        if (!rawPhone) return 'Sin Teléfono';
        const digits = rawPhone.replace(/\D/g, '');
        if (digits.length === 10) {
            return `(${digits.substring(0, 3)}) ${digits.substring(3, 6)}-${digits.substring(6)}`;
        }
        return rawPhone;
    };

    return (
        <div className={styles.overlay} onClick={onClose}>
            <div className={styles.modal} onClick={e => e.stopPropagation()}>
                <header className={styles.header}>
                    <h3><FontAwesomeIcon icon={faExchangeAlt} /> Fusionar Duplicados</h3>
                    <button className={styles.closeBtn} onClick={onClose}>
                        <FontAwesomeIcon icon={faTimes} />
                    </button>
                </header>

                <div className={styles.content}>
                    {/* ORIGEN (DUPLICADO QUE SE ELIMINARÁ) */}
                    <div className={`${styles.card} ${styles.dangerCard}`} style={{ borderLeft: '4px solid #ef4444' }}>
                        <span className={styles.cardTitle}>Tutor a Eliminar (Origen)</span>
                        <div className={styles.customerName}>{sourceCustomer.name}</div>
                        <div className={styles.customerMeta}>
                            <span><FontAwesomeIcon icon={faUser} /> ID: #{sourceCustomer.id.substring(0, 8).toUpperCase()}</span>
                            {sourceCustomer.phone && (
                                <span><FontAwesomeIcon icon={faPhone} /> {formatDisplayPhone(sourceCustomer.phone)}</span>
                            )}
                        </div>

                        {loadingStats ? (
                            <div style={{ fontSize: '0.85rem', color: '#64748b' }}>
                                <FontAwesomeIcon icon={faSpinner} spin /> Cargando elementos asociados...
                            </div>
                        ) : (
                            <div style={{ marginTop: '0.5rem' }}>
                                <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#475569', marginBottom: '0.25rem' }}>
                                    Elementos que se transferirán:
                                </div>
                                <ul className={styles.statsList}>
                                    <li>🧒 Niños registrados: <strong>{stats.ninos}</strong></li>
                                    <li>🎟️ Visitas en caja: <strong>{sourceCustomer.visitsCount || 0}</strong></li>
                                    <li>💰 Transacciones / Ventas: <strong>{stats.transacciones}</strong></li>
                                    <li>📅 Preventas asociadas: <strong>{stats.preventas}</strong></li>
                                </ul>
                            </div>
                        )}
                    </div>

                    {/* DESTINO (TUTOR QUE SE CONSERVARÁ) */}
                    {selectedDest ? (
                        <div className={styles.card} style={{ borderLeft: '4px solid #10b981', background: '#f0fdf4', borderColor: '#a7f3d0' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span className={styles.cardTitle} style={{ color: '#047857' }}>Tutor a Conservar (Destino)</span>
                                <button className="btn btn-ghost" style={{ padding: '2px 8px', fontSize: '0.75rem', color: '#047857' }} onClick={() => setSelectedDest(null)}>Cambiar</button>
                            </div>
                            <div className={styles.customerName}>{selectedDest.nombre}</div>
                            <div className={styles.customerMeta}>
                                <span><FontAwesomeIcon icon={faUser} /> ID: #{selectedDest.id.substring(0, 8).toUpperCase()}</span>
                                {selectedDest.telefono && (
                                    <span><FontAwesomeIcon icon={faPhone} /> {formatDisplayPhone(selectedDest.telefono)}</span>
                                )}
                                <span>🎟️ {selectedDest.visitas_acumuladas || 0} visitas</span>
                            </div>
                        </div>
                    ) : (
                        <div className={styles.searchSection}>
                            <label style={{ fontSize: '0.85rem', fontWeight: 700, color: '#334155' }}>
                                Selecciona el Tutor de Destino (el que se conservará):
                            </label>

                            <div className={styles.inputGroup}>
                                <FontAwesomeIcon icon={faSearch} className={styles.inputIcon} />
                                <input
                                    type="text"
                                    placeholder="Buscar por nombre o teléfono del tutor principal..."
                                    value={searchTerm}
                                    onChange={e => setSearchTerm(e.target.value)}
                                    className={styles.searchInput}
                                    autoFocus
                                />
                            </div>

                            {/* Resultados de la búsqueda activa */}
                            {isSearching && (
                                <div style={{ textAlign: 'center', padding: '0.5rem', color: '#64748b' }}>
                                    <FontAwesomeIcon icon={faSpinner} spin /> Buscando coincidencias...
                                </div>
                            )}

                            {searchResults.length > 0 && (
                                <div className={styles.suggestionsList}>
                                    <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#94a3b8', paddingBottom: '0.25rem', borderBottom: '1px solid #e2e8f0', marginBottom: '0.25rem' }}>RESULTADOS COINCIDENTES</div>
                                    {searchResults.map(item => (
                                        <div key={item.id} className={styles.suggestionItem}>
                                            <div>
                                                <div style={{ fontWeight: 'bold' }}>{item.nombre}</div>
                                                <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                                                    {item.telefono ? formatDisplayPhone(item.telefono) : 'Sin teléfono'} • {item.visitas_acumuladas || 0} visitas
                                                </div>
                                            </div>
                                            <button className={styles.selectBtn} onClick={() => setSelectedDest(item)}>Seleccionar</button>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Sugerencias rápidas basadas en la búsqueda previa */}
                            {!searchTerm && suggestedDestinations.length > 0 && (
                                <div className={styles.suggestionsList}>
                                    <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#94a3b8', paddingBottom: '0.25rem', borderBottom: '1px solid #e2e8f0', marginBottom: '0.25rem' }}>SUGERENCIAS COINCIDENTES EN LA BÚSQUEDA</div>
                                    {suggestedDestinations.map(item => (
                                        <div key={item.id} className={styles.suggestionItem}>
                                            <div>
                                                <div style={{ fontWeight: 'bold' }}>{item.nombre}</div>
                                                <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                                                    {item.telefono ? formatDisplayPhone(item.telefono) : 'Sin teléfono'} • {item.visitas_acumuladas || 0} visitas
                                                </div>
                                            </div>
                                            <button className={styles.selectBtn} onClick={() => setSelectedDest(item)}>Seleccionar</button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* CONFIRMACIÓN Y ADVERTENCIA */}
                    {selectedDest && (
                        <div className={styles.warningBox}>
                            <div className={styles.warningHeader}>
                                <FontAwesomeIcon icon={faExclamationTriangle} /> Advertencia de Seguridad
                            </div>
                            <div style={{ lineHeight: '1.4' }}>
                                Se transferirán permanentemente todos los niños (🧒), visitas (🎟️), ventas (💰) y preventas de <strong>{sourceCustomer.name}</strong> a <strong>{selectedDest.nombre}</strong>.
                                <br />
                                El registro de <strong>{sourceCustomer.name}</strong> será <strong>ELIMINADO DEFINITIVAMENTE</strong>. Esta acción no se puede deshacer.
                            </div>

                            <label className={styles.checkboxLabel}>
                                <input
                                    type="checkbox"
                                    checked={confirmed}
                                    onChange={e => setConfirmed(e.target.checked)}
                                />
                                <span>Entiendo los riesgos y confirmo que deseo fusionar estos clientes.</span>
                            </label>
                        </div>
                    )}
                </div>

                <footer className={styles.footer}>
                    <button className={styles.btnCancel} onClick={onClose} disabled={isMerging}>
                        Cancelar
                    </button>
                    <button
                        className={styles.btnConfirm}
                        onClick={handleConfirmMerge}
                        disabled={!selectedDest || !confirmed || isMerging}
                    >
                        {isMerging ? (
                            <>
                                <FontAwesomeIcon icon={faSpinner} spin /> Fusionando...
                            </>
                        ) : (
                            <>
                                <FontAwesomeIcon icon={faExchangeAlt} /> Confirmar Fusión
                            </>
                        )}
                    </button>
                </footer>
            </div>
        </div>
    );
};
