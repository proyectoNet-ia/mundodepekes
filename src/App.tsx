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
import { PreFlightCheck } from './components/PreFlightCheck';
import { authService, type UserProfile } from './lib/authService';
import { Login } from './modules/auth/Login';
import { Stock } from './modules/stock/Stock';
import { InventoryPOS } from './modules/sales/InventoryPOS';
import { ToastProvider } from './components/Toast';
import { RemoteAuthBell } from './components/RemoteAuthBell';

function App() {
  const [activeTab, setActiveTab] = React.useState<'ingresos' | 'dashboard' | 'treasury' | 'analytics' | 'audit' | 'config' | 'records' | 'stock' | 'pos'>('dashboard');
  const [reentryData, setReentryData] = React.useState<any>(null);
  const [isReady, setIsReady] = React.useState(false);
  const [user, setUser] = React.useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);

  React.useEffect(() => {
    let isMounted = true;
    
    const initAuth = async () => {
      try {
        const currUser = await authService.getCurrentUser();
        if (isMounted && currUser) {
          setUser(currUser);
        }
      } catch (err) {
        console.warn('Network issue during auth check. Retrying…');
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    initAuth();

    const { data: { subscription } } = authService.onAuthStateChange((newUser) => {
      if (!isMounted) return;
      
      // Si el cambio es a null, esperamos un momento (debote) para evitar cierres falsos por cortes de 4G/WiFi
      if (!newUser && user) {
        setTimeout(async () => {
          const verifyAgain = await authService.getCurrentUser();
          if (!verifyAgain && isMounted) {
            setUser(null);
            setIsLoading(false);
          }
        }, 1500);
      } else {
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

  if (!user && !isLoading) {
    return <Login onLoginSuccess={() => {}} />;
  }

  if (!user && isLoading) {
    return <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc', fontStyle: 'italic', color: '#64748b' }}>Sincronizando con Mundo de Pekes...</div>;
  }

  return (
    <ToastProvider>
        <div className="layout" style={{ height: '100vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            {!isReady && (
                <PreFlightCheck 
                    onCompleted={(needsOpening) => {
                        setIsReady(true);
                        if (needsOpening) setActiveTab('treasury');
                    }} 
                />
            )}
            <SystemBar />
            
            <div className="main-layout">
                {user && <Navigation activeTab={activeTab} setActiveTab={setActiveTab} userRole={user.role} user={user} />}
                
                <main className="container main-content">
                    {activeTab === 'dashboard' && <Dashboard onReentry={handleExternalEntry} />}
                    {activeTab === 'ingresos' && (
                        <SalesEngine 
                            user={user}
                            reentryData={reentryData} 
                            onComplete={() => {
                                setReentryData(null);
                                setActiveTab('dashboard');
                            }}
                            onCancel={() => {
                                setReentryData(null);
                                setActiveTab('dashboard');
                            }}
                        />
                    )}
                    {activeTab === 'records' && <Records onEntry={handleExternalEntry} />}
                    {activeTab === 'treasury' && <Treasury />}
                    {activeTab === 'analytics' && <Analytics />}
                    {activeTab === 'audit' && <Audit />}
                    {activeTab === 'stock' && <Stock />}
                    {activeTab === 'pos' && <InventoryPOS />}
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
