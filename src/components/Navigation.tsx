import React, { useState } from 'react';
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
  faUserCircle,
  faBars,
  faTimes,
  faCloudUploadAlt
} from '@fortawesome/free-solid-svg-icons';
import { syncService } from '../lib/syncService';
import { useEffect } from 'react';
import { getSystemSettings } from '../lib/settingsService';

interface NavigationProps {
  activeTab: 'ingresos' | 'dashboard' | 'treasury' | 'analytics' | 'audit' | 'config' | 'records' | 'stock' | 'pos' | 'birthdays';
  setActiveTab: (tab: 'ingresos' | 'dashboard' | 'treasury' | 'analytics' | 'audit' | 'config' | 'records' | 'stock' | 'pos' | 'birthdays') => void;
  userRole?: UserRole;
  user?: UserProfile;
}

const TAB_LABELS: Record<string, string> = {
  dashboard: 'Monitoreo',
  ingresos: 'Ingresos',
  pos: 'Tienda / POS',
  records: 'Registros',
  treasury: 'Caja / Ventas',
  analytics: 'Analíticas',
  audit: 'Auditoría',
  stock: 'Inventarios',
  birthdays: 'Cumpleaños',
  config: 'Ajustes',
};

export const Navigation: React.FC<NavigationProps> = ({ activeTab, setActiveTab, userRole, user }) => {
    const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
    const [drawerOpen, setDrawerOpen] = useState(false);
    const [pendingSync, setPendingSync] = useState(0);
    const [systemLogo, setSystemLogo] = useState<string | null>(null);

    useEffect(() => {
      getSystemSettings().then(settings => {
          if (settings.logo_url) setSystemLogo(settings.logo_url);
      });
      return syncService.onChange(setPendingSync);
    }, []);

    const handleLogout = async () => {
        await authService.signOut();
        setShowLogoutConfirm(false);
    };

    const canSee = (tab: string) => {
        if (tab === 'birthdays') return true;
        if (userRole === 'admin') return true;
        switch (userRole) {
            case 'gerente':
                return ['dashboard', 'ingresos', 'pos', 'records', 'treasury', 'stock', 'birthdays'].includes(tab);
            case 'cajero':
                return ['dashboard', 'ingresos', 'pos', 'treasury', 'records'].includes(tab);
            case 'supervisor':
                return ['dashboard', 'ingresos', 'records', 'treasury', 'stock', 'pos', 'birthdays'].includes(tab);
            case 'analista':
                return ['analytics', 'audit'].includes(tab);
            default:
                return ['dashboard'].includes(tab);
        }
    };

    const handleTabSelect = (tab: Parameters<typeof setActiveTab>[0]) => {
        setActiveTab(tab);
        setDrawerOpen(false);
    };

    const navItems = (
        <>
          {canSee('dashboard') && (
            <button className={`${styles.tab} ${activeTab === 'dashboard' ? styles.active : ''}`} onClick={() => handleTabSelect('dashboard')}>
              <div className={styles.tabIcon}><FontAwesomeIcon icon={faChartLine} /></div>
              <div className={styles.tabTextGroup}>
                <span className={styles.tabTitle}>Monitoreo</span>
                <span className={styles.tabSubtitle}>Niños y Ocupación Total</span>
              </div>
            </button>
          )}
          {canSee('ingresos') && (
            <button className={`${styles.tab} ${activeTab === 'ingresos' ? styles.active : ''}`} onClick={() => handleTabSelect('ingresos')}>
              <div className={styles.tabIcon}><FontAwesomeIcon icon={faTicketAlt} /></div>
              <div className={styles.tabTextGroup}>
                <span className={styles.tabTitle}>Ingresos</span>
                <span className={styles.tabSubtitle}>Nueva Venta y Tickets</span>
              </div>
            </button>
          )}
          {canSee('pos') && (
            <button className={`${styles.tab} ${activeTab === 'pos' ? styles.active : ''}`} onClick={() => handleTabSelect('pos')}>
              <div className={styles.tabIcon}><FontAwesomeIcon icon={faStore} /></div>
              <div className={styles.tabTextGroup}>
                <span className={styles.tabTitle}>Tienda / POS</span>
                <span className={styles.tabSubtitle}>Venta de Productos</span>
              </div>
            </button>
          )}
          {canSee('records') && (
            <button className={`${styles.tab} ${activeTab === 'records' ? styles.active : ''}`} onClick={() => handleTabSelect('records')}>
              <div className={styles.tabIcon}><FontAwesomeIcon icon={faAddressBook} /></div>
              <div className={styles.tabTextGroup}>
                <span className={styles.tabTitle}>Registros</span>
                <span className={styles.tabSubtitle}>Historial de Clientes</span>
              </div>
            </button>
          )}
          {canSee('treasury') && (
            <button className={`${styles.tab} ${activeTab === 'treasury' ? styles.active : ''}`} onClick={() => handleTabSelect('treasury')}>
              <div className={styles.tabIcon}><FontAwesomeIcon icon={faMoneyBillWave} /></div>
              <div className={styles.tabTextGroup}>
                <span className={styles.tabTitle}>Caja / Ventas</span>
                <span className={styles.tabSubtitle}>Cortes y Gastos Diarios</span>
              </div>
            </button>
          )}
          {canSee('analytics') && (
            <button className={`${styles.tab} ${activeTab === 'analytics' ? styles.active : ''}`} onClick={() => handleTabSelect('analytics')}>
              <div className={styles.tabIcon}><FontAwesomeIcon icon={faChartPie} /></div>
              <div className={styles.tabTextGroup}>
                <span className={styles.tabTitle}>Analíticas</span>
                <span className={styles.tabSubtitle}>Reportes y Proyecciones</span>
              </div>
            </button>
          )}
          {canSee('audit') && (
            <button className={`${styles.tab} ${activeTab === 'audit' ? styles.active : ''}`} onClick={() => handleTabSelect('audit')}>
              <div className={styles.tabIcon}><FontAwesomeIcon icon={faShieldAlt} /></div>
              <div className={styles.tabTextGroup}>
                <span className={styles.tabTitle}>Auditoría</span>
                <span className={styles.tabSubtitle}>Radar de Rendimiento</span>
              </div>
            </button>
          )}
          {canSee('stock') && (
            <button className={`${styles.tab} ${activeTab === 'stock' ? styles.active : ''}`} onClick={() => handleTabSelect('stock')}>
              <div className={styles.tabIcon}><FontAwesomeIcon icon={faBoxes} /></div>
              <div className={styles.tabTextGroup}>
                <span className={styles.tabTitle}>Inventarios</span>
                <span className={styles.tabSubtitle}>Gestión de Artículos</span>
              </div>
            </button>
          )}
          {canSee('birthdays') && (
            <button className={`${styles.tab} ${activeTab === 'birthdays' ? styles.active : ''}`} onClick={() => handleTabSelect('birthdays')}>
              <div className={styles.tabIcon}><FontAwesomeIcon icon={faGamepad} /></div>
              <div className={styles.tabTextGroup}>
                <span className={styles.tabTitle}>Cumpleaños</span>
                <span className={styles.tabSubtitle}>Eventos y Festejos</span>
              </div>
            </button>
          )}
          {['admin', 'gerente', 'cajero', 'supervisor'].includes(userRole || '') && (
            <button className={`${styles.tab} ${activeTab === 'config' ? styles.active : ''}`} onClick={() => handleTabSelect('config')}>
              <div className={styles.tabIcon}><FontAwesomeIcon icon={faCogs} /></div>
              <div className={styles.tabTextGroup}>
                <span className={styles.tabTitle}>Ajustes</span>
                <span className={styles.tabSubtitle}>{userRole === 'admin' ? 'Configurar el Parque' : 'Impresoras'}</span>
              </div>
            </button>
          )}
        </>
    );

    return (
      <>
        {/* ── DESKTOP SIDEBAR ── */}
        <nav className={styles.navContainer}>
            <div className={styles.logo}>
              {systemLogo ? (
                <img src={systemLogo} alt="Logo" style={{ maxWidth: '80%', maxHeight: '45px', objectFit: 'contain' }} />
              ) : (
                <>
                  <span className={styles.logoIcon}><FontAwesomeIcon icon={faGamepad} /></span>
                  <span className={styles.logoText}>PekePark <span className={styles.adminText}>Admin</span></span>
                </>
              )}
            </div>
            <div className={styles.tabs}>{navItems}</div>
            
            {pendingSync > 0 && (
                <div className={styles.syncStatusCard} onClick={() => syncService.syncNow()}>
                    <div className={styles.syncIcon}><FontAwesomeIcon icon={faCloudUploadAlt} spin /></div>
                    <div className={styles.syncInfo}>
                        <strong>Modo Offline</strong>
                        <span>{pendingSync} pendientes</span>
                    </div>
                </div>
            )}

            <div className={styles.premiumCardWrapper}>
              {user && (
                <div className={styles.userPremiumCard}>
                  <div className={styles.userAvatar}><FontAwesomeIcon icon={faUserCircle} /></div>
                  <div className={styles.userInfo}>
                    <span className={styles.userEmail}>{(user.nombre_completo || 'USUARIO').toUpperCase()}</span>
                    <span className={styles.userRoleBadge}>{userRole?.toUpperCase()}</span>
                  </div>
                </div>
              )}
            </div>
            <button className={styles.logoutBtn} onClick={() => setShowLogoutConfirm(true)}>
              <FontAwesomeIcon icon={faArrowRightFromBracket} />
              <span>Cerrar Sesión</span>
            </button>
        </nav>

        {/* ── MOBILE TOP BAR ── */}
        <div className={styles.mobileTopBar}>
          <button className={styles.hamburgerBtn} onClick={() => setDrawerOpen(true)} aria-label="Menú">
            <FontAwesomeIcon icon={faBars} />
          </button>
          <span className={styles.mobileActiveLabel}>{TAB_LABELS[activeTab] || 'PekePark'}</span>
          {/* Spacer */}
          <div style={{ width: 40 }} />
        </div>

        {/* ── DRAWER OVERLAY ── */}
        <div className={`${styles.drawerOverlay} ${drawerOpen ? styles.open : ''}`} onClick={() => setDrawerOpen(false)} />

        {/* ── MOBILE DRAWER ── */}
        <nav className={`${styles.drawer} ${drawerOpen ? styles.open : ''}`}>
          <div className={styles.drawerHeader}>
            <div className={styles.logo}>
              {systemLogo ? (
                <img src={systemLogo} alt="Logo" style={{ maxWidth: '180px', maxHeight: '40px', objectFit: 'contain' }} />
              ) : (
                <>
                  <span className={styles.logoIcon}><FontAwesomeIcon icon={faGamepad} /></span>
                  <span className={styles.logoText}>PekePark <span className={styles.adminText}>Admin</span></span>
                </>
              )}
            </div>
            <button className={styles.drawerCloseBtn} onClick={() => setDrawerOpen(false)} aria-label="Cerrar menú">
              <FontAwesomeIcon icon={faTimes} />
            </button>
          </div>
          <div className={styles.tabs}>{navItems}</div>
          <div className={styles.premiumCardWrapper}>
            {user && (
              <div className={styles.userPremiumCard}>
                <div className={styles.userAvatar}><FontAwesomeIcon icon={faUserCircle} /></div>
                <div className={styles.userInfo}>
                  <span className={styles.userEmail}>{(user.nombre_completo || 'USUARIO').toUpperCase()}</span>
                  <span className={styles.userRoleBadge}>{userRole?.toUpperCase()}</span>
                </div>
              </div>
            )}
          </div>
          <button className={styles.logoutBtn} onClick={() => setShowLogoutConfirm(true)}>
            <FontAwesomeIcon icon={faArrowRightFromBracket} />
            <span>Cerrar Sesión</span>
          </button>
        </nav>

        <ConfirmDialog
            isOpen={showLogoutConfirm}
            title="Cerrar Sesión"
            message="¿Desea cerrar la sesión de PekePark Admin?"
            onCancel={() => setShowLogoutConfirm(false)}
            onConfirm={handleLogout}
        />
      </>
    );
};
