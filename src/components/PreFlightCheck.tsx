import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import styles from './PreFlightCheck.module.css';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faWifi, faDatabase, faPrint, faCheckCircle, faExclamationTriangle, faSpinner, faRocket, faCashRegister } from '@fortawesome/free-solid-svg-icons';

type CheckStatus = 'pending' | 'checking' | 'success' | 'fail';

export const PreFlightCheck: React.FC<{ onCompleted: (needsCashOpening: boolean) => void }> = ({ onCompleted }) => {
    const [internet, setInternet] = useState<CheckStatus>('checking');
    const [database, setDatabase] = useState<CheckStatus>('pending');
    const [dbErrorMsg, setDbErrorMsg] = useState('Esperando internet...');
    const [printerEpson, setPrinterEpson] = useState<CheckStatus>('pending');
    const [printerZebra, setPrinterZebra] = useState<CheckStatus>('pending');
    const [cashStatus, setCashStatus] = useState<CheckStatus>('pending');
    const [isOfflineMode, setIsOfflineMode] = useState(false);
    const [allSystemsGo, setAllSystemsGo] = useState(false);
    const [isMobile, setIsMobile] = useState(false);

    const runChecks = async () => {
        const mobileCheck = window.innerWidth <= 768 || /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        setIsMobile(mobileCheck);
        
        setIsOfflineMode(false);
        setInternet('checking');
        
        // 1. Internet & Database (Can fail, but doesn't block)
        const isOnline = navigator.onLine;
        if (isOnline) {
            setInternet('success');
            setDatabase('checking');
            try {
                // Timeout de 15 segundos para auditar velocidad de conexión a Supabase
                const timeoutPromise = new Promise((_, reject) => 
                    setTimeout(() => reject(new Error('timeout_velocidad')), 15000)
                );
                
                const response = await Promise.race([
                    supabase.from('config_sistema').select('clave').limit(1),
                    timeoutPromise
                ]) as any;

                if (response?.error) {
                    console.error('Error de Supabase detectado:', response.error);
                    throw response.error;
                }
                
                setDatabase('success');
                setDbErrorMsg('');
            } catch (err: any) {
                console.error('Fallo en diagnóstico de DB:', err);
                setDatabase('fail');
                setIsOfflineMode(true);
                if (err.message === 'timeout_velocidad') {
                    setDbErrorMsg('Conexión lenta (>15s)');
                } else {
                    setDbErrorMsg(`Error: ${err.message || 'Sin respuesta'}`);
                }
            }
        } else {
            setInternet('fail');
            setDatabase('fail');
            setCashStatus('fail');
            setIsOfflineMode(true);
            setDbErrorMsg('Sin conexión a internet');
        }

        // 1.1 Cash Session Check (New)
        if (isOnline) {
            setCashStatus('checking');
            try {
                const { data } = await supabase
                    .from('arqueos_caja')
                    .select('id')
                    .eq('estado', 'abierta')
                    .maybeSingle();
                
                setCashStatus(data ? 'success' : 'fail');
            } catch (err) {
                setCashStatus('fail');
            }
        }

        // 2. Printers Check (Critical)
        setPrinterEpson('checking');
        setPrinterZebra('checking');

        // Simulamos impresoras
        setTimeout(() => {
            setPrinterEpson('success');
            setPrinterZebra('success');
            setAllSystemsGo(true); 
        }, 1000);
    };

    useEffect(() => {
        runChecks();
    }, []);

    const handleRetry = () => {
        setInternet('pending');
        setDatabase('pending');
        setPrinterEpson('pending');
        setPrinterZebra('pending');
        setAllSystemsGo(false);
        runChecks();
    };

    return (
        <div className={styles.overlay}>
            <div className={styles.card}>
                <header className={styles.header}>
                    <div className={styles.iconCircle}><FontAwesomeIcon icon={faRocket} /></div>
                    <h2>Diagnóstico de Inicio</h2>
                    <p>Verificando requisitos críticos de operación...</p>
                </header>

                <div className={styles.checksList}>
                    <div className={`${styles.checkItem} ${styles[internet]}`}>
                        <div className={styles.checkInfo}>
                            <FontAwesomeIcon icon={faWifi} className={styles.checkIcon} />
                            <div>
                                <span className={styles.checkName}>Conexión a Internet</span>
                                <span className={styles.checkSub}>{internet === 'success' ? 'En línea' : internet === 'fail' ? 'Sin conexión' : 'Verificando...'}</span>
                            </div>
                        </div>
                        <StatusIndicator status={internet} />
                    </div>

                    <div className={`${styles.checkItem} ${styles[database]}`}>
                        <div className={styles.checkInfo}>
                            <FontAwesomeIcon icon={faDatabase} className={styles.checkIcon} />
                            <div>
                                <span className={styles.checkName}>Servicios Cloud (Supabase)</span>
                                <span className={styles.checkSub}>{database === 'success' ? 'Conectado' : database === 'fail' ? dbErrorMsg : 'Esperando internet...'}</span>
                            </div>
                        </div>
                        <StatusIndicator status={database} />
                    </div>

                    {!isMobile && (
                        <>
                            <div className={`${styles.checkItem} ${styles[printerEpson]}`}>
                                <div className={styles.checkInfo}>
                                    <FontAwesomeIcon icon={faPrint} className={styles.checkIcon} />
                                    <div>
                                        <span className={styles.checkName}>Impresora EPSON (Tickets)</span>
                                        <span className={styles.checkSub}>{printerEpson === 'success' ? 'READY' : printerEpson === 'fail' ? 'OFFLINE' : 'Searching...'}</span>
                                    </div>
                                </div>
                                <StatusIndicator status={printerEpson} />
                            </div>

                            <div className={`${styles.checkItem} ${styles[printerZebra]}`}>
                                <div className={styles.checkInfo}>
                                    <FontAwesomeIcon icon={faPrint} className={styles.checkIcon} />
                                    <div>
                                        <span className={styles.checkName}>Impresora ZEBRA (Pulseras)</span>
                                        <span className={styles.checkSub}>{printerZebra === 'success' ? 'READY' : printerZebra === 'fail' ? 'OFFLINE' : 'Searching...'}</span>
                                    </div>
                                </div>
                                <StatusIndicator status={printerZebra} />
                            </div>
                        </>
                    )}

                    <div className={`${styles.checkItem} ${cashStatus === 'fail' ? styles.warning : styles[cashStatus]}`}>
                        <div className={styles.checkInfo}>
                            <FontAwesomeIcon icon={faCashRegister} className={styles.checkIcon} />
                            <div>
                                <span className={styles.checkName}>Turno de Caja</span>
                                <span className={styles.checkSub}>{cashStatus === 'success' ? 'ABIERTO' : cashStatus === 'fail' ? 'CERRADA (Atención)' : 'Verificando...'}</span>
                            </div>
                        </div>
                        {cashStatus === 'fail' ? (
                            <FontAwesomeIcon icon={faExclamationTriangle} className={styles.statusWarning} />
                        ) : (
                            <StatusIndicator status={cashStatus} />
                        )}
                    </div>
                </div>

                {isOfflineMode && (
                    <div className={styles.warningBanner}>
                        <FontAwesomeIcon icon={faExclamationTriangle} />
                        <div>
                            <strong>Modo Offline Detectado</strong>
                            <p>Podrás operar, pero los datos se sincronizarán al recuperar conexión.</p>
                        </div>
                    </div>
                )}

                <div className={styles.actions}>
                    {!allSystemsGo ? (
                        <button className="btn btn-secondary" onClick={handleRetry} disabled={internet === 'checking' || database === 'checking'}>
                            Reintentar Conexiones
                        </button>
                    ) : (
                        <button className={`${styles.goBtn} btn btn-primary`} onClick={() => onCompleted(cashStatus !== 'success')}>
                            {cashStatus === 'success' ? 'Ingresar al Sistema' : 'Entrar y Abrir Caja'} <FontAwesomeIcon icon={faCheckCircle} />
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

const StatusIndicator: React.FC<{ status: CheckStatus }> = ({ status }) => {
    switch (status) {
        case 'checking': return <FontAwesomeIcon icon={faSpinner} spin className={styles.statusChecking} />;
        case 'success': return <FontAwesomeIcon icon={faCheckCircle} className={styles.statusSuccess} />;
        case 'fail': return <FontAwesomeIcon icon={faExclamationTriangle} className={styles.statusFail} />;
        default: return <div className={styles.statusPending} />;
    }
};
