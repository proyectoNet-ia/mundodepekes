import React, { useState, useEffect } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  AreaChart, Area, Cell, Legend, Line, ComposedChart
} from 'recharts';
import styles from './Analytics.module.css';
import { getFullAnalytics, getFixedCosts, saveFixedCosts, getFinancialHealth } from '../../lib/analyticsService';
import { getGastos, deleteGasto, type Gasto } from '../../lib/expenseService';
import { ReportService } from '../../lib/reportService';
import { useToast } from '../../components/Toast';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
  faFilePdf, faFileExcel, faHistory,
  faExclamationTriangle, faChevronLeft, faChevronRight,
  faThermometerHalf, faCashRegister, faCreditCard, faMoneyBillWave,
  faPlus, faTrashAlt, faCoins, faMinusCircle
} from '@fortawesome/free-solid-svg-icons';

const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

export const Analytics: React.FC = () => {
  const { showToast } = useToast();
  const [data, setData] = useState<any | null>(null);
  const [range, setRange] = useState(7);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [gastos, setGastos] = useState<Gasto[]>([]);
  const [isSavingGasto, setIsSavingGasto] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [editingItems, setEditingItems] = useState<{id?: string, desc: string, cat: string, monto: number}[]>([]);
  
  const [activeExpenseTab, setActiveExpenseTab] = useState<'fijos' | 'autorizados'>('fijos');
  const [fixedConfig, setFixedConfig] = useState<{desc: string, cat: string, monto: number}[]>([]);
  const [healthData, setHealthData] = useState<any | null>(null);
  const [historyPage, setHistoryPage] = useState(1);
  const [expensesPage, setExpensesPage] = useState(1);
  const ITEMS_PER_PAGE_HISTORY = 10;
  const ITEMS_PER_PAGE_EXPENSES = 5;

  const loadAll = async (isBackground = false) => {
    if (!isBackground) setIsLoading(true);
    else setIsRefreshing(true);
    try {
      const [analyticsData, expensesData, fConfig, hHealth] = await Promise.all([
        getFullAnalytics(range),
        getGastos(range),
        getFixedCosts(),
        getFinancialHealth()
      ]);
      setData(analyticsData);
      setGastos(expensesData);
      setFixedConfig(fConfig);
      setHealthData(hHealth);
    } catch (e) {
      console.error(e);
      showToast('Error al cargar datos', 'error');
    } finally {
      if (!isBackground) setIsLoading(false);
      else setIsRefreshing(false);
    }
  };

  useEffect(() => {
    loadAll(!!data);
    setHistoryPage(1);
  }, [range]);

  const openFixedModal = () => {
    if (fixedConfig.length > 0) setEditingItems(fixedConfig);
    else {
       setEditingItems([
         { desc: 'Nómina Personal', cat: 'Sueldos', monto: 0 },
         { desc: 'Renta Local', cat: 'Servicios', monto: 0 },
         { desc: 'Luz y Energía (CFE)', cat: 'Servicios', monto: 0 },
         { desc: 'Internet y Telefonía', cat: 'Servicios', monto: 0 }
       ]);
    }
    setShowExpenseModal(true);
  };

  const handleSaveFixedConfig = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSavingGasto(true);
    try {
      await saveFixedCosts(editingItems);
      setShowExpenseModal(false);
      loadAll(true);
      showToast('Configuración actualizada', 'success');
    } catch (e) { showToast('Error al actualizar costos', 'error'); } 
    finally { setIsSavingGasto(false); }
  };

  const updateItemMonto = (index: number, val: string) => {
     const newItems = [...editingItems];
     newItems[index].monto = parseFloat(val) || 0;
     setEditingItems(newItems);
  };

  const addNewConcept = () => setEditingItems([...editingItems, { desc: '', cat: 'Otros', monto: 0 }]);
  const updateConceptName = (index: number, name: string) => {
     const newItems = [...editingItems];
     newItems[index].desc = name;
     setEditingItems(newItems);
  };
  const removeFromEditing = (idx: number) => setEditingItems(editingItems.filter((_, i) => i !== idx));

  const confirmDelete = async () => {
    if (!deleteTargetId) return;
    try {
      await deleteGasto(deleteTargetId);
      loadAll(true);
      showToast('Gasto eliminado', 'success');
    } catch (e) { showToast('Error al eliminar', 'error'); } 
    finally { setDeleteTargetId(null); }
  };

  if (isLoading || !data) {
    return (
      <div className={styles.loadingContainer}>
        <div className={styles.spinner}></div>
        <p>Procesando Inteligencia de Negocio...</p>
      </div>
    );
  }

  const { metrics, salesByDay, packagePopularity, hourlyTraffic } = data;

  return (
    <div className={`${styles.container} ${isRefreshing ? styles.refreshing : ''}`}>
      {/* Real-time Health Dashboard */}
      <section className={styles.healthDashboard}>
          {healthData && (
              <div className={styles.healthGrid}>
                  <div className={styles.healthCard}>
                      <div className={styles.healthHeader}>
                          <div className={styles.healthIcon} style={{ background: 'rgba(99, 102, 241, 0.1)', color: '#6366f1' }}>
                              <FontAwesomeIcon icon={faThermometerHalf} />
                          </div>
                          <div>
                              <span className={styles.healthLabel}>Termómetro de Rentabilidad</span>
                              <p className={styles.healthSubLabel}>Hoy vs Punto de Equilibrio</p>
                          </div>
                      </div>
                      
                      {(() => {
                          const incomeToGoal = healthData.ingresos_efectivo_hoy + healthData.ingresos_tarjeta_hoy;
                          const goal = healthData.meta_diaria || 1;
                          const progress = Math.min((incomeToGoal / goal) * 100, 100);
                          
                          let color = '#ef4444'; 
                          if (progress > 50 && progress < 100) color = '#f59e0b';
                          if (progress >= 100) color = '#10b981';

                          return (
                              <div className={styles.thermometerContainer}>
                                  <div className={styles.thermometerValue}>
                                      <span style={{ color }}>{Math.round(progress)}%</span>
                                      <small>Cubierto</small>
                                  </div>
                                  <div className={styles.thermometerTrack}>
                                      <div className={styles.thermometerFill} style={{ width: `${progress}%`, background: color }} />
                                  </div>
                                  <div className={styles.thermometerMeta}>
                                      <span>Meta: ${Math.round(goal).toLocaleString('es-MX')}</span>
                                      <span>Logrado: ${Math.round(incomeToGoal).toLocaleString('es-MX')}</span>
                                  </div>
                              </div>
                          );
                      })()}
                  </div>

                  <div className={styles.healthCard}>
                      <div className={styles.healthHeader}>
                          <div className={styles.healthIcon} style={{ background: 'rgba(16, 185, 129, 0.1)', color: '#10b981' }}>
                              <FontAwesomeIcon icon={faCashRegister} />
                          </div>
                          <div>
                              <span className={styles.healthLabel}>Dinero físico en caja</span>
                              <p className={styles.healthSubLabel}>Lo que debe haber en la gaveta</p>
                          </div>
                      </div>
                      <div className={styles.cashInHandValue}>
                          <FontAwesomeIcon icon={faMoneyBillWave} className={styles.cashSymbol} />
                          <span>${healthData.caja_fisica_estimada.toLocaleString('es-MX')}</span>
                      </div>
                      <div className={styles.cashBreakdown}>
                           <div className={styles.breakdownItem}>
                               <small>Ingresos (Efectivo)</small>
                               <strong>+${healthData.ingresos_efectivo_hoy.toLocaleString('es-MX')}</strong>
                           </div>
                           <div className={styles.breakdownItem}>
                               <small>Gastos (Hoy)</small>
                               <strong style={{ color: '#ef4444' }}>-${healthData.egresos_hoy.toLocaleString('es-MX')}</strong>
                           </div>
                      </div>
                  </div>

                  <div className={`${styles.healthCard} ${styles.miniCard}`}>
                      <div className={styles.healthHeader}>
                          <div className={styles.healthIcon} style={{ background: 'rgba(139, 92, 246, 0.1)', color: '#8b5cf6' }}>
                              <FontAwesomeIcon icon={faCreditCard} />
                          </div>
                          <div>
                              <span className={styles.healthLabel}>Ventas con Tarjeta</span>
                              <p className={styles.healthSubLabel}>Fondos en banco</p>
                          </div>
                      </div>
                      <div className={styles.subValue}>
                          +${healthData.ingresos_tarjeta_hoy.toLocaleString('es-MX')}
                      </div>
                  </div>

                  {/* NUEVA TARJETA: SALIDAS DEL DÍA */}
                  <div className={`${styles.healthCard} ${styles.outflowCard}`}>
                      <div className={styles.healthHeader}>
                          <div className={styles.healthIcon} style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444' }}>
                              <FontAwesomeIcon icon={faMinusCircle} />
                          </div>
                          <div>
                              <span className={styles.healthLabel}>Alerta de Salidas (Hoy)</span>
                              <p className={styles.healthSubLabel}>Registros en tiempo real</p>
                          </div>
                      </div>
                      <div className={styles.outflowChronology}>
                          {healthData.egresos_detallados && healthData.egresos_detallados.length > 0 ? (
                              healthData.egresos_detallados.slice(0, 3).map((egr: any, i: number) => (
                                  <div key={i} className={styles.outflowItem}>
                                      <div className={styles.outflowMeta}>
                                          <span className={styles.outflowTime}>{egr.hora}</span>
                                          <span className={styles.outflowDesc}>{egr.descripcion || 'Sin desc.'}</span>
                                      </div>
                                      <strong className={styles.outflowAmt}>-${egr.monto.toLocaleString('es-MX')}</strong>
                                  </div>
                              ))
                          ) : (
                              <div className={styles.emptyOutflow}>No hay salidas registradas hoy.</div>
                          )}
                          {healthData.egresos_detallados && healthData.egresos_detallados.length > 3 && (
                              <div className={styles.moreOutflows}>+ {healthData.egresos_detallados.length - 3} más hoy</div>
                          )}
                      </div>
                  </div>
              </div>
          )}
      </section>

      {/* Accumulated Metrics Header */}
      <header className={styles.header} style={{ marginBottom: '1.5rem' }}>
         <div className={styles.titleArea}>
            <div className={styles.iconCircle} style={{ background: 'rgba(16, 185, 129, 0.1)', color: '#10b981' }}><FontAwesomeIcon icon={faCoins} /></div>
            <div>
              <h1 style={{ fontSize: '1.25rem', margin: 0 }}>Balance General ({range === 90 ? 'Estratégico' : `${range} días`})</h1>
              <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-tertiary)' }}>Resumen de ingresos y márgenes acumulados</p>
            </div>
         </div>
         <div className={styles.headerActions}>
            <button className={styles.exportBtn} onClick={async () => {
                try {
                  await ReportService.generateAnalyticsReport({ ...data, gastos }, range, 'PDF');
                  showToast('PDF generado', 'success');
                } catch(e) { showToast('Error al generar PDF', 'error'); }
            }}>
                <FontAwesomeIcon icon={faFilePdf} /> Exportar PDF
            </button>
            <button className={`${styles.exportBtn} ${styles.excel}`} onClick={async () => {
                try {
                  await ReportService.generateAnalyticsReport({ ...data, gastos }, range, 'EXCEL');
                  showToast('Excel generado', 'success');
                } catch(e) { showToast('Error al generar Excel', 'error'); }
            }}>
                <FontAwesomeIcon icon={faFileExcel} /> Excel
            </button>
         </div>
      </header>

      <div className={styles.miniMetricsBar}>
          <div className={styles.miniMetric}>
              <small>Ingresos Brutos</small>
              <strong>${metrics.totalIncome.toLocaleString('es-MX')}</strong>
          </div>
          <div className={styles.miniMetric}>
              <small>Utilidad Real</small>
              <strong style={{ color: metrics.netProfit >= 0 ? '#10b981' : '#ef4444' }}>
                ${metrics.netProfit.toLocaleString('es-MX')}
              </strong>
          </div>
          <div className={styles.miniMetric}>
              <small>Margen Promedio</small>
              <strong style={{ color: metrics.profitMargin > 20 ? '#10b981' : '#f59e0b' }}>
                {metrics.profitMargin.toFixed(1)}%
              </strong>
          </div>
          <div className={styles.miniMetric}>
              <small>Ticket Promedio</small>
              <strong>${metrics.avgTicket.toLocaleString('es-MX', { maximumFractionDigits: 0 })}</strong>
          </div>
      </div>

      {/* Historical Trends Charts */}
      <header className={styles.header}>
        <div className={styles.titleArea}>
          <div className={styles.iconCircle}><FontAwesomeIcon icon={faHistory} /></div>
          <div>
            <h2>Análisis de Tendencias</h2>
            <p>Evolución de ventas y comportamiento de tráfico</p>
          </div>
        </div>
        <div className={styles.headerActions}>
           <div className={styles.rangeSelector}>
              <button className={range === 7 ? styles.activeRange : ''} onClick={() => setRange(7)}>7D</button>
              <button className={range === 30 ? styles.activeRange : ''} onClick={() => setRange(30)}>30D</button>
              <button className={range === 90 ? styles.activeRange : ''} onClick={() => setRange(90)}>Hist.</button>
           </div>
           <button className={styles.exportBtn} onClick={() => openFixedModal()} style={{ background: 'var(--bg-tertiary)', color: 'var(--text-primary)' }}>
              Config. Gastos
           </button>
        </div>
      </header>

      <div className={styles.chartsGrid}>
        <div className={styles.chartCard}>
          <div className={styles.chartHeader}>
             <h3>Desempeño y Rentabilidad</h3>
             <p>Comparativa de ventas vs gastos diarios</p>
          </div>
          <div className={styles.chartWrapper}>
            <ResponsiveContainer width="100%" height={350}>
              <ComposedChart data={salesByDay}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 12}} />
                <YAxis axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 12}} tickFormatter={(v) => `$${v}`} />
                <Tooltip 
                   formatter={(value: any) => [`$${Number(value).toLocaleString('es-MX')}`, '']}
                   contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}
                />
                <Legend verticalAlign="top" align="right" height={36} />
                <Bar dataKey="ventas" name="Ventas" fill="#6366f1" radius={[4, 4, 0, 0]} barSize={40} />
                <Line type="monotone" dataKey="gastos" name="Gastos" stroke="#ef4444" strokeWidth={3} dot={{ r: 4 }} />
                <Line type="monotone" dataKey="utilidad" name="Utilidad" stroke="#10b981" strokeWidth={3} strokeDasharray="5 5" />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className={styles.chartCard}>
          <div className={styles.chartHeader}>
             <h3>Tráfico por Hora</h3>
             <p>Niños por hora de entrada</p>
          </div>
          <div className={styles.chartWrapper}>
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={hourlyTraffic}>
                <defs>
                   <linearGradient id="colorTraffic" x1="0" y1="0" x2="0" y2="1">
                     <stop offset="5%" stopColor="#10b981" stopOpacity={0.1}/>
                     <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                   </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="hour" axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 12}} />
                <YAxis axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 12}} />
                <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }} />
                <Area type="monotone" dataKey="count" stroke="#10b981" strokeWidth={3} fill="url(#colorTraffic)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
      
      <div className={styles.distributionRow}>
          <div className={styles.distCard}>
             <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                <h3 style={{ margin: 0 }}>Gestión de Egresos</h3>
                <button className="btn btn-primary" onClick={openFixedModal} style={{ fontSize: '0.85rem' }}>
                   Gestionar
                </button>
             </div>
             <div className={styles.expenseTabs}>
                <div className={`${styles.expenseTab} ${activeExpenseTab === 'fijos' ? styles.active : ''}`} onClick={() => { setActiveExpenseTab('fijos'); setExpensesPage(1); }}>Gastos Fijos</div>
                <div className={`${styles.expenseTab} ${activeExpenseTab === 'autorizados' ? styles.active : ''}`} onClick={() => { setActiveExpenseTab('autorizados'); setExpensesPage(1); }}>Salidas Autorizadas</div>
             </div>
             <div className={styles.expenseListContainer}>
                {(() => {
                   const displayList = activeExpenseTab === 'fijos' ? fixedConfig : gastos;
                   const tabTotal = displayList.reduce((acc: number, g: any) => acc + Number(g.monto), 0);
                   
                   if (displayList.length === 0) return <div className={styles.emptyExpenses}>Sin registros en este periodo.</div>;
                   
                   const totalPages = Math.ceil(displayList.length / ITEMS_PER_PAGE_EXPENSES);
                   const startIndex = (expensesPage - 1) * ITEMS_PER_PAGE_EXPENSES;
                   const visibleItems = displayList.slice(startIndex, startIndex + ITEMS_PER_PAGE_EXPENSES);

                   return (
                    <>
                      <div className={styles.paginatedTableArea}>
                        <table className={styles.expenseTable}>
                          <thead>
                            <tr><th>Concepto</th><th style={{ textAlign: 'right' }}>Monto</th></tr>
                          </thead>
                          <tbody>
                            {visibleItems.map((g: any, i: number) => (
                              <tr key={activeExpenseTab === 'fijos' ? `f-${startIndex + i}` : (g.id || i)}>
                                <td>
                                   <strong>{g.descripcion || g.desc}</strong>
                                   <div style={{fontSize: '0.7rem', color: '#94a3b8'}}>{activeExpenseTab === 'fijos' ? g.cat : g.categoria}</div>
                                </td>
                                <td style={{fontWeight: 700, color: '#ef4444', textAlign: 'right'}}>${Number(g.monto).toLocaleString('es-MX')}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      <div className={styles.expenseFooter}>
                        <div className={styles.expenseTotalRow}>
                          <span className={styles.totalLabel}>{activeExpenseTab === 'fijos' ? 'GASTO FIJO MENSUAL:' : 'TOTAL SALIDAS PERIODICAS:'}</span>
                          <span className={styles.totalValue}>${tabTotal.toLocaleString('es-MX')}</span>
                        </div>
                        
                        {totalPages > 1 && (
                          <div className={styles.miniPagination}>
                            <button className={styles.miniPageBtn} disabled={expensesPage === 1} onClick={() => setExpensesPage(prev => Math.max(1, prev - 1))}>
                              <FontAwesomeIcon icon={faChevronLeft} />
                            </button>
                            <span className={styles.miniPageInfo}>{expensesPage} / {totalPages}</span>
                            <button className={styles.miniPageBtn} disabled={expensesPage >= totalPages} onClick={() => setExpensesPage(prev => prev + 1)}>
                              <FontAwesomeIcon icon={faChevronRight} />
                            </button>
                          </div>
                        )}
                      </div>
                    </>
                   );
                })()}
             </div>
          </div>

          <div className={styles.distCard}>
             <h3>Mix de Paquetes (Top Uso)</h3>
             <p style={{ fontSize: '0.8rem', color: '#64748b', marginBottom: '1rem' }}>Frecuencia de venta por tipo de paquete</p>
             <ResponsiveContainer width="100%" height={400}>
                <BarChart layout="vertical" data={packagePopularity} margin={{ left: 20, right: 40, top: 0, bottom: 0 }}>
                   <XAxis type="number" hide />
                   <YAxis type="category" dataKey="name" width={120} fontSize={11} tick={{ fill: '#475569', fontWeight: 600 }} axisLine={false} tickLine={false} />
                   <Tooltip cursor={{ fill: 'rgba(99, 102, 241, 0.05)' }} contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', fontSize: '0.8rem' }} />
                   <Bar dataKey="count" barSize={20} radius={[0, 10, 10, 0]}>
                      {packagePopularity.map((_e: any, i: number) => (
                         <Cell key={`cell-pkg-${i}`} fill={COLORS[i % COLORS.length]} />
                      ))}
                   </Bar>
                </BarChart>
             </ResponsiveContainer>
          </div>
      </div>

      <section className={styles.historyCard}>
          <div className={styles.chartHeader} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <h3><FontAwesomeIcon icon={faHistory} /> Historial de Turnos</h3>
                <p>Auditoría de cierres y descuadres de caja</p>
              </div>
              {data.auditHistory.length > ITEMS_PER_PAGE_HISTORY && (
                  <div className={styles.paginationHeader}>
                    <button className={styles.pageBtn} disabled={historyPage === 1} onClick={() => setHistoryPage(prev => Math.max(1, prev - 1))}><FontAwesomeIcon icon={faChevronLeft} /></button>
                    <span className={styles.pageInfo}>{historyPage} / {Math.ceil(data.auditHistory.length / ITEMS_PER_PAGE_HISTORY)}</span>
                    <button className={styles.pageBtn} disabled={historyPage >= Math.ceil(data.auditHistory.length / ITEMS_PER_PAGE_HISTORY)} onClick={() => setHistoryPage(prev => prev + 1)}><FontAwesomeIcon icon={faChevronRight} /></button>
                  </div>
              )}
          </div>
          <div className={styles.historyList}>
              {data.auditHistory.length > 0 ? (
                  <table className={styles.expenseTable}>
                      <thead>
                          <tr>
                              <th>Fecha / Hora</th>
                              <th>Ventas Efe.</th>
                              <th>Gastos</th>
                              <th>Esperado</th>
                              <th>Real</th>
                              <th>Precisión</th>
                              <th>PDF</th>
                          </tr>
                      </thead>
                      <tbody>
                          {(() => {
                              const sortedHistory = [...data.auditHistory].reverse();
                              const startIndex = (historyPage - 1) * ITEMS_PER_PAGE_HISTORY;
                              const visibleHistory = sortedHistory.slice(startIndex, startIndex + ITEMS_PER_PAGE_HISTORY);
                              return visibleHistory.map(session => (
                                  <tr key={session.id}>
                                      <td data-label="Fecha"><strong>{session.date}</strong><div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{session.time}</div></td>
                                      <td data-label="Ventas Efe.">${session.ventas.toLocaleString('es-MX')}</td>
                                      <td data-label="Gastos" style={{ color: '#ef4444' }}>-${session.gastos.toLocaleString('es-MX')}</td>
                                      <td data-label="Esperado">${session.esperado.toLocaleString('es-MX')}</td>
                                      <td data-label="Real" style={{ fontWeight: 700 }}>${session.real.toLocaleString('es-MX')}</td>
                                      <td data-label="Precisión">
                                          <span style={{ 
                                              fontWeight: 800,
                                              color: Math.abs(session.diff) <= 10 ? '#94a3b8' : (session.diff < 0 ? '#ef4444' : '#10b981'),
                                              background: Math.abs(session.diff) <= 10 ? 'transparent' : (session.diff < 0 ? '#fef2f2' : '#f0fdf4'),
                                              padding: '4px 8px', borderRadius: '6px'
                                          }}>
                                              {session.diff === 0 ? 'Exacto' : (session.diff > 0 ? `+$${session.diff}` : `-$${Math.abs(session.diff)}`)}
                                          </span>
                                      </td>
                                      <td data-label="PDF">
                                          <div className={styles.historyActions}>
                                              <button className={styles.exportBtn} onClick={() => ReportService.generateClosureReport(session, {efectivo: session.ventas, tarjeta: 0}, 'PDF')}><FontAwesomeIcon icon={faFilePdf} /></button>
                                          </div>
                                      </td>
                                  </tr>
                              ));
                          })()}
                      </tbody>
                  </table>
              ) : <div className={styles.emptyExpenses}>Sin sesiones.</div>}
          </div>
      </section>

      {/* Modals */}
      {deleteTargetId && (
        <div className={styles.modalOverlay}>
          <div className={styles.modal} style={{ maxWidth: '400px', textAlign: 'center' }}>
            <div className={styles.alertIcon} style={{ background: '#fee2e2', color: '#ef4444', margin: '0 auto 1.5rem', width: '60px', height: '60px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem' }}>
              <FontAwesomeIcon icon={faExclamationTriangle} />
            </div>
            <h3>¿Eliminar gasto?</h3>
            <div className={styles.modalFooter} style={{ justifyContent: 'center', gap: '1rem', marginTop: '2rem' }}>
              <button className="btn btn-ghost" onClick={() => setDeleteTargetId(null)}>Regresar</button>
              <button className="btn btn-primary" style={{ background: '#ef4444', borderColor: '#ef4444' }} onClick={confirmDelete}>Sí, eliminar</button>
            </div>
          </div>
        </div>
      )}

      {showExpenseModal && (
        <div className={styles.modalOverlay}>
          <div className={styles.modal} style={{ maxWidth: '650px' }}>
            <div className={styles.modalHeader}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <div className={styles.aiIcon} style={{ width: '40px', height: '40px', background: '#6366f1' }}><FontAwesomeIcon icon={faCoins} /></div>
                <div><h3 style={{ margin: 0 }}>Gastos Operativos</h3><p style={{ margin: 0, fontSize: '0.8rem', color: '#64748b' }}>Edita costos fijos</p></div>
              </div>
              <button className={styles.closeBtn} onClick={() => setShowExpenseModal(false)}>×</button>
            </div>
            <form onSubmit={handleSaveFixedConfig} className={styles.expenseForm}>
              <div style={{ maxHeight: '400px', overflowY: 'auto', marginBottom: '1rem' }}>
                <table className={styles.expenseTable}>
                  <thead><tr><th>Concepto</th><th>Categoría</th><th style={{ width: '100px' }}>Monto</th><th style={{ width: '40px' }}></th></tr></thead>
                  <tbody>
                    {editingItems.map((item, idx) => (
                      <tr key={idx}>
                        <td><input type="text" value={item.desc} onChange={(e) => updateConceptName(idx, e.target.value)} className={styles.input} style={{ fontSize: '0.85rem' }} /></td>
                        <td>
                          <select value={item.cat} onChange={(e) => { const n = [...editingItems]; n[idx].cat = e.target.value; setEditingItems(n); }} className={styles.input}>
                            <option value="Sueldos">Sueldos</option><option value="Servicios">Servicios</option><option value="Insumos">Insumos</option><option value="Otros">Otros</option>
                          </select>
                        </td>
                        <td><input type="number" value={item.monto || ''} onChange={(e) => updateItemMonto(idx, e.target.value)} className={styles.input} /></td>
                        <td><button type="button" className={styles.delBtn} onClick={() => removeFromEditing(idx)}><FontAwesomeIcon icon={faTrashAlt} /></button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button type="button" className="btn btn-ghost" onClick={addNewConcept} style={{ width: '100%', border: '2px dashed #e2e8f0', marginBottom: '1.5rem' }}><FontAwesomeIcon icon={faPlus} /> Añadir otro</button>
              <div className={styles.modalFooter}><button type="button" className="btn btn-ghost" onClick={() => setShowExpenseModal(false)}>Cerrar</button><button type="submit" className="btn btn-primary" disabled={isSavingGasto}>Guardar</button></div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
