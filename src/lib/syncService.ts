import { OfflineDB } from './offlineDb';
import { registerFullEntry } from './salesService';

type SyncCallback = (count: number) => void;

class SyncService {
    private isSyncing = false;
    private listeners: SyncCallback[] = [];

    constructor() {
        if (typeof window !== 'undefined') {
            window.addEventListener('online', () => this.syncNow());
            // Periódicamente intentar sincronizar por si acaso
            setInterval(() => this.syncNow(), 30000);
        }
    }

    async syncNow() {
        if (this.isSyncing || !navigator.onLine) return;
        this.isSyncing = true;

        try {
            const pending = await OfflineDB.getPendingSales();
            this.notify(pending.length);

            for (const sale of pending) {
                try {
                    console.log(`📡 Sincronizando venta offline #${sale.id}...`);
                    await registerFullEntry(sale.data, true, sale.timestamp);
                    await OfflineDB.deleteSale(sale.id!);
                    console.log(`✅ Venta #${sale.id} sincronizada con éxito.`);
                } catch (err: any) {
                    console.error(`❌ Error al sincronizar venta #${sale.id}:`, err);
                    
                    // Si el error es de validación (datos corruptos que nunca entrarán), 
                    // la eliminamos de la cola para no ciclar la consola.
                    if (err.isValidationError) {
                        await OfflineDB.deleteSale(sale.id!);
                        console.warn(`🗑️ Venta #${sale.id} descartada por datos inválidos.`);
                    }

                    // Si el error es de conexión, detenemos el bucle de sincronización por ahora
                    if (!navigator.onLine) break;
                }
            }

            const remaining = await OfflineDB.getPendingSales();
            this.notify(remaining.length);
        } finally {
            this.isSyncing = false;
        }
    }

    onChange(callback: SyncCallback) {
        this.listeners.push(callback);
        // Notificar estado inicial
        OfflineDB.init()
            .then(() => OfflineDB.getPendingSales())
            .then(p => callback(p.length));
        
        return () => {
            this.listeners = this.listeners.filter(l => l !== callback);
        };
    }

    private notify(count: number) {
        this.listeners.forEach(l => l(count));
    }

    async getPendingCount() {
        const p = await OfflineDB.getPendingSales();
        return p.length;
    }
}

export const syncService = new SyncService();
