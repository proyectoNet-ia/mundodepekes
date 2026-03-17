import React from 'react';
import styles from './Navigation.module.css';

interface NavigationProps {
  activeTab: 'ingresos' | 'dashboard' | 'treasury' | 'analytics' | 'config';
  setActiveTab: (tab: 'ingresos' | 'dashboard' | 'treasury' | 'analytics' | 'config') => void;
}

export const Navigation: React.FC<NavigationProps> = ({ activeTab, setActiveTab }) => {
  return (
    <nav className={styles.navContainer}>
      <div className={styles.logo}>
        <span className={styles.logoIcon}>🎡</span>
        <span className={styles.logoText}>PekePark <span className={styles.adminText}>Admin</span></span>
      </div>
      
      <div className={styles.tabs}>
        <button 
          className={`${styles.tab} ${activeTab === 'dashboard' ? styles.active : ''}`}
          onClick={() => setActiveTab('dashboard')}
        >
          <span className={styles.tabIcon}>📊</span>
          Monitoreo
        </button>
        <button 
          className={`${styles.tab} ${activeTab === 'ingresos' ? styles.active : ''}`}
          onClick={() => setActiveTab('ingresos')}
        >
          <span className={styles.tabIcon}>🎟️</span>
          Ingresos
        </button>
        <button 
          className={`${styles.tab} ${activeTab === 'treasury' ? styles.active : ''}`}
          onClick={() => setActiveTab('treasury')}
        >
          <span className={styles.tabIcon}>🏦</span>
          Tesorería
        </button>
        <button 
          className={`${styles.tab} ${activeTab === 'analytics' ? styles.active : ''}`}
          onClick={() => setActiveTab('analytics')}
        >
          <span className={styles.tabIcon}>📈</span>
          BI
        </button>
        <button 
          className={`${styles.tab} ${activeTab === 'config' ? styles.active : ''}`}
          onClick={() => setActiveTab('config')}
        >
          <span className={styles.tabIcon}>⚙️</span>
          Config
        </button>
      </div>

      <div className={styles.userProfile}>
        <div className={styles.statusDot}></div>
        <span className={styles.userName}>Admin</span>
      </div>
    </nav>
  );
};
