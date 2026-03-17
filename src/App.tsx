import React from 'react';
import './App.module.css'; // Remove App.css, we'll use vanilla css modules
import { SalesEngine } from './modules/sales/SalesEngine';
import { Dashboard } from './modules/dashboard/Dashboard';
import { Navigation } from './components/Navigation';
import { Treasury } from './modules/treasury/Treasury';
import { Analytics } from './modules/analytics/Analytics';
import { Backoffice } from './modules/backoffice/Backoffice';
import { SystemBar } from './components/SystemBar';

function App() {
  const [activeTab, setActiveTab] = React.useState<'ingresos' | 'dashboard' | 'treasury' | 'analytics' | 'config'>('dashboard');

  return (
    <div className="layout">
      <SystemBar />
      <Navigation activeTab={activeTab} setActiveTab={setActiveTab} />
      
      <main className="container" style={{ marginTop: '2rem', paddingBottom: '4rem' }}>
        <div 
          role="region" 
          aria-live="polite" 
          className="sr-only"
        >
          Vista de {activeTab === 'dashboard' ? 'Monitoreo' : 'Ingresos'} activa.
        </div>
        
        {activeTab === 'dashboard' && <Dashboard />}
        {activeTab === 'ingresos' && <SalesEngine />}
        {activeTab === 'treasury' && <Treasury />}
        {activeTab === 'analytics' && <Analytics />}
        {activeTab === 'config' && <Backoffice />}
      </main>
    </div>
  );
}

export default App;
