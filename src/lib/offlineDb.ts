
/**
 * Simple IndexedDB wrapper for Offline Sync
 * Database name: MundoPekesOffline
 * Store: pending_sales
 */

export interface PendingSale {
    id?: number;
    data: any;
    timestamp: number;
    retryCount: number;
}

const DB_NAME = 'MundoPekesOffline';
const STORE_NAME = 'pending_sales';
const DB_VERSION = 1;

export class OfflineDB {
    private static db: IDBDatabase | null = null;

    static async init(): Promise<IDBDatabase> {
        if (this.db) return this.db;

        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onupgradeneeded = (e: any) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
                }
            };

            request.onsuccess = (e: any) => {
                this.db = e.target.result;
                resolve(this.db!);
            };

            request.onerror = (e) => reject(e);
        });
    }

    static async saveSale(data: any): Promise<number> {
        const db = await this.init();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readwrite');
            const store = tx.objectStore(STORE_NAME);
            const request = store.add({ data, timestamp: Date.now(), retryCount: 0 });
            request.onsuccess = () => resolve(request.result as number);
            request.onerror = (e) => reject(e);
        });
    }

    static async getPendingSales(): Promise<PendingSale[]> {
        const db = await this.init();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readonly');
            const store = tx.objectStore(STORE_NAME);
            const request = store.getAll();
            request.onsuccess = () => resolve(request.result);
            request.onerror = (e) => reject(e);
        });
    }

    static async deleteSale(id: number): Promise<void> {
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
