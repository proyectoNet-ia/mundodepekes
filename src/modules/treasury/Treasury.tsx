import React from 'react';
import styles from './Treasury.module.css';

export const Treasury: React.FC = () => {
  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h2>Control de Tesorería</h2>
        <div className={styles.badge}>Caja Abierta</div>
      </header>

      <div className={styles.mainGrid}>
        <section className={styles.summaryCard}>
          <div className={styles.row}>
            <span>Fondo Inicial:</span>
            <span className={styles.amount}>$500.00</span>
          </div>
          <div className={styles.row}>
            <span>Ventas Efectivo:</span>
            <span className={styles.amount}>$1,240.00</span>
          </div>
          <div className={styles.row}>
            <span>Ventas Tarjeta:</span>
            <span className={styles.amount}>$850.00</span>
          </div>
          <div className={`${styles.row} ${styles.total}`}>
            <span>Saldo Esperado:</span>
            <span className={styles.amount}>$2,590.00</span>
          </div>
          <button className="btn btn-primary" style={{ width: '100%', marginTop: '1rem' }}>Realizar Corte de Caja</button>
        </section>

        <section className={styles.historyCard}>
          <h3>Últimos Movimientos</h3>
          <div className={styles.list}>
            {[1, 2, 3, 4].map(i => (
              <div key={i} className={styles.listItem}>
                <div className={styles.itemInfo}>
                  <span className={styles.itemTitle}>Venta #120{i}</span>
                  <span className={styles.itemSub}>17:1{i} - Efectivo</span>
                </div>
                <span className={styles.itemAmount}>+$45.00</span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
};
