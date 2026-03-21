import React, { useState, useEffect } from 'react';
import styles from './Stock.module.css';
import { stockService, type StockItem, type InventoryMovement } from '../../lib/stockService';
import { authService, type UserProfile } from '../../lib/authService';
import { ReportService } from '../../lib/reportService';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faBox, faArrowUp, faArrowDown, faTriangleExclamation, faSpinner, faCheck, faTimes, faShieldAlt, faFilePdf, faFileExcel, faBoxes } from '@fortawesome/free-solid-svg-icons';
import { AuthPinModal } from '../../components/AuthPinModal';
import { useToast } from '../../components/Toast';

export const Stock: React.FC = () => {
    const { showToast } = useToast();
    const [items, setItems] = useState<StockItem[]>([]);
    const [movements, setMovements] = useState<InventoryMovement[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);

    // Modal States
    const [isAdjustOpen, setIsAdjustOpen] = useState(false);
    const [isAuthOpen, setIsAuthOpen] = useState(false);
    const [selectedItem, setSelectedItem] = useState<StockItem | null>(null);
    const [adjustQty, setAdjustQty] = useState(1);
    const [adjustType, setAdjustType] = useState<'entrada' | 'salida'>('entrada');
    const [adjustReason, setAdjustReason] = useState('');
    const [isSaving, setIsSaving] = useState(false);

    const loadData = async () => {
        setIsLoading(true);
        try {
            const [stockTable, recentMoves, me] = await Promise.all([
                stockService.getInventory(),
                stockService.getMovements(),
                authService.getCurrentUser()
            ]);
            setItems(stockTable);
            setMovements(recentMoves);
            setCurrentUser(me);
        } catch (error) {
            showToast('No se pudo cargar el inventario.', 'error', 'Error de Conectividad');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, []);

    const handleOpenAdjust = (item: StockItem) => {
        setSelectedItem(item);
        setAdjustQty(1);
        setAdjustType('entrada');
        setAdjustReason('');
        setIsAdjustOpen(true);
    };

    const handleAuthorized = async (authorizer: UserProfile) => {
        if (!selectedItem || !adjustReason) return;
        setIsAuthOpen(false);
        setIsSaving(true);
        try {
            await stockService.recordMovement(selectedItem.id, adjustQty, adjustType, adjustReason);

            if (currentUser) {
                await authService.logSecurityEvent({
                    autorizadorId: authorizer.id,
                    solicitanteId: currentUser.id,
                    accion: `ajuste_stock_${adjustType}`,
                    motivo: adjustReason,
                    folio: selectedItem.nombre
                });
            }

            showToast(`Ajuste de ${selectedItem.nombre} realizado correctamente.`, 'success', 'Stock Actualizado');
            await loadData();
            setIsAdjustOpen(false);
        } catch (error) {
            showToast('Hubo un problema al guardar el ajuste de stock.', 'error', 'Error de Guardado');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className={styles.stockContainer}>
            <header className={styles.header}>
                <div>
                    <h1><FontAwesomeIcon icon={faBoxes} /> Inventarios</h1>
                    <p>Monitoreo de existencias y reportes de insumos.</p>
                </div>
                <div className={styles.headerActions}>
                    <button className={styles.exportBtn} onClick={async () => {
                        try {
                            await ReportService.generateInventoryReport(items, 'PDF');
                            showToast('Reporte PDF generado', 'success');
                        } catch (e) {
                            showToast('Error al generar PDF', 'error');
                        }
                    }} title="Exportar PDF">
                        <FontAwesomeIcon icon={faFilePdf} /> PDF
                    </button>
                    <button className={`${styles.exportBtn} ${styles.excel}`} onClick={async () => {
                        try {
                            await ReportService.generateInventoryReport(items, 'EXCEL');
                            showToast('Reporte Excel generado', 'success');
                        } catch (e) {
                            showToast('Error al generar Excel', 'error');
                        }
                    }} title="Exportar Excel">
                        <FontAwesomeIcon icon={faFileExcel} /> Excel
                    </button>
                    <button className="btn btn-primary" onClick={() => loadData()}>
                        <FontAwesomeIcon icon={faSpinner} spin={isLoading} /> Re-cargar
                    </button>
                </div>
            </header>

            <div className={styles.statsGrid}>
                <div className={styles.statCard}>
                    <span className={styles.statIcon}><FontAwesomeIcon icon={faBox} /></span>
                    <div className={styles.statInfo}>
                        <span className={styles.statValue}>
                            {isLoading ? '...' : items.reduce((acc, i) => acc + i.cantidad, 0)}
                        </span>
                        <span className={styles.statLabel}>Artículos Totales</span>
                    </div>
                </div>
                <div className={`${styles.statCard} ${styles.warningCard}`}>
                    <span className={styles.statIcon}><FontAwesomeIcon icon={faTriangleExclamation} /></span>
                    <div className={styles.statInfo}>
                        <span className={styles.statValue}>
                            {isLoading ? '...' : items.filter(i => i.cantidad <= i.minimo_alert).length}
                        </span>
                        <span className={styles.statLabel}>Alertas de Reabastecimiento</span>
                    </div>
                </div>
            </div>

            <div className={styles.mainContent}>
                <div className={styles.tableWrapper}>
                    {isLoading ? (
                         <div style={{ padding: '4rem', textAlign: 'center', color: '#94a3b8' }}>
                            <FontAwesomeIcon icon={faSpinner} spin size="2x" />
                            <p style={{ marginTop: '1rem' }}>Cargando inventario...</p>
                         </div>
                    ) : (
                        <table className={styles.table}>
                            <thead>
                                <tr>
                                    <th>Producto</th>
                                    <th>Categoría</th>
                                    <th>Estado</th>
                                    <th>Existencia</th>
                                    <th>Acciones</th>
                                </tr>
                            </thead>
                            <tbody>
                                {items.map(item => {
                                    const isLow = item.cantidad <= item.minimo_alert;
                                    return (
                                    <tr key={item.id} className={isLow ? styles.lowStockRow : ''}>
                                        <td>
                                            <div className={styles.productCellWrapper}>
                                                <div className={styles.productIcon}>📦</div>
                                                <span className={styles.productName}>{item.nombre}</span>
                                            </div>
                                        </td>
                                        <td>{item.categoria}</td>
                                        <td>
                                            <span className={`${styles.badge} ${isLow ? styles.badgeDanger : styles.badgeSuccess}`}>
                                                {isLow ? 'Stock Bajo' : 'Suficiente'}
                                            </span>
                                        </td>
                                        <td className={styles.stockInfoWrapper}>
                                            <strong className={isLow ? styles.textDanger : ''}>{item.cantidad}</strong>
                                            <span className={styles.minText}>/ mín {item.minimo_alert}</span>
                                        </td>
                                        <td className={styles.actions}>
                                            <button 
                                                className={styles.actionBtn} 
                                                title="Ajuste de Stock"
                                                onClick={() => handleOpenAdjust(item)}
                                            >
                                                <FontAwesomeIcon icon={faShieldAlt} />
                                            </button>
                                        </td>
                                    </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    )}
                </div>

                <aside className={styles.historySidebar}>
                    <h3>Movimientos Recientes</h3>
                    <div className={styles.historyList}>
                        {movements.map(move => (
                            <div key={move.id} className={styles.historyItem}>
                                <div className={`${styles.historyIcon} ${move.tipo === 'entrada' ? styles.in : styles.out}`}>
                                    <FontAwesomeIcon icon={move.tipo === 'entrada' ? faArrowUp : faArrowDown} />
                                </div>
                                <div className={styles.historyData}>
                                    <strong>{move.tipo === 'entrada' ? '+' : '-'}{move.cantidad} {move.inventario?.nombre}</strong>
                                    <span>{move.motivo}</span>
                                    <small>{new Date(move.created_at).toLocaleString()}</small>
                                </div>
                            </div>
                        ))}
                    </div>
                </aside>
            </div>

            {/* Modal de Ajuste */}
            {isAdjustOpen && selectedItem && (
                <div className={styles.modalOverlay}>
                    <div className={styles.modal}>
                        <div className={styles.modalHeader}>
                            <h3>Ajuste Manual: {selectedItem.nombre}</h3>
                            <button onClick={() => setIsAdjustOpen(false)} className={styles.closeBtn}>
                                <FontAwesomeIcon icon={faTimes} />
                            </button>
                        </div>
                        <div className={styles.modalBody}>
                            <div className={styles.adjustTypeToggle}>
                                <button className={adjustType === 'entrada' ? styles.activeIn : ''} onClick={() => setAdjustType('entrada')}>Entrada</button>
                                <button className={adjustType === 'salida' ? styles.activeOut : ''} onClick={() => setAdjustType('salida')}>Salida</button>
                            </div>
                            <div className={styles.inputGroup}><label>Cantidad de piezas</label><input type="number" value={adjustQty} min="1" onChange={(e) => setAdjustQty(Number(e.target.value))} onFocus={(e) => e.target.select()} /></div>
                            <div className={styles.inputGroup}><label>Motivo del ajuste</label><input type="text" placeholder="Ej: Reposición..." value={adjustReason} onChange={(e) => setAdjustReason(e.target.value)} /></div>
                        </div>
                        <div className={styles.modalFooter}>
                            <button className="btn btn-ghost" onClick={() => setIsAdjustOpen(false)}>Cancelar</button>
                            <button className="btn btn-primary" onClick={() => setIsAuthOpen(true)} disabled={isSaving || !adjustReason}>
                                {isSaving ? <FontAwesomeIcon icon={faSpinner} spin /> : <><FontAwesomeIcon icon={faCheck} /> Solicitar Autorización</>}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <AuthPinModal isOpen={isAuthOpen} onClose={() => setIsAuthOpen(false)} onAuthorized={handleAuthorized} actionLabel={`Autorizar ajuste de stock: ${selectedItem?.nombre}`} />
        </div>
    );
};
