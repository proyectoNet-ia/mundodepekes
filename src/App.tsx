import React from 'react';
import './App.module.css'; 
import { SalesEngine } from './modules/sales/SalesEngine';
import { Dashboard } from './modules/dashboard/Dashboard';
import { Navigation } from './components/Navigation';
import { Treasury } from './modules/treasury/Treasury';
import { Analytics } from './modules/analytics/Analytics';
import { Audit } from './modules/audit/Audit';
import { Backoffice } from './modules/backoffice/Backoffice';
import { Records } from './modules/records/Records';
import { SystemBar } from './components/SystemBar';
import { authService, type UserProfile } from './lib/authService';
import { Login } from './modules/auth/Login';
import { Stock } from './modules/stock/Stock';
import { InventoryPOS } from './modules/sales/InventoryPOS';
import { ToastProvider } from './components/Toast';
import { RemoteAuthBell } from './components/RemoteAuthBell';
import { PortalPage } from './modules/portal/PortalPage';
import { Birthdays } from './modules/birthdays/Birthdays';

function App() {
  const [activeTab, setActiveTab] = React.useState<'ingresos' | 'dashboard' | 'treasury' | 'analytics' | 'audit' | 'config' | 'records' | 'stock' | 'pos' | 'birthdays'>('dashboard');
  const [selectedBirthdayId, setSelectedBirthdayId] = React.useState<string | null>(null);
  const [reentryData, setReentryData] = React.useState<any>(null);
  const [presaleData, setPresaleData] = React.useState<any>(null);
  const [user, setUser] = React.useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const userRef = React.useRef<UserProfile | null>(null);

  React.useEffect(() => {
    userRef.current = user;
  }, [user]);

  // Detectar si la URL es /portal (vista pública sin auth) - más flexible con la diagonal
  const isPortalRoute = window.location.pathname.startsWith('/portal');

  React.useEffect(() => {
    let isMounted = true;
    
    const initAuth = async () => {
      try {
        const currUser = await authService.getCurrentUser();
        if (isMounted && currUser) {
          setUser(currUser);
          if (currUser.role === 'analista' && activeTab === 'dashboard') setActiveTab('analytics');
        }
      } catch (err) {
        console.warn('Network issue during auth check. Retrying…');
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    initAuth();

    const { data: { subscription } } = authService.onAuthStateChange(async (newUser) => {
      if (!isMounted) return;
      
      const currentUser = userRef.current;
      
      // Bloqueo de Cierre por Micro-Corte de Red
      if (!newUser && currentUser) {
        // Si estamos offline, mantenemos al usuario (confianza total en sesión local)
        if (!navigator.onLine) {
            console.log('📡 Red caída detectada. Manteniendo sesión local activa...');
            return;
        }

        // Si hay internet pero reportó null, esperamos para re-verificar (Evita flickers de Supabase)
        setTimeout(async () => {
          const verifyAgain = await authService.getCurrentUser();
          if (!verifyAgain && isMounted && navigator.onLine) {
            console.warn('🚪 Sesión invalidada tras re-verificación. Redirigiendo a Login.');
            setUser(null);
            setActiveTab('dashboard'); // Reset tab state on logout
            setIsLoading(false);
          }
        }, 3000); // Aumentado a 3s para estabilidad total
      } else if (newUser) {
        if (!currentUser || currentUser.id !== newUser.id) {
          setActiveTab(newUser.role === 'analista' ? 'analytics' : 'dashboard');
        }
        setUser(newUser);
        setIsLoading(false);
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const handleExternalEntry = (data: any) => {
    setReentryData(data);
    setActiveTab('ingresos');
  };

  const handlePresaleEntry = (data: any) => {
    // Mapeo de datos de preventa al formato que entiende el SalesEngine
    setPresaleData({
      tutorName:        data.tutorNombre,
      phone:            data.tutorTelefono,
      email:            data.tutorEmail,
      presaleChildren:  data.ninos,       // Array de niños con paquete pre-seleccionado
      presaleId:        data.presaleId,
      isPrivateEvent:   data.isPrivateEvent ?? false,  // 🎂 Modo evento privado
    });
    setReentryData(null);
    setActiveTab('ingresos');
  };

  if (isPortalRoute) {
    return (
      <div className="portal-fullscreen">
        <PortalPage />
      </div>
    );
  }

  if (!user && !isLoading) {
    return <Login onLoginSuccess={() => {}} />;
  }

  if (!user && isLoading) {
    return <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc', fontStyle: 'italic', color: '#64748b' }}>Sincronizando con Mundo de Pekes...</div>;
  }

  return (
    <ToastProvider>
        <div className="layout" style={{ height: '100vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <SystemBar />
            
            {localStorage.getItem('modo_entrenamiento') === 'true' && (
                <div style={{ 
                    background: '#dc2626', 
                    color: 'white', 
                    textAlign: 'center', 
                    padding: '10px 16px', 
                    fontSize: '0.9rem', 
                    fontWeight: 'bold',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.15)',
                    zIndex: 9999,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '12px',
                    fontFamily: 'Inter, sans-serif'
                }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span>⚠️</span> MODO ENTRENAMIENTO ACTIVO
                    </span>
                    <span style={{ fontSize: '0.8rem', background: 'rgba(255,255,255,0.2)', padding: '2px 8px', borderRadius: '4px', fontWeight: 'normal' }}>
                        Las transacciones, ventas y movimientos de caja se simulan localmente y NO afectan la base de datos real
                    </span>
                    <button 
                        onClick={() => {
                            localStorage.setItem('modo_entrenamiento', 'false');
                            window.location.reload();
                        }}
                        style={{ 
                            background: 'white', 
                            color: '#dc2626', 
                            border: 'none', 
                            borderRadius: '4px', 
                            padding: '4px 12px', 
                            fontSize: '0.75rem', 
                            fontWeight: 'bold', 
                            cursor: 'pointer',
                            transition: 'background 0.2s',
                            boxShadow: '0 1px 2px rgba(0,0,0,0.1)'
                        }}
                        onMouseOver={(e) => e.currentTarget.style.background = '#fecaca'}
                        onMouseOut={(e) => e.currentTarget.style.background = 'white'}
                    >
                        Desactivar y Volver a Real
                    </button>
                </div>
            )}
            
            <div className="main-layout">
                {user && <Navigation activeTab={activeTab} setActiveTab={setActiveTab} userRole={user.role} user={user} />}
                
                <main className="container main-content">
                    {activeTab === 'dashboard' && (
                        <Dashboard 
                            onReentry={handleExternalEntry} 
                            onPresale={handlePresaleEntry} 
                            onManageBirthday={(id) => {
                                setSelectedBirthdayId(id);
                                setActiveTab('birthdays');
                            }}
                        />
                    )}
                    {activeTab === 'ingresos' && (
                        <SalesEngine 
                            user={user}
                            reentryData={reentryData || presaleData} 
                            onComplete={() => {
                                setReentryData(null);
                                setPresaleData(null);
                                setActiveTab('dashboard');
                            }}
                            onCancel={() => {
                                setReentryData(null);
                                setPresaleData(null);
                                setActiveTab('dashboard');
                            }}
                        />
                    )}
                    {activeTab === 'records' && <Records onEntry={handleExternalEntry} />}
                    {activeTab === 'treasury' && <Treasury user={user} onCancel={() => setActiveTab('dashboard')} />}
                    {activeTab === 'analytics' && <Analytics />}
                    {activeTab === 'audit' && <Audit />}
                    {activeTab === 'stock' && <Stock />}
                    {activeTab === 'pos' && <InventoryPOS onCancel={() => setActiveTab('dashboard')} />}
                    {activeTab === 'birthdays' && (
                        <Birthdays 
                            user={user!} 
                            initialSelectedId={selectedBirthdayId} 
                            onClearSelectedId={() => setSelectedBirthdayId(null)}
                            onCancel={() => {
                                setSelectedBirthdayId(null);
                                setActiveTab('dashboard');
                            }} 
                        />
                    )}
                    {activeTab === 'config' && <Backoffice />}
                </main>
            </div>
            {/* Campana de Autorizaciones Global */}
            <RemoteAuthBell />
        </div>
    </ToastProvider>
  );
}

export default App;
