
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
    private static initPromise: Promise<IDBDatabase> | null = null;

    private static resetConnection() {
        try {
            if (this.db) {
                this.db.close();
            }
        } catch {
            // Ignorar errores al cerrar conexión rota
        }
        this.db = null;
        this.initPromise = null;
    }

    static async init(): Promise<IDBDatabase> {
        if (this.db) {
            return this.db;
        }

        if (this.initPromise) {
            return this.initPromise;
        }

        this.initPromise = new Promise((resolve, reject) => {
            try {
                const request = indexedDB.open(DB_NAME, DB_VERSION);

                request.onupgradeneeded = (e: any) => {
                    const db = e.target.result;
                    if (!db.objectStoreNames.contains(STORE_NAME)) {
                        db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
                    }
                };

                request.onsuccess = (e: any) => {
                    const dbInstance: IDBDatabase = e.target.result;
                    this.db = dbInstance;

                    dbInstance.onversionchange = () => {
                        OfflineDB.resetConnection();
                    };
                    dbInstance.onclose = () => {
                        OfflineDB.resetConnection();
                    };
                    dbInstance.onerror = () => {
                        OfflineDB.resetConnection();
                    };

                    this.initPromise = null;
                    resolve(dbInstance);
                };

                request.onerror = (e) => {
                    OfflineDB.resetConnection();
                    reject(e);
                };

                request.onblocked = () => {
                    console.warn('⚠️ OfflineDB bloqueada temporalmente por otra pestaña.');
                };
            } catch (err) {
                OfflineDB.resetConnection();
                reject(err);
            }
        });

        return this.initPromise;
    }

    private static async runWithRetry<T>(
        action: (db: IDBDatabase) => Promise<T>,
        isRetry = false
    ): Promise<T> {
        try {
            const db = await this.init();
            return await action(db);
        } catch (err: any) {
            const isClosingOrClosed =
                err?.name === 'InvalidStateError' ||
                (typeof err?.message === 'string' &&
                    (err.message.includes('closing') || err.message.includes('closed')));

            if (!isRetry && isClosingOrClosed) {
                console.warn('🔄 Reiniciando conexión con OfflineDB tras InvalidStateError...');
                OfflineDB.resetConnection();
                return this.runWithRetry(action, true);
            }
            throw err;
        }
    }

    static async savePending(type: PendingSync['type'], data: any): Promise<number> {
        return this.runWithRetry((db) => {
            return new Promise((resolve, reject) => {
                try {
                    const tx = db.transaction(STORE_NAME, 'readwrite');
                    const store = tx.objectStore(STORE_NAME);
                    const request = store.add({ type, data, timestamp: Date.now(), retryCount: 0 });
                    request.onsuccess = () => resolve(request.result as number);
                    request.onerror = (e) => reject(e);
                    tx.onerror = (e) => reject(e);
                } catch (err) {
                    reject(err);
                }
            });
        });
    }

    static async getPending(): Promise<PendingSync[]> {
        try {
            return await this.runWithRetry((db) => {
                return new Promise((resolve, reject) => {
                    try {
                        const tx = db.transaction(STORE_NAME, 'readonly');
                        const store = tx.objectStore(STORE_NAME);
                        const request = store.getAll();
                        request.onsuccess = () => resolve((request.result || []) as PendingSync[]);
                        request.onerror = (e) => reject(e);
                        tx.onerror = (e) => reject(e);
                    } catch (err) {
                        reject(err);
                    }
                });
            });
        } catch (err) {
            console.warn('⚠️ No se pudieron cargar items de OfflineDB, retornando lista vacía:', err);
            return [];
        }
    }

    static async deletePending(id: number): Promise<void> {
        return this.runWithRetry((db) => {
            return new Promise((resolve, reject) => {
                try {
                    const tx = db.transaction(STORE_NAME, 'readwrite');
                    const store = tx.objectStore(STORE_NAME);
                    const request = store.delete(id);
                    request.onsuccess = () => resolve();
                    request.onerror = (e) => reject(e);
                    tx.onerror = (e) => reject(e);
                } catch (err) {
                    reject(err);
                }
            });
        });
    }
}
