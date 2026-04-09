import React, { useState, useEffect } from 'react';
import styles from './PrinterConfig.module.css';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPrint, faSave, faNetworkWired, faSync, faPlug } from '@fortawesome/free-solid-svg-icons';
import { useToast } from '../../components/Toast';

interface PrinterSettings {
    ticketPrinter: {
        type: 'EPSON' | 'STAR' | 'GENERIC';
        connection: 'WEBUSB' | 'NETWORK' | 'PROXY';
        address?: string; // IP or Proxy URL
        deviceName?: string;
    };
    wristbandPrinter: {
        type: 'ZEBRA' | 'GENERIC';
        connection: 'WEBUSB' | 'NETWORK' | 'PROXY';
        address?: string;
        deviceName?: string;
    };
    autoPrintTickets: boolean;
    autoPrintWristbands: boolean;
}

const DEFAULT_SETTINGS: PrinterSettings = {
    ticketPrinter: { type: 'EPSON', connection: 'WEBUSB' },
    wristbandPrinter: { type: 'ZEBRA', connection: 'WEBUSB' },
    autoPrintTickets: true,
    autoPrintWristbands: true
};

export const PrinterConfig: React.FC = () => {
    const { showToast } = useToast();
    const [settings, setSettings] = useState<PrinterSettings>(DEFAULT_SETTINGS);
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        const saved = localStorage.getItem('printer_settings');
        if (saved) setSettings(JSON.parse(saved));
    }, []);

    const handleSave = () => {
        setIsSaving(true);
        localStorage.setItem('printer_settings', JSON.stringify(settings));
        setTimeout(() => {
            setIsSaving(false);
            showToast('Configuración de impresoras guardada localmente.', 'success');
        }, 800);
    };

    const handleTestPrint = (type: 'TICKET' | 'WRISTBAND') => {
        showToast(`Enviando prueba a la impresora de ${type}...`, 'info');
        // Aquí se llamaría al PrinterService con datos dummy
    };

    return (
        <div className={styles.configContainer}>
            <div className={styles.sectionHeader}>
                <div className={styles.iconCircle}><FontAwesomeIcon icon={faPrint} /></div>
                <div>
                    <h3>Configuración de Hardware Local</h3>
                    <p>Conecta y vincula tus impresoras térmicas y de pulseras para esta estación.</p>
                </div>
            </div>

            <div className={styles.settingsGrid}>
                {/* Impresora de Tickets */}
                <div className={styles.card}>
                    <div className={styles.cardHeader}>
                        <FontAwesomeIcon icon={faPlug} />
                        <h4>Impresora de Tickets (Recibos)</h4>
                    </div>
                    <div className={styles.form}>
                        <label>Tipo de Impresora</label>
                        <select 
                            value={settings.ticketPrinter.type} 
                            onChange={e => setSettings({...settings, ticketPrinter: {...settings.ticketPrinter, type: e.target.value as any}})}
                        >
                            <option value="EPSON">Epson (ESC/POS)</option>
                            <option value="STAR">Star Micronics</option>
                            <option value="GENERIC">Genérica Térmica</option>
                        </select>

                        <label>Método de Conexión</label>
                        <div className={styles.connectionToggle}>
                            <button 
                                className={settings.ticketPrinter.connection === 'WEBUSB' ? styles.active : ''} 
                                onClick={() => setSettings({...settings, ticketPrinter: {...settings.ticketPrinter, connection: 'WEBUSB'}})}
                            >WebUSB (Directo)</button>
                            <button 
                                className={settings.ticketPrinter.connection === 'NETWORK' ? styles.active : ''} 
                                onClick={() => setSettings({...settings, ticketPrinter: {...settings.ticketPrinter, connection: 'NETWORK'}})}
                            >Red (IP)</button>
                            <button 
                                className={settings.ticketPrinter.connection === 'PROXY' ? styles.active : ''} 
                                onClick={() => setSettings({...settings, ticketPrinter: {...settings.ticketPrinter, connection: 'PROXY'}})}
                            >Agente Local (Proxy)</button>
                        </div>

                        {settings.ticketPrinter.connection !== 'WEBUSB' && (
                            <div style={{ marginTop: '1rem' }}>
                                <label>{settings.ticketPrinter.connection === 'NETWORK' ? 'Dirección IP' : 'URL del Agente'}</label>
                                <input 
                                    type="text" 
                                    placeholder={settings.ticketPrinter.connection === 'NETWORK' ? '192.168.1.100' : 'http://localhost:3000'}
                                    value={settings.ticketPrinter.address}
                                    onChange={e => setSettings({...settings, ticketPrinter: {...settings.ticketPrinter, address: e.target.value}})}
                                />
                            </div>
                        )}

                        <button className={styles.testBtn} onClick={() => handleTestPrint('TICKET')}>
                           <FontAwesomeIcon icon={faSync} /> Probar Impresión
                        </button>
                    </div>
                </div>

                {/* Impresora de Pulseras */}
                <div className={styles.card}>
                    <div className={styles.cardHeader}>
                        <FontAwesomeIcon icon={faNetworkWired} />
                        <h4>Impresora de Pulseras</h4>
                    </div>
                    <div className={styles.form}>
                        <label>Tipo de Impresora</label>
                        <select 
                            value={settings.wristbandPrinter.type} 
                            onChange={e => setSettings({...settings, wristbandPrinter: {...settings.wristbandPrinter, type: e.target.value as any}})}
                        >
                            <option value="ZEBRA">Zebra (ZPL)</option>
                            <option value="GENERIC">Genérica</option>
                        </select>

                        <label>Método de Conexión</label>
                        <div className={styles.connectionToggle}>
                            <button 
                                className={settings.wristbandPrinter.connection === 'WEBUSB' ? styles.active : ''} 
                                onClick={() => setSettings({...settings, wristbandPrinter: {...settings.wristbandPrinter, connection: 'WEBUSB'}})}
                            >WebUSB (Directo)</button>
                            <button 
                                className={settings.wristbandPrinter.connection === 'NETWORK' ? styles.active : ''} 
                                onClick={() => setSettings({...settings, wristbandPrinter: {...settings.wristbandPrinter, connection: 'NETWORK'}})}
                            >Red (IP)</button>
                        </div>

                        {settings.wristbandPrinter.connection === 'NETWORK' && (
                            <div style={{ marginTop: '1rem' }}>
                                <label>Dirección IP de la Impresora</label>
                                <input 
                                    type="text" 
                                    placeholder="192.168.1.50"
                                    value={settings.wristbandPrinter.address}
                                    onChange={e => setSettings({...settings, wristbandPrinter: {...settings.wristbandPrinter, address: e.target.value}})}
                                />
                            </div>
                        )}

                        <button className={styles.testBtn} onClick={() => handleTestPrint('WRISTBAND')}>
                           <FontAwesomeIcon icon={faSync} /> Probar Pulsera
                        </button>
                    </div>
                </div>
            </div>

            <div className={styles.footer}>
                <div className={styles.switches}>
                    <label className={styles.switchLabel}>
                        <input type="checkbox" checked={settings.autoPrintTickets} onChange={e => setSettings({...settings, autoPrintTickets: e.target.checked})} />
                        Impresión automática de Recibos
                    </label>
                    <label className={styles.switchLabel}>
                        <input type="checkbox" checked={settings.autoPrintWristbands} onChange={e => setSettings({...settings, autoPrintWristbands: e.target.checked})} />
                        Impresión automática de Pulseras
                    </label>
                </div>
                <button className={styles.saveBtn} onClick={handleSave} disabled={isSaving}>
                    <FontAwesomeIcon icon={isSaving ? faSync : faSave} spin={isSaving} /> {isSaving ? 'Guardando...' : 'Guardar Configuración'}
                </button>
            </div>
        </div>
    );
};
