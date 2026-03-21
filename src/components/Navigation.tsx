import React from 'react';
import styles from './Navigation.module.css';
import { authService, type UserRole, type UserProfile } from '../lib/authService';
import { ConfirmDialog } from './ConfirmDialog';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
  faArrowRightFromBracket, 
  faChartLine, 
  faTicketAlt, 
  faStore, 
  faAddressBook, 
  faChartPie, 
  faBoxes, 
  faCogs, 
  faGamepad,
  faMoneyBillWave,
  faShieldAlt,
  faUserCircle
} from '@fortawesome/free-solid-svg-icons';

interface NavigationProps {
  activeTab: 'ingresos' | 'dashboard' | 'treasury' | 'analytics' | 'audit' | 'config' | 'records' | 'stock' | 'pos';
  setActiveTab: (tab: 'ingresos' | 'dashboard' | 'treasury' | 'analytics' | 'audit' | 'config' | 'records' | 'stock' | 'pos') => void;
  userRole?: UserRole;
  user?: UserProfile;
}

export const Navigation: React.FC<NavigationProps> = ({ activeTab, setActiveTab, userRole, user }) => {
    const [showLogoutConfirm, setShowLogoutConfirm] = React.useState(false);

    const handleLogout = async () => {
        await authService.signOut();
        setShowLogoutConfirm(false);
    };

    const canSee = (tab: string) => {
        if (userRole === 'admin') return true;
        switch (userRole) {
            case 'cajero':
                // Cajero: POS, Taquilla, Radar (Sin CRM ni cajas fuertes)
                return ['dashboard', 'ingresos', 'pos'].includes(tab);
            case 'gerente':
                // Gerente: Todo excepto Backoffice, Auditoría y Analítica
                return ['dashboard', 'ingresos', 'records', 'treasury', 'stock', 'pos'].includes(tab);
            case 'analista':
                // Analista: Sólo reportes, auditoría y lectura de tesorería/clientes
                return ['analytics', 'audit', 'records', 'treasury'].includes(tab);
            default:
                return ['dashboard'].includes(tab);
        }
    };

    return (
    <nav className={styles.navContainer}>
        <div className={styles.logo}>
          <span className={styles.logoIcon}>
            <FontAwesomeIcon icon={faGamepad} />
          </span>
          <span className={styles.logoText}>PekePark <span className={styles.adminText}>Admin</span></span>
        </div>
        
        <div className={styles.tabs}>
          {canSee('dashboard') && (
            <button className={`${styles.tab} ${activeTab === 'dashboard' ? styles.active : ''}`} onClick={() => setActiveTab('dashboard')}>
              <div className={styles.tabIcon}><FontAwesomeIcon icon={faChartLine} /></div>
              <div className={styles.tabTextGroup}>
                <span className={styles.tabTitle}>Monitoreo</span>
                <span className={styles.tabSubtitle}>Niños y Ocupación Total</span>
              </div>
            </button>
          )}
          
          {canSee('ingresos') && (
            <button className={`${styles.tab} ${activeTab === 'ingresos' ? styles.active : ''}`} onClick={() => setActiveTab('ingresos')}>
              <div className={styles.tabIcon}><FontAwesomeIcon icon={faTicketAlt} /></div>
              <div className={styles.tabTextGroup}>
                <span className={styles.tabTitle}>Ingresos</span>
                <span className={styles.tabSubtitle}>Nueva Venta y Tickets</span>
              </div>
            </button>
          )}

          {canSee('pos') && (
            <button className={`${styles.tab} ${activeTab === 'pos' ? styles.active : ''}`} onClick={() => setActiveTab('pos')}>
              <div className={styles.tabIcon}><FontAwesomeIcon icon={faStore} /></div>
              <div className={styles.tabTextGroup}>
                <span className={styles.tabTitle}>Tienda / POS</span>
                <span className={styles.tabSubtitle}>Venta de Productos</span>
              </div>
            </button>
          )}

          {canSee('records') && (
            <button className={`${styles.tab} ${activeTab === 'records' ? styles.active : ''}`} onClick={() => setActiveTab('records')}>
              <div className={styles.tabIcon}><FontAwesomeIcon icon={faAddressBook} /></div>
              <div className={styles.tabTextGroup}>
                <span className={styles.tabTitle}>Registros</span>
                <span className={styles.tabSubtitle}>Historial de Clientes</span>
              </div>
            </button>
          )}

          {canSee('treasury') && (
            <button className={`${styles.tab} ${activeTab === 'treasury' ? styles.active : ''}`} onClick={() => setActiveTab('treasury')}>
              <div className={styles.tabIcon}><FontAwesomeIcon icon={faMoneyBillWave} /></div>
              <div className={styles.tabTextGroup}>
                <span className={styles.tabTitle}>Caja / Ventas</span>
                <span className={styles.tabSubtitle}>Cortes y Gastos Diarios</span>
              </div>
            </button>
          )}

          {canSee('analytics') && (
            <button className={`${styles.tab} ${activeTab === 'analytics' ? styles.active : ''}`} onClick={() => setActiveTab('analytics')}>
              <div className={styles.tabIcon}><FontAwesomeIcon icon={faChartPie} /></div>
              <div className={styles.tabTextGroup}>
                <span className={styles.tabTitle}>Analíticas</span>
                <span className={styles.tabSubtitle}>Reportes y Proyecciones</span>
              </div>
            </button>
          )}

          {canSee('audit') && (
            <button className={`${styles.tab} ${activeTab === 'audit' ? styles.active : ''}`} onClick={() => setActiveTab('audit')}>
              <div className={styles.tabIcon}><FontAwesomeIcon icon={faShieldAlt} /></div>
              <div className={styles.tabTextGroup}>
                <span className={styles.tabTitle}>Auditoría</span>
                <span className={styles.tabSubtitle}>Radar de Rendimiento</span>
              </div>
            </button>
          )}

          {canSee('stock') && (
            <button className={`${styles.tab} ${activeTab === 'stock' ? styles.active : ''}`} onClick={() => setActiveTab('stock')}>
              <div className={styles.tabIcon}><FontAwesomeIcon icon={faBoxes} /></div>
              <div className={styles.tabTextGroup}>
                <span className={styles.tabTitle}>Inventarios</span>
                <span className={styles.tabSubtitle}>Gestión de Artículos</span>
              </div>
            </button>
          )}

          {userRole === 'admin' && (
            <button className={`${styles.tab} ${activeTab === 'config' ? styles.active : ''}`} onClick={() => setActiveTab('config')}>
              <div className={styles.tabIcon}><FontAwesomeIcon icon={faCogs} /></div>
              <div className={styles.tabTextGroup}>
                <span className={styles.tabTitle}>Ajustes</span>
                <span className={styles.tabSubtitle}>Configurar el Parque</span>
              </div>
            </button>
          )}
        </div>

        <div style={{ marginTop: 'auto', marginBottom: '1rem' }}>
          {user && (
            <div className={styles.userPremiumCard}>
              <div className={styles.userAvatar}>
                <FontAwesomeIcon icon={faUserCircle} />
              </div>
              <div className={styles.userInfo}>
                <span className={styles.userEmail}>{user.email.split('@')[0].toUpperCase()}</span>
                <span className={styles.userRoleBadge}>{userRole?.toUpperCase()}</span>
              </div>
            </div>
          )}
        </div>

        <button className={styles.logoutBtn} onClick={() => setShowLogoutConfirm(true)}>
          <FontAwesomeIcon icon={faArrowRightFromBracket} />
          <span>Cerrar Sesión</span>
        </button>

        <ConfirmDialog
            isOpen={showLogoutConfirm}
            title="Cerrar Sesión"
            message="¿Desea cerrar la sesión de PekePark Admin?"
            onCancel={() => setShowLogoutConfirm(false)}
            onConfirm={handleLogout}
        />
    </nav>
    );
};
