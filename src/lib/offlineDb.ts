
/**
 * Simple IndexedDB wrapper for Offline Sync
 * Database name: MundoPekesOffline
 * Store: pending_sales
 */

export interface PendingSync {
    id?: number;
    type: 'sale' | 'inventory_sale' | 'stock_adjustment' | 'new_client';
    data: any;
    timestamp: number;
    retryCount: number;
}

const DB_NAME = 'MundoPekesOffline';
const STORE_NAME = 'pending_sync';
const DB_VERSION = 2; // Incrementar versión para el cambio de estructura

export class OfflineDB {
    private static db: IDBDatabase | null = null;

    static async init(): Promise<IDBDatabase> {
        if (this.db) return this.db;

        return new Promise((resolve, reject) => {
            console.log('📦 Iniciando OfflineDB...');
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onupgradeneeded = (e: any) => {
                const db = e.target.result;
                console.log('⚙️ Actualizando estructura de OfflineDB...', db.objectStoreNames);
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
                    console.log(`✅ Almacén ${STORE_NAME} creado.`);
                }
            };

            request.onsuccess = (e: any) => {
                this.db = e.target.result;
                console.log('✅ OfflineDB conectada con éxito.');
                resolve(this.db!);
            };

            request.onerror = (e) => {
                console.error('❌ Error fatal al abrir OfflineDB:', e);
                reject(e);
            };
        });
    }

    static async savePending(type: PendingSync['type'], data: any): Promise<number> {
        const db = await this.init();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readwrite');
            const store = tx.objectStore(STORE_NAME);
            const request = store.add({ type, data, timestamp: Date.now(), retryCount: 0 });
            request.onsuccess = () => resolve(request.result as number);
            request.onerror = (e) => reject(e);
        });
    }

    static async getPending(): Promise<PendingSync[]> {
        const db = await this.init();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readonly');
            const store = tx.objectStore(STORE_NAME);
            const request = store.getAll();
            request.onsuccess = () => resolve(request.result);
            request.onerror = (e) => reject(e);
        });
    }

    static async deletePending(id: number): Promise<void> {
        const db = await this.init();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readwrite');
            const store = tx.objectStore(STORE_NAME);
            const request = store.delete(id);
            request.onsuccess = () => resolve();
            request.onerror = (e) => reject(e);
        });
    }
}
