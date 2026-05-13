import React, { useState, useEffect, useCallback } from 'react';
import styles from './PrinterConfig.module.css';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
    faPrint, faSave, faNetworkWired, faSync, faPlug,
    faCircleCheck, faCircleXmark, faSpinner, faListUl,
    faTriangleExclamation, faWifi
} from '@fortawesome/free-solid-svg-icons';
import { useToast } from '../../components/Toast';
import { PrinterService } from '../../lib/printerService';

interface PrinterSettings {
    ticketPrinter: {
        type: 'EPSON' | 'STAR' | 'GENERIC';
        connection: 'WEBUSB' | 'NETWORK' | 'PROXY';
        address?: string;
        printerName?: string;
        port?: number;
    };
    wristbandPrinter: {
        type: 'ZEBRA' | 'GENERIC';
        connection: 'WEBUSB' | 'NETWORK' | 'PROXY';
        address?: string;
        printerName?: string;
    };
    autoPrintTickets: boolean;
    autoPrintWristbands: boolean;
}

const DEFAULT_SETTINGS: PrinterSettings = {
    ticketPrinter: { type: 'EPSON', connection: 'PROXY', address: 'http://localhost:3000', port: 3000 },
    wristbandPrinter: { type: 'ZEBRA', connection: 'NETWORK' },
    autoPrintTickets: true,
    autoPrintWristbands: true
};

type AgentStatus = 'unknown' | 'checking' | 'online' | 'offline';

export const PrinterConfig: React.FC = () => {
    const { showToast } = useToast();
    const [settings, setSettings] = useState<PrinterSettings>(DEFAULT_SETTINGS);
    const [isSaving, setIsSaving] = useState(false);
    const [agentStatus, setAgentStatus] = useState<AgentStatus>('unknown');
    const [agentPrinters, setAgentPrinters] = useState<string[]>([]);
    const [isFetchingPrinters, setIsFetchingPrinters] = useState(false);
    const [isTestingPrint, setIsTestingPrint] = useState(false);

    useEffect(() => {
        const saved = localStorage.getItem('printer_settings');
        if (saved) {
            try { setSettings(JSON.parse(saved)); } catch (_) {}
        }
    }, []);

    // ── Verificar estado del agente local ─────────────────────────────────────
    const checkAgentStatus = useCallback(async () => {
        // Usar la dirección de cualquiera que sea PROXY
        const addr = (settings.ticketPrinter.connection === 'PROXY' ? settings.ticketPrinter.address : settings.wristbandPrinter.address) || 'http://localhost:3000';
        
        if (settings.ticketPrinter.connection !== 'PROXY' && settings.wristbandPrinter.connection !== 'PROXY') {
            setAgentStatus('unknown');
            return;
        }

        setAgentStatus('checking');
        try {
            const res = await fetch(`${addr}/health`, { signal: AbortSignal.timeout(3000) });
            if (res.ok) {
                setAgentStatus('online');
            } else {
                setAgentStatus('offline');
            }
        } catch {
            setAgentStatus('offline');
        }
    }, [settings.ticketPrinter.address, settings.ticketPrinter.connection, settings.wristbandPrinter.address, settings.wristbandPrinter.connection]);

    // Verificar automáticamente al cargar y cuando cambia la dirección
    useEffect(() => {
        if (settings.ticketPrinter.connection === 'PROXY') {
            checkAgentStatus();
        } else {
            setAgentStatus('unknown');
        }
    }, [settings.ticketPrinter.connection, settings.ticketPrinter.address, checkAgentStatus]);

    // ── Obtener lista de impresoras del agente ────────────────────────────────
    const fetchPrinters = async () => {
        const addr = settings.ticketPrinter.address || 'http://localhost:3000';
        setIsFetchingPrinters(true);
        try {
            const res = await fetch(`${addr}/printers`, { signal: AbortSignal.timeout(5000) });
            const data = await res.json();
            setAgentPrinters(data.printers || []);
            if (data.printers?.length === 0) {
                showToast('No se encontraron impresoras en Windows.', 'warning' as any);
            } else {
                showToast(`${data.printers.length} impresora(s) encontrada(s).`, 'success');
            }
        } catch {
            showToast('No se pudo conectar al agente. ¿Está iniciado?', 'error' as any);
        } finally {
            setIsFetchingPrinters(false);
        }
    };

    // ── Guardar configuración ─────────────────────────────────────────────────
    const handleSave = () => {
        setIsSaving(true);
        localStorage.setItem('printer_settings', JSON.stringify(settings));
        setTimeout(() => {
            setIsSaving(false);
            showToast('Configuración de impresoras guardada.', 'success');
        }, 600);
    };

    // ── Prueba de impresión real ──────────────────────────────────────────────
    const handleTestPrint = async (role: 'TICKET' | 'WRISTBAND') => {
        setIsTestingPrint(true);
        showToast(`Enviando ${role === 'TICKET' ? 'ticket' : 'pulsera'} de prueba...`, 'info' as any);

        // Guardar antes de probar
        localStorage.setItem('printer_settings', JSON.stringify(settings));

        let ok = false;
        if (role === 'TICKET') {
            const testData = {
                folio: 'TEST-001',
                cliente: 'PRUEBA SISTEMA',
                telefono: '5500000000',
                staffEmail: 'admin@mundodepekes.com',
                items: [{
                    nino: 'Niño de Prueba',
                    nombre: 'Paquete Demo 1 hora',
                    precio: 150,
                    duracion: 60,
                    hora_entrada: '10:00',
                    hora_salida: '11:00'
                }],
                accesorios: [],
                subtotal: 150,
                iva: 0,
                total: 150,
                paymentMethod: 'EFECTIVO',
                mensaje: '✓ Impresión de prueba correcta'
            };
            const original = PrinterService.formatEpsonTicket(testData as any, false);
            const copia = PrinterService.formatEpsonTicket(testData as any, true);
            
            // Enviamos dos trabajos de impresión separados
            await PrinterService.printRaw(original, 'TICKET');
            ok = await PrinterService.printRaw(copia, 'TICKET');
        } else {
            const wristData = {
                nino: 'PRUEBA ZEBRA',
                idPeke: 'P-123',
                paquete: 'Pulsera Test',
                area: 'Laberinto Central',
                duracion: 60,
                horaEntrada: '14:00',
                horaSalida: '15:00',
                folio: 'Z-PROO'
            };
            const content = PrinterService.formatZebraWristband(wristData);
            ok = await PrinterService.printRaw(content, 'WRISTBAND');
        }

        setIsTestingPrint(false);
        if (ok) {
            showToast(`${role === 'TICKET' ? 'Ticket' : 'Pulsera'} de prueba enviado correctamente.`, 'success');
        } else {
            showToast('Error al enviar la impresión. Verifica la configuración.', 'error' as any);
        }
    };

    // ── Render de estado del agente ───────────────────────────────────────────
    const renderAgentBadge = () => {
        const map = {
            unknown:  { icon: faWifi,         color: '#94a3b8', label: 'No configurado' },
            checking: { icon: faSpinner,       color: '#f59e0b', label: 'Verificando...' },
            online:   { icon: faCircleCheck,   color: '#10b981', label: 'Agente activo ✓' },
            offline:  { icon: faCircleXmark,   color: '#ef4444', label: 'Agente no detectado' },
        };
        const s = map[agentStatus];
        return (
            <div className={styles.agentBadge} style={{ borderColor: s.color, color: s.color }}>
                <FontAwesomeIcon icon={s.icon} spin={agentStatus === 'checking'} />
                <span>{s.label}</span>
            </div>
        );
    };

    return (
        <div className={styles.configContainer}>
            <div className={styles.sectionHeader}>
                <div className={styles.iconCircle}><FontAwesomeIcon icon={faPrint} /></div>
                <div>
                    <h3>Configuración de Hardware Local</h3>
                    <p>Vincula tus impresoras térmicas para esta estación.</p>
                </div>
            </div>

            <div className={styles.settingsGrid}>
                {/* ── Impresora de Tickets ────────────────────────────────── */}
                <div className={styles.card}>
                    <div className={styles.cardHeader}>
                        <FontAwesomeIcon icon={faPlug} />
                        <h4>Impresora de Tickets (Recibos)</h4>
                    </div>
                    <div className={styles.form}>
                        <label>Tipo de Impresora</label>
                        <select
                            value={settings.ticketPrinter.type}
                            onChange={e => setSettings({ ...settings, ticketPrinter: { ...settings.ticketPrinter, type: e.target.value as any } })}
                        >
                            <option value="EPSON">Epson (ESC/POS)</option>
                            <option value="STAR">Star Micronics</option>
                            <option value="GENERIC">Genérica Térmica</option>
                        </select>

                        <label>Método de Conexión</label>
                        <div className={styles.connectionToggle}>
                            <button
                                className={settings.ticketPrinter.connection === 'PROXY' ? styles.active : ''}
                                onClick={() => setSettings({ ...settings, ticketPrinter: { ...settings.ticketPrinter, connection: 'PROXY', address: settings.ticketPrinter.address || 'http://localhost:3000' } })}
                            >🖥️ USB / Agente Local</button>
                            <button
                                className={settings.ticketPrinter.connection === 'NETWORK' ? styles.active : ''}
                                onClick={() => setSettings({ ...settings, ticketPrinter: { ...settings.ticketPrinter, connection: 'NETWORK' } })}
                            >🌐 Red (IP)</button>
                            <button
                                className={settings.ticketPrinter.connection === 'WEBUSB' ? styles.active : ''}
                                onClick={() => setSettings({ ...settings, ticketPrinter: { ...settings.ticketPrinter, connection: 'WEBUSB' } })}
                            >⚡ WebUSB</button>
                        </div>

                        {/* ── PROXY: Agente local ── */}
                        {settings.ticketPrinter.connection === 'PROXY' && (
                            <div className={styles.proxyBlock}>
                                {renderAgentBadge()}

                                <label>URL del Agente</label>
                                <input
                                    type="text"
                                    placeholder="http://localhost:3000"
                                    value={settings.ticketPrinter.address || ''}
                                    onChange={e => setSettings({ ...settings, ticketPrinter: { ...settings.ticketPrinter, address: e.target.value } })}
                                />

                                <button className={styles.verifyBtn} onClick={checkAgentStatus} disabled={agentStatus === 'checking'}>
                                    <FontAwesomeIcon icon={faSync} spin={agentStatus === 'checking'} />
                                    Verificar Conexión
                                </button>

                                {agentStatus === 'online' && (
                                    <div className={styles.printerSelector}>
                                        <label>Impresora Windows</label>
                                        <div style={{ display: 'flex', gap: '8px' }}>
                                            <select
                                                value={settings.ticketPrinter.printerName || ''}
                                                onChange={e => setSettings({ ...settings, ticketPrinter: { ...settings.ticketPrinter, printerName: e.target.value } })}
                                                style={{ flex: 1 }}
                                            >
                                                <option value="">(Predeterminada del sistema)</option>
                                                {agentPrinters.map(p => <option key={p} value={p}>{p}</option>)}
                                            </select>
                                            <button className={styles.smallBtn} onClick={fetchPrinters} disabled={isFetchingPrinters} title="Actualizar lista">
                                                <FontAwesomeIcon icon={isFetchingPrinters ? faSpinner : faListUl} spin={isFetchingPrinters} />
                                            </button>
                                        </div>
                                        {agentPrinters.length === 0 && (
                                            <p className={styles.hint}>
                                                <FontAwesomeIcon icon={faTriangleExclamation} /> Haz click en el botón de la derecha para detectar las impresoras instaladas en Windows.
                                            </p>
                                        )}
                                    </div>
                                )}

                                {agentStatus === 'offline' && (
                                    <div className={styles.offlineWarning}>
                                        <FontAwesomeIcon icon={faTriangleExclamation} />
                                        <div style={{ flex: 1 }}>
                                            <strong>El agente no está corriendo.</strong>
                                            <p>Haz clic en el botón de abajo para iniciarlo automáticamente, o abre la carpeta <code>print-agent</code> y ejecuta <code>INICIAR_AGENTE.bat</code></p>
                                            <a href="peke-agent://start" onClick={() => setTimeout(checkAgentStatus, 3000)} style={{ display: 'inline-block', marginTop: '0.8rem', padding: '0.4rem 1rem', background: '#dc2626', color: '#fff', borderRadius: '4px', textDecoration: 'none', fontWeight: 600, fontSize: '0.85rem' }}>
                                                🚀 Arrancar Impresoras
                                            </a>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* ── RED: Dirección IP ── */}
                        {settings.ticketPrinter.connection === 'NETWORK' && (
                            <div style={{ marginTop: '1rem' }}>
                                <label>Dirección IP de la Impresora</label>
                                <input
                                    type="text"
                                    placeholder="192.168.1.100"
                                    value={settings.ticketPrinter.address || ''}
                                    onChange={e => setSettings({ ...settings, ticketPrinter: { ...settings.ticketPrinter, address: e.target.value } })}
                                />
                            </div>
                        )}

                        <button className={styles.testBtn} onClick={() => handleTestPrint('TICKET')} disabled={isTestingPrint}>
                            <FontAwesomeIcon icon={isTestingPrint ? faSpinner : faPrint} spin={isTestingPrint} />
                            {isTestingPrint ? 'Imprimiendo...' : 'Imprimir Ticket de Prueba'}
                        </button>
                    </div>
                </div>

                {/* ── Impresora de Pulseras ──────────────────────────────── */}
                <div className={styles.card}>
                    <div className={styles.cardHeader}>
                        <FontAwesomeIcon icon={faNetworkWired} />
                        <h4>Impresora de Pulseras (Zebra)</h4>
                    </div>
                    <div className={styles.form}>
                        <label>Tipo de Impresora</label>
                        <select
                            value={settings.wristbandPrinter.type}
                            onChange={e => setSettings({ ...settings, wristbandPrinter: { ...settings.wristbandPrinter, type: e.target.value as any } })}
                        >
                            <option value="ZEBRA">Zebra (ZPL)</option>
                            <option value="GENERIC">Genérica</option>
                        </select>

                        <label>Método de Conexión</label>
                        <div className={styles.connectionToggle}>
                            <button
                                className={settings.wristbandPrinter.connection === 'NETWORK' ? styles.active : ''}
                                onClick={() => setSettings({ ...settings, wristbandPrinter: { ...settings.wristbandPrinter, connection: 'NETWORK' } })}
                            >🌐 Red (IP)</button>
                            <button
                                className={settings.wristbandPrinter.connection === 'PROXY' ? styles.active : ''}
                                onClick={() => setSettings({ ...settings, wristbandPrinter: { ...settings.wristbandPrinter, connection: 'PROXY' } })}
                            >🖥️ USB / Agente</button>
                            <button
                                className={settings.wristbandPrinter.connection === 'WEBUSB' ? styles.active : ''}
                                onClick={() => setSettings({ ...settings, wristbandPrinter: { ...settings.wristbandPrinter, connection: 'WEBUSB' } })}
                            >⚡ WebUSB</button>
                        </div>

                        {/* ── PROXY: Agente local para Zebra ── */}
                        {settings.wristbandPrinter.connection === 'PROXY' && (
                             <div className={styles.proxyBlock} style={{ marginTop: '1rem' }}>
                                {renderAgentBadge()}

                                <label>URL del Agente</label>
                                <input
                                    type="text"
                                    placeholder="http://localhost:3000"
                                    value={settings.wristbandPrinter.address || ''}
                                    onChange={e => setSettings({ ...settings, wristbandPrinter: { ...settings.wristbandPrinter, address: e.target.value } })}
                                />

                                <button className={styles.verifyBtn} onClick={checkAgentStatus} disabled={agentStatus === 'checking'}>
                                    <FontAwesomeIcon icon={faSync} spin={agentStatus === 'checking'} />
                                    Verificar Conexión
                                </button>

                                {agentStatus === 'online' && (
                                    <div className={styles.printerSelector}>
                                        <label>Nombre Impresora Zebra en Windows</label>
                                        <div style={{ display: 'flex', gap: '8px' }}>
                                            <select
                                                value={settings.wristbandPrinter.printerName || ''}
                                                onChange={e => setSettings({ ...settings, wristbandPrinter: { ...settings.wristbandPrinter, printerName: e.target.value } })}
                                                style={{ flex: 1 }}
                                            >
                                                <option value="">(Selecciona impresora Zebra...)</option>
                                                {agentPrinters.map(p => <option key={p} value={p}>{p}</option>)}
                                            </select>
                                            <button className={styles.smallBtn} onClick={fetchPrinters} disabled={isFetchingPrinters} title="Actualizar lista">
                                                <FontAwesomeIcon icon={isFetchingPrinters ? faSpinner : faListUl} spin={isFetchingPrinters} />
                                            </button>
                                        </div>
                                    </div>
                                )}
                             </div>
                        )}

                        {settings.wristbandPrinter.connection === 'NETWORK' && (
                            <div style={{ marginTop: '1rem' }}>
                                <label>Dirección IP de la Zebra</label>
                                <input
                                    type="text"
                                    placeholder="192.168.1.50"
                                    value={settings.wristbandPrinter.address || ''}
                                    onChange={e => setSettings({ ...settings, wristbandPrinter: { ...settings.wristbandPrinter, address: e.target.value } })}
                                />
                            </div>
                        )}

                        <button 
                            className={styles.testBtn} 
                            onClick={() => handleTestPrint('WRISTBAND')} 
                            disabled={isTestingPrint}
                            style={{ marginTop: '1.5rem' }}
                        >
                            <FontAwesomeIcon icon={isTestingPrint ? faSpinner : faPrint} spin={isTestingPrint} />
                            {isTestingPrint ? 'Imprimiendo...' : 'Imprimir Pulsera de Prueba'}
                        </button>
                    </div>
                </div>
            </div>

            {/* ── Pie: switches y guardar ─────────────────────────────────── */}
            <div className={styles.footer}>
                <div className={styles.switches}>
                    <label className={styles.switchLabel}>
                        <input type="checkbox" checked={settings.autoPrintTickets} onChange={e => setSettings({ ...settings, autoPrintTickets: e.target.checked })} />
                        Impresión automática de Recibos al finalizar venta
                    </label>
                    <label className={styles.switchLabel}>
                        <input type="checkbox" checked={settings.autoPrintWristbands} onChange={e => setSettings({ ...settings, autoPrintWristbands: e.target.checked })} />
                        Impresión automática de Pulseras al finalizar venta
                    </label>
                </div>
                <button className={styles.saveBtn} onClick={handleSave} disabled={isSaving}>
                    <FontAwesomeIcon icon={isSaving ? faSync : faSave} spin={isSaving} />
                    {isSaving ? 'Guardando...' : 'Guardar Configuración'}
                </button>
            </div>
        </div>
    );
};
