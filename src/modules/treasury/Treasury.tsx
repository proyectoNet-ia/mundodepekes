import React, { useState, useEffect } from 'react';
import styles from './Treasury.module.css';
import { getActiveSession, openCash, closeCash, getTransactionsSummary, recordExpense, getExpenses, type CashSession, type Expense, getShiftTransactions, cancelTransaction } from '../../lib/treasuryService';
import { ReportService } from '../../lib/reportService';
import { useToast } from '../../components/Toast';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCashRegister, faLock, faLockOpen, faCheckCircle, faExclamationTriangle, faMoneyBillWave, faCreditCard, faMinusCircle, faCartArrowDown, faReceipt, faShieldAlt, faTicketAlt, faBan, faTimes, faSpinner } from '@fortawesome/free-solid-svg-icons';
import { AuthPinModal } from '../../components/AuthPinModal';
import type { UserProfile } from '../../lib/authService';

const formatMoney = (val: string) => {
    const clean = val.replace(/\D/g, '');
    if (!clean) return '';
    return new Intl.NumberFormat('es-MX').format(parseInt(clean));
};

const getNumericAmount = (val: string) => {
    return Number(val.replace(/,/g, '')) || 0;
};

interface TreasuryProps {
    onCancel: () => void;
}

export const Treasury: React.FC<TreasuryProps> = ({ onCancel }) => {
    const { showToast } = useToast();
    const [activeSession, setActiveSession] = useState<CashSession | null>(null);
    const [summary, setSummary] = useState({ efectivo: 0, tarjeta: 0, gastos: 0, total: 0 });
    const [expenses, setExpenses] = useState<Expense[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [montoApertura, setMontoApertura] = useState('');
    const [obs, setObs] = useState('');

    // Modal Gastos
    const [showExpenseModal, setShowExpenseModal] = useState(false);
    const [expenseMonto, setExpenseMonto] = useState('');
    const [expenseDesc, setExpenseDesc] = useState('');
    const [hasTicket, setHasTicket] = useState(false);
    const [showAuthModal, setShowAuthModal] = useState(false);
    const [authActionPayload, setAuthActionPayload] = useState<{type: 'expense' | 'cancel_ticket', data?: any} | null>(null);
    const [authorizer, setAuthorizer] = useState<UserProfile | null>(null);
    const [isSavingExpense, setIsSavingExpense] = useState(false);

    // Tickets Modal
    const [showTicketsModal, setShowTicketsModal] = useState(false);
    const [shiftTransactions, setShiftTransactions] = useState<any[]>([]);

    const loadData = async () => {
        setIsLoading(true);
        try {
            const session = await getActiveSession();
            setActiveSession(session);

            if (session) {
                const [transSummary, expensesData] = await Promise.all([
                    getTransactionsSummary(session.fecha_apertura, session.id),
                    getExpenses(session.id)
                ]);
                setSummary(transSummary);
                setExpenses(expensesData);
            }
        } catch (error) {
            console.error(error);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, []);

    const loadShiftTransactions = async (sessionId: string) => {
        try {
            const txs = await getShiftTransactions(sessionId);
            setShiftTransactions(txs);
        } catch(e) { console.error('Error cargando transacciones', e); }
    };

    const handleOpenTickets = async () => {
        if(activeSession) {
            await loadShiftTransactions(activeSession.id);
            setShowTicketsModal(true);
        }
    };

    const handleRequestCancel = (tx: any) => {
        setAuthActionPayload({ type: 'cancel_ticket', data: tx });
        setShowAuthModal(true);
    };

    const executeCancelTicket = async (txId: string, managerName: string) => {
        const reason = prompt('Motivo de la cancelación del ticket:');
        if (!reason) return;
        setIsLoading(true);
        try {
            await cancelTransaction(txId, managerName, reason);
            showToast('Ticket y sesiones anuladas correctamente', 'success');
            if (activeSession) await loadShiftTransactions(activeSession.id);
            await loadData();
        } catch(e) {
            showToast('No se pudo anular la transacción', 'error');
        } finally {
            setIsLoading(false);
        }
    };

    const handleOpen = async () => {
        const monto = getNumericAmount(montoApertura);
        if (!montoApertura || isNaN(monto)) return showToast('Ingrese un monto válido', 'warning', 'Atención');
        
        setIsLoading(true);
        try {
            await openCash(monto);
            showToast('Caja abierta correctamente', 'success', 'Operación Exitosa');
            await loadData();
        } catch (error) {
            showToast('Error al intentar abrir la caja. Consulte al administrador.', 'error', 'Error Sistema');
        } finally {
            setIsLoading(false);
        }
    };

    const [showCloseModal, setShowCloseModal] = useState(false);
    const [montoReal, setMontoReal] = useState('');

    const handleClose = async () => {
        if (!activeSession) return;
        const monto = getNumericAmount(montoReal);
        if (!montoReal || isNaN(monto)) return showToast('Ingrese el monto real contado.', 'warning', 'Arqueo Erróneo');

        setIsLoading(true);
        try {
            const { estado: estadoFinal } = await closeCash(activeSession.id, {
                efectivo: summary.efectivo,
                tarjeta: summary.tarjeta,
                real: monto,
                obs: obs
            });
            
            // Generar reporte automático al cerrar
            const closingSession: CashSession = {
                ...activeSession,
                monto_final_real: monto,
                estado: estadoFinal
            };
            await ReportService.generateClosureReport(closingSession, summary, 'PDF');

            showToast('Caja cerrada correctamente. Documento generado.', 'success', 'Arqueo Finalizado');
            setObs('');
            setMontoReal('');
            setShowCloseModal(false);
            await loadData();
        } catch (error) {
            showToast('No se pudo completar el cierre de caja.', 'error', 'Error Técnico');
        } finally {
            setIsLoading(false);
        }
    };

    const handleRecordExpense = async () => {
        const monto = getNumericAmount(expenseMonto);
        if (!monto || !expenseDesc) return showToast('Ingrese monto y concepto del gasto', 'warning');

        setIsSavingExpense(true);
        try {
            await recordExpense(monto, expenseDesc, hasTicket, authorizer?.email || 'Gerente', 'Insumos');
            showToast('Gasto registrado y autorizado', 'success');
            setExpenseMonto('');
            setExpenseDesc('');
            setHasTicket(false);
            setAuthorizer(null);
            setShowExpenseModal(false);
            await loadData();
        } catch (error) {
            showToast('No se pudo registrar el gasto', 'error');
        } finally {
            setIsSavingExpense(false);
        }
    };

    if (!activeSession && !isLoading) {
        return (
            <div className={styles.cashClosedNotice}>
                <div className={styles.premiumLockCard}>
                    <div className={styles.lockIconCircle}>
                        <FontAwesomeIcon icon={faLock} />
                    </div>
                    <h2>Caja Cerrada</h2>
                    <p>Para procesar ventas, primero debe iniciar un turno de caja.</p>
                    
                    <div className={styles.quickOpenForm}>
                        <label>FONDO INICIAL EN CAJA</label>
                        <div className={styles.openInputGroup}>
                            <span>$</span>
                            <input 
                                type="text" 
                                value={montoApertura} 
                                onChange={(e) => setMontoApertura(formatMoney(e.target.value))}
                                onFocus={(e) => e.target.select()}
                                placeholder="0.00"
                            />
                        </div>
                        <button 
                            className={styles.openCashBtn} 
                            onClick={handleOpen}
                            disabled={isLoading}
                        >
                            {isLoading ? <FontAwesomeIcon icon={faSpinner} spin /> : 'Abrir Turno Ahora'}
                        </button>
                        <button className={styles.secondaryNavBtn} onClick={onCancel}>
                            Volver al Dashboard
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className={styles.container}>
            <header className={styles.header}>
                <div className={styles.headerTitle}>
                    <h2><FontAwesomeIcon icon={faMoneyBillWave} /> Caja / Ventas</h2>
                    <span className={styles.badgeOpen}><FontAwesomeIcon icon={faLockOpen} /> Turno Abierto</span>
                </div>
                <div className={styles.sessionMeta}>
                    Iniciado el {activeSession ? new Date(activeSession.fecha_apertura).toLocaleDateString() : ''} a las {activeSession ? new Date(activeSession.fecha_apertura).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                </div>
            </header>

            <div className={styles.mainGrid}>
                <section className={styles.summaryCard}>
                    <div className={styles.cardHeader}>
                        <h3>Arqueo de Turno</h3>
                        <span className={styles.montoInicial}>Fondo: ${activeSession?.monto_inicial.toFixed(2)}</span>
                    </div>

                    <div className={styles.metricsGrid}>
                        <div className={styles.metricItem}>
                            <div className={styles.metricIcon} style={{ background: '#dcfce7', color: '#166534' }}>
                                <FontAwesomeIcon icon={faMoneyBillWave} />
                            </div>
                            <div className={styles.metricInfo}>
                                <span>Ventas Efectivo</span>
                                <strong>${summary.efectivo.toFixed(2)}</strong>
                            </div>
                        </div>
                        <div className={styles.metricItem}>
                            <div className={styles.metricIcon} style={{ background: '#e0f2fe', color: '#075985' }}>
                                <FontAwesomeIcon icon={faCreditCard} />
                            </div>
                            <div className={styles.metricInfo}>
                                <span>Ventas Tarjeta</span>
                                <strong>${summary.tarjeta.toFixed(2)}</strong>
                            </div>
                        </div>
                        <div className={styles.metricItem}>
                            <div className={styles.metricIcon} style={{ background: '#fef2f2', color: '#991b1b' }}>
                                <FontAwesomeIcon icon={faMinusCircle} />
                            </div>
                            <div className={styles.metricInfo}>
                                <span>Gastos / Salidas</span>
                                <strong>-${summary.gastos.toFixed(2)}</strong>
                            </div>
                        </div>
                    </div>

                    <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
                        <button 
                            className={styles.expenseActionBtn} 
                            style={{ flex: 1, background: '#f8fafc', color: '#0f172a', border: '1px solid #e2e8f0' }}
                            onClick={handleOpenTickets}
                        >
                            <FontAwesomeIcon icon={faTicketAlt} style={{ color: '#3b82f6' }} /> CONSULTAR TICKETS
                        </button>
                        <button 
                            className={styles.expenseActionBtn} 
                            style={{ flex: 1 }}
                            onClick={() => { setAuthActionPayload({type: 'expense'}); setShowAuthModal(true); }}
                        >
                            <FontAwesomeIcon icon={faShieldAlt} /> REGISTRAR GASTO
                        </button>
                    </div>

                    <div className={styles.totalSection}>
                        <div className={styles.totalRow}>
                            <span>Ingresos Totales (Ventas):</span>
                            <span>${(summary.efectivo + summary.tarjeta).toFixed(2)}</span>
                        </div>
                        <div className={styles.totalRow} style={{ color: '#dc2626' }}>
                            <span>Egresos Totales (Gastos):</span>
                            <span>-${summary.gastos.toFixed(2)}</span>
                        </div>
                        <div className={styles.totalRow + ' ' + styles.finalTotal}>
                            <span>Saldo Neto en Caja:</span>
                            <strong>${(activeSession ? activeSession.monto_inicial + summary.efectivo + summary.tarjeta - summary.gastos : 0).toFixed(2)}</strong>
                        </div>
                    </div>

                    <div className={styles.obsSection}>
                        <label>Observaciones de Cierre</label>
                        <textarea 
                            placeholder="Anomalías, notas de efectivo, etc."
                            value={obs}
                            onChange={(e) => setObs(e.target.value)}
                        />
                    </div>

                    <button 
                        className={styles.closeBtn} 
                        onClick={() => setShowCloseModal(true)} 
                        disabled={isLoading}
                    >
                        <FontAwesomeIcon icon={faCheckCircle} /> Finalizar Turno y Cerrar Caja
                    </button>

                    {showCloseModal && activeSession && (
                        <div className={styles.modalOverlay} onClick={() => setShowCloseModal(false)}>
                            <div className={styles.modalContent} onClick={e => e.stopPropagation()}>
                                <div className={styles.modalHeader}>
                                    <h3>Confirmar Cierre de Caja</h3>
                                    <p>Revisión final de valores antes de cerrar el turno.</p>
                                </div>
                                
                                <div className={styles.balanceInfo}>
                                    <div className={styles.balanceRow}>
                                        <span><FontAwesomeIcon icon={faCashRegister} style={{marginRight: '8px'}} /> Fondo Inicial:</span>
                                        <span>${activeSession.monto_inicial.toFixed(2)}</span>
                                    </div>
                                    <div className={styles.balanceRow}>
                                        <span><FontAwesomeIcon icon={faMoneyBillWave} style={{marginRight: '8px'}} /> Ventas Efectivo:</span>
                                        <span>+${summary.efectivo.toFixed(2)}</span>
                                    </div>
                                    <div className={styles.balanceRow}>
                                        <span><FontAwesomeIcon icon={faMinusCircle} style={{marginRight: '8px'}} /> Gastos Registrados:</span>
                                        <span>-${summary.gastos.toFixed(2)}</span>
                                    </div>
                                    <hr style={{ margin: '1rem 0', border: 'none', borderTop: '1px solid var(--border-color)' }} />
                                    <div className={styles.balanceRow}>
                                        <span style={{ fontWeight: 800 }}>Esperado en Efectivo:</span>
                                        <strong style={{ fontSize: '1.8rem', color: 'var(--brand-600)' }}>
                                            ${(activeSession.monto_inicial + summary.efectivo - summary.gastos).toFixed(2)}
                                        </strong>
                                    </div>
                                </div>

                                <div className={styles.inputGroup}>
                                    <label>Monto real contado en caja (Total)</label>
                                    <div className={styles.inputWithIcon}>
                                        <span>$</span>
                                        <input 
                                            type="text" 
                                            autoFocus
                                            value={montoReal}
                                            onChange={(e) => setMontoReal(formatMoney(e.target.value))}
                                            onFocus={(e) => e.target.select()}
                                            placeholder="0.00"
                                        />
                                    </div>
                                </div>

                                <div className={styles.modalActions}>
                                    <button className="btn btn-secondary" onClick={() => setShowCloseModal(false)}>
                                        Cancelar
                                    </button>
                                    <button className="btn btn-primary" onClick={handleClose} disabled={isLoading}>
                                        {isLoading ? 'Cerrando...' : 'Finalizar Turno'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {showExpenseModal && (
                        <div className={styles.modalOverlay} onClick={() => setShowExpenseModal(false)}>
                            <div className={styles.modalContent} onClick={e => e.stopPropagation()}>
                                <div className={styles.modalHeader}>
                                    <h3>Registrar Salida de Efectivo</h3>
                                    <p>Este monto se descontará automáticamente del efectivo esperado al cierre.</p>
                                </div>
                                
                                <div className={styles.inputGroup}>
                                    <label>Concepto / Concepto del Gasto</label>
                                    <input 
                                        type="text"
                                        placeholder="Ej: Compra de insumos, pago de servicios..."
                                        value={expenseDesc}
                                        onChange={(e) => setExpenseDesc(e.target.value)}
                                        autoFocus
                                    />
                                </div>

                                <div className={styles.inputGroup}>
                                    <label>Monto a retirar de caja</label>
                                    <div className={styles.inputWithIcon}>
                                        <span>$</span>
                                        <input 
                                            type="text" 
                                            value={expenseMonto}
                                            onChange={(e) => setExpenseMonto(formatMoney(e.target.value))}
                                            placeholder="0.00"
                                        />
                                    </div>
                                </div>

                                <div style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '12px', padding: '1rem', background: '#f8fafc', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
                                    <input 
                                        type="checkbox" 
                                        id="hasTicket"
                                        checked={hasTicket}
                                        onChange={(e) => setHasTicket(e.target.checked)}
                                        style={{ width: '20px', height: '20px', cursor: 'pointer' }}
                                    />
                                    <label htmlFor="hasTicket" style={{ cursor: 'pointer', fontWeight: 600, color: 'var(--text-primary)', userSelect: 'none' }}>
                                        ¿Cuenta con comprobante / ticket físico?
                                    </label>
                                </div>

                                <div className={styles.modalActions}>
                                    <button className="btn btn-secondary" onClick={() => setShowExpenseModal(false)}>
                                        Cancelar
                                    </button>
                                    <button className="btn btn-danger" onClick={handleRecordExpense} disabled={isSavingExpense}>
                                        {isSavingExpense ? 'Guardando...' : 'Confirmar Salida'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                    <p className={styles.helpText}><FontAwesomeIcon icon={faExclamationTriangle} /> Asegúrese de contar el efectivo físico antes de cerrar.</p>
                </section>

                <section className={styles.expensesCard}>
                    <div className={styles.cardHeader}>
                        <h3><FontAwesomeIcon icon={faCartArrowDown} /> Gastos del Turno</h3>
                    </div>
                    <div className={styles.expensesList}>
                        {expenses.length > 0 ? expenses.map(exp => (
                            <div key={exp.id} className={styles.expenseItem}>
                                <div className={styles.expenseData}>
                                    <span className={styles.expenseDesc}>
                                        {exp.tiene_comprobante && <FontAwesomeIcon icon={faReceipt} style={{ color: '#10b981', marginRight: '6px' }} title="Con Comprobante" />}
                                        {exp.descripcion}
                                    </span>
                                    <small>{new Date(exp.fecha || exp.id).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</small>
                                </div>
                                <strong className={styles.expenseAmount}>-${exp.monto.toFixed(2)}</strong>
                            </div>
                        )) : (
                            <p className={styles.emptyText}>No hay gastos registrados.</p>
                        )}
                    </div>
                    {showTicketsModal && (
                        <div className={styles.modalOverlay} onClick={() => setShowTicketsModal(false)}>
                            <div className={styles.modalContent} style={{ maxWidth: '800px', width: '90%' }} onClick={e => e.stopPropagation()}>
                                <div className={styles.modalHeader}>
                                    <div>
                                        <h3><FontAwesomeIcon icon={faTicketAlt} /> Tickets del Turno</h3>
                                        <p>Historial de ventas y operaciones de la jornada actual.</p>
                                    </div>
                                    <button onClick={() => setShowTicketsModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.2rem', color: '#94a3b8' }}>
                                        <FontAwesomeIcon icon={faTimes} />
                                    </button>
                                </div>
                                <div style={{ maxHeight: '60vh', overflowY: 'auto', padding: '1rem 0' }}>
                                    <table className={styles.table} style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse' }}>
                                        <thead>
                                            <tr style={{ borderBottom: '2px solid #e2e8f0' }}>
                                                <th style={{ padding: '0.75rem' }}>Folio</th>
                                                <th style={{ padding: '0.75rem' }}>Hora</th>
                                                <th style={{ padding: '0.75rem' }}>Cliente</th>
                                                <th style={{ padding: '0.75rem' }}>Total</th>
                                                <th style={{ padding: '0.75rem' }}>Estado</th>
                                                <th style={{ padding: '0.75rem', textAlign: 'right' }}>Acción</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {shiftTransactions.length === 0 ? (
                                                <tr><td colSpan={6} style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>No hay ventas en este turno.</td></tr>
                                            ) : shiftTransactions.map(tx => (
                                                <tr key={tx.id} style={{ borderBottom: '1px solid #f1f5f9', opacity: tx.estado === 'cancelado' ? 0.6 : 1 }}>
                                                    <td style={{ padding: '0.75rem', fontFamily: 'monospace' }}>{tx.id.substring(0,8).toUpperCase()}</td>
                                                    <td style={{ padding: '0.75rem' }}>{new Date(tx.fecha).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</td>
                                                    <td style={{ padding: '0.75rem' }}>{tx.clientes?.nombre || 'General'}</td>
                                                    <td style={{ padding: '0.75rem', fontWeight: 600 }}>${tx.total} <br/><small style={{ color: '#64748b', fontWeight: 'normal' }}>{tx.metodo_pago}</small></td>
                                                    <td style={{ padding: '0.75rem' }}>
                                                        <span className={tx.estado === 'pagado' ? styles.badgeOpen : ''} style={{ background: tx.estado === 'cancelado' ? '#fef2f2' : undefined, color: tx.estado === 'cancelado' ? '#ef4444' : undefined, padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.8rem', fontWeight: 700 }}>
                                                            {tx.estado.toUpperCase()}
                                                        </span>
                                                    </td>
                                                    <td style={{ padding: '0.75rem', textAlign: 'right' }}>
                                                        {tx.estado !== 'cancelado' && (
                                                            <button 
                                                                onClick={() => handleRequestCancel(tx)}
                                                                style={{ background: '#fee2e2', color: '#ef4444', border: 'none', padding: '0.4rem 0.8rem', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 }}
                                                            >
                                                                <FontAwesomeIcon icon={faBan} /> Anular
                                                            </button>
                                                        )}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    )}

                </section>

                <AuthPinModal 
                    isOpen={showAuthModal}
                    onClose={() => setShowAuthModal(false)}
                    actionLabel={authActionPayload?.type === 'cancel_ticket' ? 'Autorizar anulación de ticket' : 'Autorizar salida de efectivo de caja'}
                    onAuthorized={(user) => {
                        setAuthorizer(user);
                        setShowAuthModal(false);
                        if (authActionPayload?.type === 'expense') {
                             setShowExpenseModal(true);
                        } else if (authActionPayload?.type === 'cancel_ticket') {
                             executeCancelTicket(authActionPayload.data.id, user.email);
                        }
                    }}
                />
            </div>
        </div>
    );
};
