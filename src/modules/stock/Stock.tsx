import React, { useState, useEffect } from 'react';
import styles from './Stock.module.css';
import { stockService, type StockItem, type InventoryMovement } from '../../lib/stockService';
import { authService, type UserProfile } from '../../lib/authService';
import { ReportService } from '../../lib/reportService';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faBox, faArrowUp, faArrowDown, faTriangleExclamation, faSpinner, faCheck, faTimes, faShieldAlt, faFilePdf, faFileExcel, faBoxes, faPlus, faEdit, faTrash } from '@fortawesome/free-solid-svg-icons';
import { AuthPinModal } from '../../components/AuthPinModal';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { useToast } from '../../components/Toast';
import { getSystemSettings } from '../../lib/settingsService';

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

    // Config States
    const [showCreateItem, setShowCreateItem] = useState(false);
    const [editingItem, setEditingItem] = useState<StockItem | null>(null);
    const [deletingItem, setDeletingItem] = useState<StockItem | null>(null);
    const [categories, setCategories] = useState<string[]>([]);
    const [currentPage, setCurrentPage] = useState(1);

    const loadData = async () => {
        setIsLoading(true);
        try {
            const [stockTable, recentMoves, me, settings] = await Promise.all([
                stockService.getInventory(),
                stockService.getMovements(),
                authService.getCurrentUser(),
                getSystemSettings()
            ]);
            setItems(stockTable);
            setMovements(recentMoves);
            setCurrentUser(me);
            setCategories(settings.categorias_inventario || []);
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
        if (!selectedItem) return;
        
        const finalReason = adjustReason.trim() || 'Ajuste manual de inventario';
        setIsAuthOpen(false);
        setIsSaving(true);
        try {
            await stockService.recordMovement(selectedItem.id, adjustQty, adjustType, finalReason);

            if (currentUser) {
                await authService.logSecurityEvent({
                    autorizadorId: authorizer.id,
                    solicitanteId: currentUser.id,
                    accion: `ajuste_stock_${adjustType}`,
                    motivo: finalReason,
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

    const isAdmin = currentUser?.role === 'admin';

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
                    {isAdmin && (
                        <button className="btn btn-primary" onClick={() => setShowCreateItem(true)}>
                            <FontAwesomeIcon icon={faPlus} /> Nuevo Producto
                        </button>
                    )}
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
                {/* Tabla desktop */}
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
                                            <button className={styles.actionBtn} title="Ajuste de Stock" onClick={() => handleOpenAdjust(item)}>
                                                <FontAwesomeIcon icon={faShieldAlt} />
                                            </button>
                                            {isAdmin && (
                                                <>
                                                    <button className={styles.actionBtn} onClick={() => setEditingItem(item)} title="Editar Configuración">
                                                        <FontAwesomeIcon icon={faEdit} />
                                                    </button>
                                                    <button className={`${styles.actionBtn} ${styles.textDanger}`} onClick={() => setDeletingItem(item)} title="Eliminar Producto">
                                                        <FontAwesomeIcon icon={faTrash} />
                                                    </button>
                                                </>
                                            )}
                                        </td>
                                    </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    )}
                </div>

                {/* Cards compactas para móvil — fuera del tableWrapper */}
                {!isLoading && (
                    <div className={styles.mobileCardList}>
                        {items.map(item => {
                            const isLow = item.cantidad <= item.minimo_alert;
                            return (
                            <div key={item.id} className={`${styles.mobileCard} ${isLow ? styles.mobileCardLow : ''}`}>
                                <div className={styles.mobileCardMain}>
                                    <div className={styles.productIcon}>📦</div>
                                    <span className={styles.productName}>{item.nombre}</span>
                                </div>
                                <div className={styles.mobileCardMeta}>
                                    <span className={styles.mobileMetaCat}>{item.categoria}</span>
                                    <span className={`${styles.badge} ${isLow ? styles.badgeDanger : styles.badgeSuccess}`}>
                                        {isLow ? 'Bajo' : 'OK'}
                                    </span>
                                    <span className={`${styles.mobileMetaStock} ${isLow ? styles.textDanger : ''}`}>
                                        <strong>{item.cantidad}</strong>
                                        <span className={styles.minText}>/mín {item.minimo_alert}</span>
                                    </span>
                                </div>
                                <div className={styles.mobileCardActions} style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
                                    <button className={styles.mobileCardBtn} title="Ajuste" onClick={() => handleOpenAdjust(item)}>
                                        <FontAwesomeIcon icon={faShieldAlt} />
                                    </button>
                                    {isAdmin && (
                                        <>
                                            <button className={styles.mobileCardBtn} onClick={() => setEditingItem(item)}>
                                                <FontAwesomeIcon icon={faEdit} />
                                            </button>
                                            <button className={`${styles.mobileCardBtn} ${styles.textDanger}`} onClick={() => setDeletingItem(item)}>
                                                <FontAwesomeIcon icon={faTrash} />
                                            </button>
                                        </>
                                    )}
                                </div>
                            </div>
                            );
                        })}
                    </div>
                )}
            </div>

            <section className={styles.historySection}>
                <div className={styles.sectionHeader}>
                    <h3>Historial de Movimientos</h3>
                    <div className={styles.pagination}>
                        <button 
                            className={styles.pageBtn} 
                            disabled={currentPage === 1} 
                            onClick={() => setCurrentPage(p => p - 1)}
                        >
                            Anterior
                        </button>
                        <span className={styles.pageInfo}>Página {currentPage}</span>
                        <button 
                            className={styles.pageBtn} 
                            disabled={movements.length <= currentPage * 5} 
                            onClick={() => setCurrentPage(p => p + 1)}
                        >
                            Siguiente
                        </button>
                    </div>
                </div>
                
                <div className={styles.historyGrid}>
                    {movements.slice((currentPage - 1) * 5, currentPage * 5).map(move => {
                        const cleanMotivo = (move.motivo || '').replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '...');
                        const shortDate = new Date(move.created_at).toLocaleString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
                        return (
                            <div key={move.id} className={styles.historyCard}>
                                <div className={`${styles.historyIcon} ${move.tipo === 'entrada' ? styles.in : styles.out}`}>
                                    <FontAwesomeIcon icon={move.tipo === 'entrada' ? faArrowUp : faArrowDown} />
                                </div>
                                <div className={styles.historyData}>
                                    <strong>{move.tipo === 'entrada' ? '+' : '-'}{move.cantidad} {move.inventario?.nombre}</strong>
                                    <span>{cleanMotivo}</span>
                                    <small>{shortDate}</small>
                                </div>
                            </div>
                        );
                    })}
                    {movements.length === 0 && !isLoading && (
                        <div className={styles.emptyHistory}>No hay movimientos registrados recientemente.</div>
                    )}
                </div>
            </section>

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
                            <button 
                                className="btn btn-primary" 
                                onClick={() => {
                                    if (isAdmin) {
                                        // Si es admin, autoriza automáticamente
                                        handleAuthorized({ id: currentUser!.id, email: currentUser!.email, role: 'admin' });
                                    } else {
                                        setIsAuthOpen(true);
                                    }
                                }} 
                                disabled={isSaving || adjustQty <= 0}
                            >
                                {isSaving ? <FontAwesomeIcon icon={faSpinner} spin /> : (
                                    isAdmin ? <><FontAwesomeIcon icon={faCheck} /> Aplicar Ajuste</> : <><FontAwesomeIcon icon={faCheck} /> Solicitar Autorización</>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal Crear/Editar Producto (Configuración) */}
            {(showCreateItem || editingItem) && (
                <div className={styles.modalOverlay}>
                    <div className={styles.modal} style={{ maxWidth: '450px' }}>
                        <div className={styles.modalHeader}>
                            <h3>
                                <FontAwesomeIcon icon={editingItem ? faEdit : faPlus} style={{ marginRight: '0.5rem', opacity: 0.8 }} />
                                {editingItem ? 'Editar Producto' : 'Nuevo Producto'}
                            </h3>
                            <button onClick={() => { setShowCreateItem(false); setEditingItem(null); }} className={styles.closeBtn}><FontAwesomeIcon icon={faTimes} /></button>
                        </div>

                        <form 
                            onSubmit={async (e) => {
                                e.preventDefault();
                                const f = new FormData(e.currentTarget);
                                const data = {
                                    nombre: f.get('nombre') as string,
                                    categoria: f.get('categoria') as string,
                                    minimo_alert: parseInt(f.get('minimo_alert') as string),
                                    precio_venta: parseFloat(f.get('precio_venta') as string),
                                    cantidad: editingItem ? editingItem.cantidad : parseInt(f.get('cantidad_inicial') as string || '0')
                                };

                                setIsSaving(true);
                                try {
                                    if (editingItem) {
                                        await stockService.updateItem(editingItem.id, data);
                                        showToast('Producto actualizado.', 'success');
                                    } else {
                                        const newItem = await stockService.createItem({ ...data, cantidad: 0 });
                                        // Si se inició con stock, registrar el movimiento inicial
                                        if (data.cantidad > 0) {
                                            await stockService.recordMovement(newItem.id, data.cantidad, 'entrada', 'Carga inicial de inventario');
                                        }
                                        showToast('Producto creado con éxito.', 'success');
                                    }
                                    setShowCreateItem(false);
                                    setEditingItem(null);
                                    loadData();
                                } catch (err: any) {
                                    showToast('Error al guardar el producto.', 'error');
                                } finally {
                                    setIsSaving(false);
                                }
                            }}
                            style={{ padding: '1.5rem' }}
                        >
                            <div className={styles.inputGroup}>
                                <label>Nombre del Producto</label>
                                <input name="nombre" type="text" required defaultValue={editingItem?.nombre || ''} placeholder="Ej. Botella de Agua 350ml" />
                            </div>
                            
                            <div className={styles.inputGroup}>
                                <label>Categoría</label>
                                <input name="categoria" list="categories-list" required defaultValue={editingItem?.categoria || ''} placeholder="Seleccionar o escribir..." />
                                <datalist id="categories-list">
                                    {categories.map(c => <option key={c} value={c} />)}
                                </datalist>
                            </div>

                            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                                <div className={styles.inputGroup} style={{ flex: '1 1 120px' }}>
                                    <label>Existencia {editingItem ? '' : 'Inicial'}</label>
                                    <input 
                                        name="cantidad_inicial" 
                                        type="number" 
                                        required 
                                        defaultValue={editingItem ? editingItem.cantidad : ''} 
                                        min="0" 
                                        disabled={!!editingItem} 
                                        title={editingItem ? "La existencia se modifica mediante Ajuste de Stock" : ""} 
                                        onFocus={(e) => e.target.select()}
                                        placeholder="0"
                                    />
                                    {editingItem && <small style={{ opacity: 0.6, fontSize: '0.7rem', display: 'block', marginTop: '4px' }}>Para cambiar use "Ajuste"</small>}
                                </div>
                                <div className={styles.inputGroup} style={{ flex: '1 1 120px' }}>
                                    <label>Umbral Mínimo</label>
                                    <input 
                                        name="minimo_alert" 
                                        type="number" 
                                        required 
                                        defaultValue={editingItem ? editingItem.minimo_alert : ''} 
                                        min="0" 
                                        onFocus={(e) => e.target.select()}
                                        placeholder="10"
                                    />
                                </div>
                                <div className={styles.inputGroup} style={{ flex: '1 1 120px' }}>
                                    <label>Precio Venta ($)</label>
                                    <input 
                                        name="precio_venta" 
                                        type="number" 
                                        required 
                                        defaultValue={editingItem ? editingItem.precio_venta : ''} 
                                        min="0" 
                                        step="0.01" 
                                        onFocus={(e) => e.target.select()}
                                        placeholder="0.00"
                                    />
                                </div>
                            </div>

                            <div className={styles.modalFooter}>
                                <button type="button" onClick={() => { setShowCreateItem(false); setEditingItem(null); }} className="btn btn-ghost">Cancelar</button>
                                <button type="submit" className="btn btn-primary" disabled={isSaving}>
                                    {isSaving ? 'Guardando...' : (editingItem ? 'Actualizar' : 'Crear')}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            <AuthPinModal isOpen={isAuthOpen} onClose={() => setIsAuthOpen(false)} onAuthorized={handleAuthorized} actionLabel={`Autorizar ajuste de stock: ${selectedItem?.nombre}`} />

            <ConfirmDialog
                isOpen={!!deletingItem}
                title="Archivar Producto"
                message={`¿Está seguro de archivar el producto "${deletingItem?.nombre}"? Dejará de aparecer en las ventas y el reporte de stock, pero se conservará su historial de movimientos.`}
                confirmText="SÍ, ARCHIVAR"
                cancelText="Cancelar"
                status="warning"
                onCancel={() => setDeletingItem(null)}
                onConfirm={async () => {
                    if (deletingItem) {
                        try {
                            await stockService.deleteItem(deletingItem.id);
                            showToast('Producto eliminado correctamente.', 'success');
                            loadData();
                        } catch (e) {
                            showToast('Error al eliminar producto.', 'error');
                        } finally {
                            setDeletingItem(null);
                        }
                    }
                }}
            />
        </div>
    );
};
