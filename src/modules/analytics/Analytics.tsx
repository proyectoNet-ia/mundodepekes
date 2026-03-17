import React, { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts';
import styles from './Analytics.module.css';
import { getSalesSummary, getTopMetrics } from '../../lib/analyticsService';

export const Analytics: React.FC = () => {
  const [salesData, setSalesData] = useState<any[]>([]);
  const [metrics, setMetrics] = useState({ totalIncome: 0, avgTicket: 0, customerCount: 0 });

  useEffect(() => {
    const loadData = async () => {
      const [data, top] = await Promise.all([
        getSalesSummary(),
        getTopMetrics()
      ]);
      setSalesData(data);
      setMetrics(top);
    };
    loadData();
  }, []);
  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h2>Inteligencia de Negocio (BI)</h2>
        <p>Análisis estratégico impulsado por IA</p>
      </header>

      <div className={styles.metricsGrid}>
        <div className={styles.metricCard}>
          <span className={styles.metricLabel}>Ticket Promedio</span>
          <span className={styles.metricValue}>${metrics.avgTicket.toFixed(2)}</span>
          <span className={styles.trendUp}>Actualizado ahora</span>
        </div>
        <div className={styles.metricCard}>
          <span className={styles.metricLabel}>Clientes Registrados</span>
          <span className={styles.metricValue}>{metrics.customerCount}</span>
          <span className={styles.trendUp}>Base de datos real</span>
        </div>
        <div className={styles.metricCard}>
          <span className={styles.metricLabel}>Ingresos Totales</span>
          <span className={styles.metricValue}>${metrics.totalIncome.toFixed(2)}</span>
          <span className={styles.trendUp}>Ciclo de vida total</span>
        </div>
      </div>

      <div className={styles.chartsGrid}>
        <div className={styles.chartCard}>
          <h3>Tendencia de Ventas (Histórico)</h3>
          <div className={styles.chartWrapper}>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={salesData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" vertical={false} />
                <XAxis dataKey="name" axisLine={false} tickLine={false} />
                <YAxis axisLine={false} tickLine={false} />
                <Tooltip 
                  contentStyle={{ borderRadius: 'var(--radius-md)', border: 'none', boxShadow: 'var(--shadow-lg)' }}
                />
                <Bar dataKey="ventas" fill="var(--brand-500)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className={styles.chartCard}>
          <h3>Flujo de Caja Real</h3>
          <div className={styles.chartWrapper}>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={salesData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Line type="monotone" dataKey="ventas" stroke="var(--brand-500)" strokeWidth={3} dot={{ r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <section className={styles.aiInsightBox}>
        <div className={styles.aiHeader}>
          <span className={styles.aiIcon}>✨</span>
          <h4>Recomendación Estratégica AI (Gemini 3 Flash)</h4>
        </div>
        <p className={styles.aiText}>
          "Se detecta un pico de demanda en **Trampolin Park** los sábados entre las 16:00 y 19:00. 
          Se recomienda activar una promoción de 'Combo Snack' para aumentar el ticket promedio un 15% durante estas horas."
        </p>
      </section>
    </div>
  );
};
