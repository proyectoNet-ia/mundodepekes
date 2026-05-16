import React, { useState, useEffect } from 'react';
import styles from './Treasury.module.css';
import { getActiveSession, openCash, closeCash, getTransactionsSummary, recordExpense, getExpenses, type CashSession, type Expense, getShiftTransactions, cancelTransaction, getShiftProductsSoldSummary } from '../../lib/treasuryService';
import { ReportService } from '../../lib/reportService';
import { useToast } from '../../components/Toast';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCashRegister, faLock, faLockOpen, faCheckCircle, faExclamationTriangle, faMoneyBillWave, faCreditCard, faMinusCircle, faCartArrowDown, faReceipt, faShieldAlt, faTicketAlt, faBan, faTimes, faSpinner, faEye } from '@fortawesome/free-solid-svg-icons';
import { AuthPinModal } from '../../components/AuthPinModal';
import type { UserProfile } from '../../lib/authService';
import { PrinterService } from '../../lib/printerService';

const formatMoney = (val: string) => {
    const clean = val.replace(/\D/g, '');
    if (!clean) return '';
    return new Intl.NumberFormat('es-MX').format(parseInt(clean));
};

const getNumericAmount = (val: string) => {
    return Number(val.replace(/,/g, '')) || 0;
};

interface TreasuryProps {
    user: UserProfile | null;
    onCancel: () => void;
}

export const Treasury: React.FC<TreasuryProps> = ({ user, onCancel }) => {
    const { showToast } = useToast();
    const [activeSession, setActiveSession] = useState<CashSession | null>(null);
    const [summary, setSummary] = useState({ efectivo: 0, tarjeta: 0, gastos: 0, total: 0, cancelados_monto: 0, cancelados_count: 0 });
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

    // Modal de motivo de cancelación de ticket
    const [showCancelReasonModal, setShowCancelReasonModal] = useState(false);
    const [cancelReasonText, setCancelReasonText] = useState('');
    const [cancelPayload, setCancelPayload] = useState<{ txId: string; managerName: string } | null>(null);

    // Tickets Modal
    const [showTicketsModal, setShowTicketsModal] = useState(false);
    const [shiftTransactions, setShiftTransactions] = useState<any[]>([]);
    const [activeTab, setActiveTab] = useState<'todos' | 'accesos' | 'pos' | 'cancelados'>('todos');

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
        // NIP eliminado: Abrir modal de motivo directamente para cualquier usuario
        setCancelPayload({ txId: tx.id, managerName: user?.email || 'admin' });
        setCancelReasonText('');
        setShowCancelReasonModal(true);
    };

    const executeCancelTicket = async (txId: string, managerName: string) => {
        // Abrir el modal de motivo (se llama desde onAuthorized también)
        setCancelPayload({ txId, managerName });
        setCancelReasonText('');
        setShowCancelReasonModal(true);
    };

    const handleViewTicket = (tx: any) => {
        let items = [];
        if (tx.sesiones && tx.sesiones.length > 0) {
            items = tx.sesiones.map((s: any) => ({
                nombre: s.ninos?.nombre || 'Acceso',
                precio: tx.total / tx.sesiones.length,
                cantidad: 1,
                importe: tx.total / tx.sesiones.length
            }));
        } else {
            items = [{
                nombre: 'Venta POS / General',
                precio: tx.total,
                cantidad: 1,
                importe: tx.total
            }];
        }
        
        const payload = {
            folio: tx.id.substring(0,8).toUpperCase(),
            items: items,
            subtotal: tx.total,
            iva: 0,
            total: tx.total,
            paymentMethod: tx.metodo_pago,
            staffEmail: user?.email || 'admin@mundodepekes.com'
        };
        const original = PrinterService.formatGenericPOSTicket(payload, false);
        const copia = PrinterService.formatGenericPOSTicket(payload, true);
        
        // Enviamos dos trabajos de impresión separados
        PrinterService.printRaw(original, 'TICKET');
        PrinterService.printRaw(copia, 'TICKET');
    };

    const confirmCancelTicket = async () => {
        if (!cancelReasonText.trim() || !cancelPayload) return;
        setShowCancelReasonModal(false);
        setIsLoading(true);
        try {
            await cancelTransaction(cancelPayload.txId, cancelPayload.managerName, cancelReasonText);
            showToast('Ticket y sesiones anuladas correctamente', 'success');
            if (activeSession) await loadShiftTransactions(activeSession.id);
            await loadData();
        } catch(e) {
            showToast('No se pudo anular la transacción', 'error');
        } finally {
            setIsLoading(false);
            setCancelPayload(null);
            setCancelReasonText('');
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
    const [montoRealEfectivo, setMontoRealEfectivo] = useState('');
    const [montoRealTarjeta, setMontoRealTarjeta] = useState('');

    const handleClose = async () => {
        if (!activeSession) return;
        const realEfectivo = getNumericAmount(montoRealEfectivo);
        const realTarjeta = getNumericAmount(montoRealTarjeta);
        
        if (!montoRealEfectivo || isNaN(realEfectivo)) return showToast('Ingrese el monto físico de efectivo.', 'warning', 'Arqueo Erróneo');
        if (!montoRealTarjeta || isNaN(realTarjeta)) return showToast('Ingrese el monto total en vouchers de tarjeta.', 'warning', 'Arqueo Erróneo');

        setIsLoading(true);
        try {
            const { estado: estadoFinal } = await closeCash(activeSession.id, {
                efectivo: summary.efectivo,
                tarjeta: summary.tarjeta,
                realEfectivo: realEfectivo,
                realTarjeta: realTarjeta,
                obs: obs
            });
            
            // Generar reporte automático al cerrar
            const closingSession: CashSession = {
                ...activeSession,
                monto_final_real: realEfectivo,
                monto_final_tarjeta_real: realTarjeta,
                estado: estadoFinal
            };
            await ReportService.generateClosureReport(closingSession, summary, 'PDF');
            
            // Imprimir Ticket Físico de Arqueo
            try {
                let ticketProducts: any[] = [];
                try {
                    if (activeSession.fecha_apertura) {
                        ticketProducts = await getShiftProductsSoldSummary(activeSession.fecha_apertura);
                    }
                } catch (err) {
                    console.error('Error fetching products for closure ticket:', err);
                }

                const arqueoTicketData = {
                    folio: activeSession.id.substring(0, 8).toUpperCase(),
                    fechaApertura: new Date(activeSession.fecha_apertura).toLocaleString(),
                    fechaCierre: new Date().toLocaleString(),
                    staffEmail: user?.email || 'admin',
                    montoInicial: activeSession.monto_inicial,
                    ventasEfectivo: summary.efectivo,
                    ventasTarjeta: summary.tarjeta,
                    gastos: expenses.map(e => ({ concepto: e.descripcion, monto: e.monto })),
                    totalGastos: summary.gastos,
                    esperadoEfectivo: summary.efectivo + activeSession.monto_inicial - summary.gastos,
                    realEfectivo: realEfectivo,
                    esperadoTarjeta: summary.tarjeta,
                    realTarjeta: realTarjeta,
                    diferenciaEfectivo: realEfectivo - (summary.efectivo + activeSession.monto_inicial - summary.gastos),
                    diferenciaTarjeta: realTarjeta - summary.tarjeta,
                    totalVentas: summary.total,
                    productosVendidos: ticketProducts
                };
                const ticketRaw = PrinterService.formatArqueoTicket(arqueoTicketData);
                await PrinterService.printRaw(ticketRaw, 'TICKET');
            } catch (printErr) {
                console.error('Error al imprimir ticket de arqueo:', printErr);
            }

            showToast('Caja cerrada correctamente. Ticket y PDF generados.', 'success', 'Arqueo Finalizado');
            setObs('');
            setMontoRealEfectivo('');
            setMontoRealTarjeta('');
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
                    {user?.role === 'cajero' ? (
                        <>
                            <p>No hay un turno activo. Comuníquese con el administrador para abrir la caja antes de iniciar operaciones.</p>
                            <button className={styles.secondaryNavBtn} onClick={onCancel} style={{ marginTop: '0.5rem' }}>
                                Volver al Dashboard
                            </button>
                        </>
                    ) : (
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
                    )}
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
                        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                            <h3>Arqueo de Turno</h3>
                        </div>
                        <span className={styles.montoInicial}>Fondo: ${activeSession?.monto_inicial.toFixed(2)}</span>
                    </div>

                    <div className={styles.metricsGrid}>
                        <div className={styles.metricItem}>
                            <div className={styles.metricIcon} style={{ background: '#dcfce7', color: '#166534' }}>
                                <FontAwesomeIcon icon={faMoneyBillWave} />
                            </div>
                            <div className={styles.metricInfo}>
                                <span>Ventas Efectivo</span>
                                <strong className={user?.role === 'cajero' || user?.role === 'gerente' ? styles.blurredAmount : ''}>${summary.efectivo.toFixed(2)}</strong>
                            </div>
                        </div>
                        <div className={styles.metricItem}>
                            <div className={styles.metricIcon} style={{ background: '#e0f2fe', color: '#075985' }}>
                                <FontAwesomeIcon icon={faCreditCard} />
                            </div>
                            <div className={styles.metricInfo}>
                                <span>Ventas Tarjeta</span>
                                <strong className={user?.role === 'cajero' || user?.role === 'gerente' ? styles.blurredAmount : ''}>${summary.tarjeta.toFixed(2)}</strong>
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
                            onClick={() => { 
                                if (user?.role === 'admin') {
                                    setAuthorizer(user);
                                    setShowExpenseModal(true);
                                } else {
                                    setAuthActionPayload({type: 'expense'}); 
                                    setShowAuthModal(true); 
                                }
                            }}
                        >
                            <FontAwesomeIcon icon={faShieldAlt} /> {user?.role === 'admin' ? 'REGISTRAR GASTO' : 'SOLICITAR GASTO'}
                        </button>
                    </div>

                    <div className={styles.totalSection}>
                        <div className={styles.totalRow}>
                            <span>Ingresos Totales (Ventas):</span>
                            <span className={user?.role === 'cajero' || user?.role === 'gerente' ? styles.blurredAmount : ''}>${(summary.efectivo + summary.tarjeta).toFixed(2)}</span>
                        </div>
                        <div className={styles.totalRow} style={{ color: '#dc2626' }}>
                            <span>Egresos Totales (Gastos):</span>
                            <span>-${summary.gastos.toFixed(2)}</span>
                        </div>
                        <div className={styles.totalRow + ' ' + styles.finalTotal}>
                            <span>Saldo Neto en Caja:</span>
                            <strong className={user?.role === 'cajero' || user?.role === 'gerente' ? styles.blurredAmount : ''}>${(activeSession ? activeSession.monto_inicial + summary.efectivo + summary.tarjeta - summary.gastos : 0).toFixed(2)}</strong>
                        </div>
                        {summary.cancelados_count > 0 && (
                            <div className={styles.cancelledSummary}>
                                <FontAwesomeIcon icon={faBan} /> {summary.cancelados_count} operaciones anuladas por un total de <strong>${summary.cancelados_monto.toFixed(2)}</strong> (Informativo)
                            </div>
                        )}
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
                                        <span className={user?.role === 'cajero' || user?.role === 'gerente' ? styles.blurredAmount : ''}>${activeSession.monto_inicial.toFixed(2)}</span>
                                    </div>
                                    <div className={styles.balanceRow}>
                                        <span><FontAwesomeIcon icon={faMoneyBillWave} style={{marginRight: '8px'}} /> Ventas Efectivo:</span>
                                        <span className={user?.role === 'cajero' || user?.role === 'gerente' ? styles.blurredAmount : ''}>+${summary.efectivo.toFixed(2)}</span>
                                    </div>
                                    <div className={styles.balanceRow}>
                                        <span><FontAwesomeIcon icon={faCreditCard} style={{marginRight: '8px'}} /> Ventas Tarjeta:</span>
                                        <span className={user?.role === 'cajero' || user?.role === 'gerente' ? styles.blurredAmount : ''}>+${summary.tarjeta.toFixed(2)}</span>
                                    </div>
                                    <div className={styles.balanceRow}>
                                        <span><FontAwesomeIcon icon={faMinusCircle} style={{marginRight: '8px'}} /> Gastos Registrados:</span>
                                        <span>-${summary.gastos.toFixed(2)}</span>
                                    </div>
                                    <hr style={{ margin: '1rem 0', border: 'none', borderTop: '1px solid var(--border-color)' }} />
                                    <div className={styles.balanceRow}>
                                        <span style={{ fontWeight: 800 }}>Esperado en Efectivo:</span>
                                        <strong style={{ fontSize: '1.8rem', color: 'var(--brand-600)' }} className={user?.role === 'cajero' || user?.role === 'gerente' ? styles.blurredAmount : ''}>
                                            ${(activeSession.monto_inicial + summary.efectivo - summary.gastos).toFixed(2)}
                                        </strong>
                                    </div>
                                </div>

                                <div className={styles.inputGrid}>
                                    <div className={styles.inputGroup}>
                                        <label>Efectivo contado (Físico)</label>
                                        <div className={styles.inputWithIcon}>
                                            <span>$</span>
                                            <input 
                                                type="text" 
                                                autoFocus
                                                value={montoRealEfectivo}
                                                onChange={(e) => setMontoRealEfectivo(formatMoney(e.target.value))}
                                                onFocus={(e) => e.target.select()}
                                                placeholder="0.00"
                                            />
                                        </div>
                                    </div>
                                    <div className={styles.inputGroup}>
                                        <label>Vouchers Tarjeta (Total)</label>
                                        <div className={styles.inputWithIcon}>
                                            <span>$</span>
                                            <input 
                                                type="text" 
                                                value={montoRealTarjeta}
                                                onChange={(e) => setMontoRealTarjeta(formatMoney(e.target.value))}
                                                onFocus={(e) => e.target.select()}
                                                placeholder="0.00"
                                            />
                                        </div>
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
                                            onFocus={(e) => e.target.select()}
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
                                <div className={styles.modalHeader} style={{ display: 'flex', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid #e2e8f0', paddingBottom: '1rem', marginBottom: '1rem' }}>
                                    <div style={{ flex: 1 }}>
                                        <h3 style={{ margin: '0 0 0.25rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.5rem', color: '#0f172a' }}>
                                            <FontAwesomeIcon icon={faTicketAlt} style={{ color: '#3b82f6' }} /> Tickets del Turno
                                        </h3>
                                        <p style={{ margin: 0, color: '#64748b', fontSize: '0.95rem' }}>Historial de ventas y operaciones de la jornada actual.</p>
                                    </div>
                                    <button onClick={() => setShowTicketsModal(false)} style={{ background: '#f1f5f9', border: 'none', cursor: 'pointer', fontSize: '1.2rem', color: '#64748b', width: '36px', height: '36px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'all 0.2s' }} aria-label="Cerrar">
                                        <FontAwesomeIcon icon={faTimes} />
                                    </button>
                                </div>
                                <div style={{ maxHeight: '60vh', overflowY: 'auto', padding: '1rem 0' }}>
                                    
                                    <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.25rem' }}>
                                        {[
                                            { id: 'todos', label: 'Todos los Tickets' },
                                            { id: 'accesos', label: 'Accesos (Pekes)' },
                                            { id: 'pos', label: 'Tienda POS' },
                                            { id: 'cancelados', label: 'Cancelados / Nulos' }
                                        ].map(tab => (
                                            <button
                                                key={tab.id}
                                                onClick={() => setActiveTab(tab.id as any)}
                                                style={{
                                                    background: 'none',
                                                    border: 'none',
                                                    padding: '0.5rem 1rem',
                                                    cursor: 'pointer',
                                                    fontWeight: activeTab === tab.id ? 800 : 600,
                                                    color: activeTab === tab.id ? '#0f172a' : '#64748b',
                                                    borderBottom: activeTab === tab.id ? '2px solid #3b82f6' : '2px solid transparent',
                                                    transition: 'all 0.2s',
                                                    fontSize: '0.9rem'
                                                }}
                                            >
                                                {tab.label}
                                            </button>
                                        ))}
                                    </div>

                                    <table className={styles.ticketsTable}>
                                        <thead>
                                            <tr>
                                                <th>Folio</th>
                                                <th>Hora</th>
                                                <th>Cliente</th>
                                                <th>Total</th>
                                                <th>Estado</th>
                                                <th style={{ textAlign: 'right' }}>Acción</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {shiftTransactions.filter(tx => {
                                                if (activeTab === 'todos') return true;
                                                if (activeTab === 'cancelados') return tx.estado === 'cancelado';
                                                
                                                const hasSesiones = tx.sesiones && tx.sesiones.length > 0;
                                                const isCancelado = tx.estado === 'cancelado';
                                                
                                                if (activeTab === 'accesos') return hasSesiones && !isCancelado;
                                                if (activeTab === 'pos') return !hasSesiones && !isCancelado;
                                                return true;
                                            }).length === 0 ? (
                                                <tr><td colSpan={6} style={{ textAlign: 'center', padding: '3rem', color: '#64748b', fontStyle: 'italic' }}>No hay ventas registradas en esta categoría para el turno.</td></tr>
                                            ) : shiftTransactions.filter(tx => {
                                                if (activeTab === 'todos') return true;
                                                if (activeTab === 'cancelados') return tx.estado === 'cancelado';
                                                const hasSesiones = tx.sesiones && tx.sesiones.length > 0;
                                                const isCancelado = tx.estado === 'cancelado';
                                                if (activeTab === 'accesos') return hasSesiones && !isCancelado;
                                                if (activeTab === 'pos') return !hasSesiones && !isCancelado;
                                                return true;
                                            }).map(tx => (
                                                <tr key={tx.id} style={{ opacity: tx.estado === 'cancelado' ? 0.6 : 1 }}>
                                                    <td>
                                                        <span className={styles.folioCell}>{tx.id.substring(0,8).toUpperCase()}</span>
                                                    </td>
                                                    <td>{new Date(tx.fecha).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</td>
                                                    <td>
                                                        {tx.clientes?.nombre ? (
                                                            tx.clientes.nombre
                                                        ) : (
                                                            <span className={styles.badgePOS}>Venta POS</span>
                                                        )}
                                                    </td>
                                                    <td>
                                                        <span className={styles.totalCell}>${tx.total}</span>
                                                        <span className={styles.methodSub}>{tx.metodo_pago}</span>
                                                    </td>
                                                    <td>
                                                        <span className={tx.estado === 'pagado' ? styles.badgeOpen : ''} style={{ background: tx.estado === 'cancelado' ? '#fef2f2' : undefined, color: tx.estado === 'cancelado' ? '#ef4444' : undefined, padding: '0.3rem 0.6rem', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 800, marginTop: 0 }}>
                                                            {tx.estado.toUpperCase()}
                                                        </span>
                                                    </td>
                                                    <td>
                                                        <div className={styles.actionCell}>
                                                            <button 
                                                                onClick={() => handleViewTicket(tx)}
                                                                className={styles.btnAction}
                                                                title="Reimprimir o Ver Ticket"
                                                            >
                                                                <FontAwesomeIcon icon={faEye} />
                                                            </button>
                                                            {tx.estado !== 'cancelado' && (
                                                                <button 
                                                                    onClick={() => handleRequestCancel(tx)}
                                                                    className={`${styles.btnAction} ${styles.btnActionDanger}`}
                                                                    title="Anular Transacción o Ventas"
                                                                >
                                                                    <FontAwesomeIcon icon={faBan} />
                                                                </button>
                                                            )}
                                                        </div>
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

                {/* Modal de motivo de cancelación de ticket */}
                {showCancelReasonModal && (
                    <div className={styles.modalOverlay} onClick={() => setShowCancelReasonModal(false)}>
                        <div className={styles.modalContent} onClick={e => e.stopPropagation()}>
                            <div className={styles.modalHeader}>
                                <h3><FontAwesomeIcon icon={faBan} style={{ color: '#ef4444', marginRight: '0.75rem' }} />Anular Ticket</h3>
                                <p>Esta acción es irreversible. Ingrese el motivo de la cancelación para continuar.</p>
                            </div>

                            <div className={styles.inputGroup}>
                                <label>Motivo de la cancelación</label>
                                <div className={styles.inputWithIcon}>
                                    <input
                                        type="text"
                                        autoFocus
                                        placeholder="Ej: Error en cobro, cliente solicitó reembolso..."
                                        value={cancelReasonText}
                                        onChange={e => setCancelReasonText(e.target.value)}
                                        onKeyDown={e => { if (e.key === 'Enter') confirmCancelTicket(); }}
                                    />
                                </div>
                            </div>

                            <div className={styles.modalActions}>
                                <button className="btn btn-secondary" onClick={() => setShowCancelReasonModal(false)}>
                                    Cancelar
                                </button>
                                <button
                                    className="btn btn-danger"
                                    onClick={confirmCancelTicket}
                                    disabled={!cancelReasonText.trim() || isLoading}
                                    style={{ background: '#ef4444', color: 'white', opacity: !cancelReasonText.trim() ? 0.5 : 1 }}
                                >
                                    {isLoading ? 'Anulando...' : 'Confirmar Anulación'}
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
