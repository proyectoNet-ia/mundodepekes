import { useState, useEffect } from 'react';

interface SystemStatus {
  isOnline: boolean;
  printerEpson: 'connected' | 'disconnected' | 'checking';
  printerZebra: 'connected' | 'disconnected' | 'checking';
  lastSync: string | null;
}

export const useResilience = () => {
  const [status, setStatus] = useState<SystemStatus>({
    isOnline: navigator.onLine,
    printerEpson: 'checking',
    printerZebra: 'checking',
    lastSync: localStorage.getItem('last_sync_time'),
  });

  useEffect(() => {
    const handleOnline = () => setStatus(prev => ({ ...prev, isOnline: true }));
    const handleOffline = () => setStatus(prev => ({ ...prev, isOnline: false }));

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Mocking Hardware Check
    const checkHardware = setTimeout(() => {
      setStatus(prev => ({
        ...prev,
        printerEpson: 'connected',
        printerZebra: 'connected',
      }));
    }, 2000);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearTimeout(checkHardware);
    };
  }, []);

  const saveOfflineData = (key: string, data: any) => {
    const offlineQueue = JSON.parse(localStorage.getItem('offline_queue') || '[]');
    offlineQueue.push({ key, data, timestamp: new Date().toISOString() });
    localStorage.setItem('offline_queue', JSON.stringify(offlineQueue));
    setStatus(prev => ({ ...prev, lastSync: new Date().toISOString() }));
  };

  return { status, saveOfflineData };
};
