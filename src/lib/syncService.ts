import { OfflineDB, type PendingSync } from './offlineDb';
import { registerFullEntry, registerInventorySale } from './salesService';
import { stockService } from './stockService';

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
            const pending = await OfflineDB.getPending();
            this.notify(pending.length);

            for (const item of pending) {
                try {
                    console.log(`📡 Sincronizando item offline #${item.id} (Tipo: ${item.type})...`);
                    
                    if (item.type === 'sale') {
                        await registerFullEntry(item.data, true, item.timestamp);
                    } else if (item.type === 'inventory_sale') {
                        await registerInventorySale(item.data, true);
                    } else if (item.type === 'stock_adjustment') {
                        await stockService.recordMovement(item.data.itemId, item.data.qty, item.data.type, item.data.reason, true);
                    }

                    await OfflineDB.deletePending(item.id!);
                    this.notifySuccess(item);
                    console.log(`✅ Item #${item.id} sincronizado con éxito.`);
                } catch (err: any) {
                    console.error(`❌ Error al sincronizar item #${item.id}:`, err);
                    
                    if (err.isValidationError) {
                        await OfflineDB.deletePending(item.id!);
                        console.warn(`🗑️ Item #${item.id} descartada por datos inválidos.`);
                    }

                    if (!navigator.onLine) break;
                }
            }

            const remaining = await OfflineDB.getPending();
            this.notify(remaining.length);
        } finally {
            this.isSyncing = false;
        }
    }

    async enqueue(type: PendingSync['type'], data: any) {
        console.log(`📝 Encolando item de tipo ${type}...`, data);
        const id = await OfflineDB.savePending(type, data);
        console.log(`✅ Item #${id} guardado localmente.`);
        const pending = await OfflineDB.getPending();
        this.notify(pending.length);
        return id;
    }

    private successListeners: ((item: any) => void)[] = [];

    onSyncSuccess(callback: (item: any) => void) {
        this.successListeners.push(callback);
        return () => {
            this.successListeners = this.successListeners.filter(l => l !== callback);
        };
    }

    private notifySuccess(item: any) {
        this.successListeners.forEach(l => l(item));
    }

    onChange(callback: SyncCallback) {
        this.listeners.push(callback);
        OfflineDB.init()
            .then(() => OfflineDB.getPending())
            .then(p => callback(p.length));
        
        return () => {
            this.listeners = this.listeners.filter(l => l !== callback);
        };
    }

    private notify(count: number) {
        this.listeners.forEach(l => l(count));
    }

    async getPendingItems() {
        return await OfflineDB.getPending();
    }

    async getPendingCount() {
        const p = await OfflineDB.getPending();
        return p.length;
    }
}

export const syncService = new SyncService();
