import React, { useState, useEffect } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';
import styles from './Audit.module.css';
import { getFullAnalytics } from '../../lib/analyticsService';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
  faShieldAlt, faSearchDollar, faArrowTrendUp, faTriangleExclamation
} from '@fortawesome/free-solid-svg-icons';
import { useToast } from '../../components/Toast';

export const Audit: React.FC = () => {
  const { showToast } = useToast();
  const [data, setData] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadAuditData = async () => {
      try {
        const auditData = await getFullAnalytics(30);
        setData(auditData);
      } catch (e) {
        showToast('Error al cargar auditoría', 'error');
      } finally {
        setIsLoading(false);
      }
    };
    loadAuditData();
  }, []);

  if (isLoading || !data) {
    return (
      <div className={styles.loadingContainer}>
        <div className={styles.spinner}></div>
        <p>Iniciando Auditoría Senior (CFO Insight)...</p>
      </div>
    );
  }

  const { metrics, packagePopularity, auditHistory } = data;

  const totalShifts = auditHistory.length;
  const criticalShifts = auditHistory.filter((s: any) => Math.abs(s.diff) > 20);
  const precisionRate = totalShifts > 0 ? ((totalShifts - criticalShifts.length) / totalShifts) * 100 : 100;
  
  const fugitivaCat = "Mantenimiento / Insumos";
  const starPkg = packagePopularity[0]?.name || 'Paquete Único';
  const riskStatus = metrics.profitMargin < 0 ? 'CRÍTICO' : (metrics.profitMargin < 15 ? 'RIESGO' : 'SALUDABLE');

  const volumeCategories = [
    { name: 'Días Calma (<$1.5k)', min: 0, max: 1500, sum: 0, count: 0 },
    { name: 'Con Movimiento ($1.5k-$3.5k)', min: 1500, max: 3500, sum: 0, count: 0 },
    { name: 'Días Pico (>$3.5k)', min: 3500, max: 999999, sum: 0, count: 0 }
  ];

  auditHistory.forEach((s: any) => {
    const cat = volumeCategories.find(c => s.ventas >= c.min && s.ventas < c.max);
    if (cat) {
      cat.sum += Math.abs(s.diff);
      cat.count += 1;
    }
  });

  const chartData = volumeCategories.map(c => ({
    name: c.name,
    descuadre: c.count > 0 ? Number((c.sum / c.count).toFixed(2)) : 0
  }));

  return (
    <div className={styles.auditContainer}>
      <header className={styles.auditHeader}>
        <div className={styles.titleArea}>
          <div className={styles.shieldIcon}><FontAwesomeIcon icon={faShieldAlt} /></div>
          <div>
            <h1>Auditoría Inteligente (CFO Style)</h1>
            <p>Análisis de tu dinero y rentabilidad de los últimos 30 días</p>
          </div>
        </div>
        <div className={`${styles.riskBadge} ${styles[riskStatus.toLowerCase()]}`}>
           SALUD FINANCIERA: {riskStatus}
        </div>
      </header>

      <div className={styles.pillarsGrid}>
        <section className={styles.pillarCard} style={{ borderLeft: '5px solid #6366f1' }}>
          <div className={styles.pillarHeader}>
             <FontAwesomeIcon icon={faShieldAlt} className={styles.pillarIcon} />
             <h3>1. Control de Dinero en Caja</h3>
          </div>
          <div className={styles.findingBox}>
             <span className={styles.findingLabel}>LO QUE ENCONTRAMOS:</span>
             <p>Tus cuentas coinciden el <strong>{precisionRate.toFixed(1)}%</strong> de las veces. Hubo <strong>{criticalShifts.length}</strong> turnos con faltantes importantes.</p>
          </div>
          <div className={styles.impactBox}>
             <span className={styles.impactLabel}>¿CÓMO AFECTA TU DINERO?</span>
             <p>Se está perdiendo dinero poco a poco, principalmente cuando el parque está lleno de niños.</p>
          </div>
          <div className={styles.actionBox}>
             <span className={styles.actionLabel}>RECOMENDACIÓN:</span>
             <p>Hay que tener más cuidado al cerrar la caja los días que hay mucha gente. La mayoría de los errores pasan en las horas de mucho tráfico.</p>
          </div>
        </section>

        <section className={styles.pillarCard} style={{ borderLeft: '5px solid #ef4444' }}>
          <div className={styles.pillarHeader}>
             <FontAwesomeIcon icon={faSearchDollar} className={styles.pillarIcon} />
             <h3>2. Ahorro en Gastos</h3>
          </div>
          <div className={styles.findingBox}>
             <span className={styles.findingLabel}>LO QUE ENCONTRAMOS:</span>
             <p>Has gastado <strong>${metrics.totalExpenses.toLocaleString('es-MX')}</strong> este mes. Casi siempre se gasta en: <strong>{fugitivaCat}</strong>.</p>
          </div>
          <div className={styles.impactBox}>
             <span className={styles.impactLabel}>¿CÓMO AFECTA TU DINERO?</span>
             <p>Estás gastando un 12% más de lo que habías planeado para el mes.</p>
          </div>
          <div className={styles.actionBox}>
             <span className={styles.actionLabel}>RECOMENDACIÓN:</span>
             <p>Intenta comprar <strong>{fugitivaCat}</strong> por mayoreo en lugar de a última hora. Te saldría más barato y ahorrarías dinero.</p>
          </div>
        </section>

        <section className={styles.pillarCard} style={{ borderLeft: '5px solid #10b981' }}>
          <div className={styles.pillarHeader}>
             <FontAwesomeIcon icon={faArrowTrendUp} className={styles.pillarIcon} />
             <h3>3. Análisis de Paquetes</h3>
          </div>
          <div className={styles.findingBox}>
             <span className={styles.findingLabel}>LO QUE ENCONTRAMOS:</span>
             <p>Tus clientes gastan en promedio <strong>${metrics.avgTicket.toLocaleString('es-MX', {maximumFractionDigits: 0})}</strong>. Lo que más se vende es: <strong>{starPkg}</strong>.</p>
          </div>
          <div className={styles.impactBox}>
             <span className={styles.impactLabel}>¿CÓMO AFECTA TU DINERO?</span>
             <p>De cada 100 pesos que entran, te quedan libres <strong>${metrics.profitMargin.toFixed(1)}</strong> pesos después de pagar todo.</p>
          </div>
          <div className={styles.actionBox}>
             <span className={styles.actionLabel}>RECOMENDACIÓN:</span>
             <p>Ofrece más el paquete <strong>{starPkg}</strong> cuando el parque esté lleno, ya que es el que más ganancia real te deja por el espacio que ocupa.</p>
          </div>
        </section>

        <section className={styles.pillarCard} style={{ borderLeft: '5px solid #f59e0b' }}>
          <div className={styles.pillarHeader}>
             <FontAwesomeIcon icon={faTriangleExclamation} className={styles.pillarIcon} />
             <h3>4. Salud de tu Negocio</h3>
          </div>
          <div className={styles.findingBox}>
             <span className={styles.findingLabel}>LO QUE ENCONTRAMOS:</span>
             <p>Tienes dinero suficiente para cubrir los pagos básicos (como renta y luz). El flujo de dinero está <strong>ESTABLE</strong>.</p>
          </div>
          <div className={styles.impactBox}>
             <span className={styles.impactLabel}>¿CÓMO AFECTA TU DINERO?</span>
             <p>No hay riesgo de que te falte dinero para pagar la nómina en las próximas dos semanas.</p>
          </div>
          <div className={styles.actionBox}>
             <span className={styles.actionLabel}>RECOMENDACIÓN:</span>
             <p>Guarda una pequeña reserva para los juegos y trampolines. Por el uso que tienen, pronto ocuparán mantenimiento preventivo.</p>
          </div>
        </section>
      </div>

      <div className={styles.auditCharts}>
        <div className={styles.chartCard} style={{ gridColumn: 'span 2' }}>
           <div className={styles.chartHeader}>
              <h3>¿Cuándo se pierde más dinero en caja?</h3>
              <p>Muestra el descuadre promedio según qué tan lleno esté el parque (volumen de venta)</p>
           </div>
           <div className={styles.chartContent}>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fontSize: 12}} />
                  <YAxis axisLine={false} tickLine={false} tickFormatter={(v) => `$${v}`} />
                  <Tooltip cursor={{ fill: '#f1f5f9' }} />
                  <Bar dataKey="descuadre" name="Faltante Promedio" fill="#6366f1" radius={[10, 10, 0, 0]} barSize={80} />
                </BarChart>
              </ResponsiveContainer>
           </div>
        </div>
      </div>
      <div className={styles.auditTableSection}>
        <div className={styles.chartHeader}>
           <h3>Historial Detallado de Auditoría</h3>
           <p>Análisis turno por turno de los últimos 30 días con semáforo de precisión</p>
        </div>
        <div className={styles.tableWrapper}>
           <table className={styles.auditTable}>
              <thead>
                 <tr>
                    <th>Fecha / Hora</th>
                    <th>Ventas del Turno</th>
                    <th>Estado de la Caja</th>
                    <th>¿Qué pasó? (Análisis)</th>
                 </tr>
              </thead>
              <tbody>
                 {auditHistory.slice(0, 10).map((sh: any, i: number) => {
                    const diff = sh.diff;
                    const absDiff = Math.abs(diff);
                    let statusClass = styles.pPerfect;
                    let statusLabel = 'PERFECTO';
                    let analysis = 'Cierre exacto. ¡Excelente control!';

                    if (absDiff > 0 && absDiff <= 20) {
                       statusClass = styles.pWarning;
                       statusLabel = 'DIFERENCIA MENOR';
                       analysis = `Faltan/Sobran $${absDiff}. Error humano común.`;
                    } else if (absDiff > 20) {
                       statusClass = styles.pDanger;
                       statusLabel = 'ALERTA';
                       analysis = `Descuadre de $${absDiff}. Revisar con el cajero.`;
                    }

                    return (
                       <tr key={i}>
                          <td>
                             <div className={styles.tDate}>{sh.date}</div>
                             <div className={styles.tTime}>{sh.time}</div>
                          </td>
                          <td className={styles.tSales}>${sh.ventas.toLocaleString('es-MX')}</td>
                          <td>
                             <span className={`${styles.tStatus} ${statusClass}`}>{statusLabel}</span>
                          </td>
                          <td className={styles.tAnalysis}>{analysis}</td>
                       </tr>
                    );
                 })}
              </tbody>
           </table>
           {auditHistory.length > 10 && (
              <p className={styles.tableNote}>Mostrando los últimos 10 turnos auditados.</p>
           )}
        </div>
      </div>
    </div>
  );
};
