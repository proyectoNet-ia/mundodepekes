import React, { useState, useEffect } from 'react';
import styles from './SalesEngine.module.css';
import { omniSearch, registerFullEntry, type SearchResult } from '../../lib/salesService';
import { getPackages, type Package } from '../../lib/packageService';
import { stockService, type StockItem } from '../../lib/stockService';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSearch, faUserPlus, faChild, faCreditCard, faMoneyBillWave, faLock, faCheckCircle, faSpinner, faPhone, faExclamationTriangle, faTicketAlt } from '@fortawesome/free-solid-svg-icons';
import { getActiveSession, openCash } from '../../lib/treasuryService';
import { PrinterService } from '../../lib/printerService';
import { type UserProfile } from '../../lib/authService';
import { useToast } from '../../components/Toast';
import { StatusModal } from '../../components/StatusModal';
import { getActiveSessions, type ActiveSession } from '../../lib/sessionService';
import { PINModal } from '../../components/PINModal';

// Types
type SalesStep = 'BUSQUEDA' | 'CLIENTE' | 'NINO' | 'PAQUETE' | 'ACCESORIOS' | 'PAGO';

const formatMoney = (val: string) => {
    const clean = val.replace(/\D/g, '');
    if (!clean) return '';
    return new Intl.NumberFormat('es-MX').format(parseInt(clean));
};

const getNumericAmount = (val: string) => {
    return Number(val.replace(/,/g, '')) || 0;
};

interface CustomerData {
  phone: string;
  name: string;
  email: string;
  visitsCount: number;
  children?: { id: string; name: string; age: number; observations: string; isAlreadyInside?: boolean }[]; // Added children
}

interface ChildData {
  name: string;
  age: number;
  included: boolean;
  observations?: string;
  id?: string;
  isAlreadyInside?: boolean;
  enListaNegra?: boolean;
}

interface SelectedAcc {
    id: string;
    name: string;
    price: number;
    qty: number;
}

interface SalesEngineProps {
  user: UserProfile | null;
  reentryData?: any;
  onComplete?: () => void;
  onCancel?: () => void;
}

export const SalesEngine: React.FC<SalesEngineProps> = ({ reentryData, onComplete, onCancel }) => {
  const { showToast } = useToast();
  const [currentStep, setCurrentStep] = useState<SalesStep>('BUSQUEDA');
  
  const [customer, setCustomer] = useState<CustomerData>({ phone: '', name: '', email: '', visitsCount: 0 });
  const [children, setChildren] = useState<ChildData[]>([{ name: '', age: 0, included: true }]);
  const [childPackages, setChildPackages] = useState<Record<number, string>>({});
  const [availablePackages, setAvailablePackages] = useState<Package[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [lastTransaction, setLastTransaction] = useState<any>(null);
  const [availableAccessories, setAvailableAccessories] = useState<StockItem[]>([]);
  const [selectedAccessories, setSelectedAccessories] = useState<SelectedAcc[]>([]);
  const [isCashOpen, setIsCashOpen] = useState<boolean | null>(null);
  const [cashAmount, setCashAmount] = useState<string>('');
  const [openingAmount, setOpeningAmount] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<'efectivo' | 'tarjeta'>('efectivo');
  const [selectedAreas, setSelectedAreas] = useState<Record<number, string>>({});
  const [showPinModal, setShowPinModal] = useState(false);
  const [isAuthorizedOverride, setIsAuthorizedOverride] = useState(false);

  const handleOpenCash = async () => {
    const monto = getNumericAmount(openingAmount);
    if (!openingAmount || isNaN(monto)) return showToast('Ingrese un monto válido', 'warning');
    
    setIsLoading(true);
    try {
        await openCash(monto);
        setIsCashOpen(true);
        showToast('Caja abierta con éxito. ¡Buenas ventas!', 'success');
    } catch (error) {
        showToast('Error al abrir la caja desde ventas.', 'error');
    } finally {
        setIsLoading(true);
        // Recargar datos para asegurar consistencia
        const session = await getActiveSession();
        setIsCashOpen(!!session);
        setIsLoading(false);
    }
  };

  useEffect(() => {
    const loadInit = async () => {
      try {
        const [pkgs, session, inv] = await Promise.all([
          getPackages(true),
          getActiveSession(),
          stockService.getInventory()
        ]);
        setAvailablePackages(pkgs);
        setIsCashOpen(!!session);
        setAvailableAccessories(inv.filter(i => i.cantidad > 0));

        if (reentryData) {
          setCustomer({
            phone: reentryData.tutorContact || reentryData.clientes?.telefono || reentryData.phone || '',
            name: reentryData.tutorName || reentryData.clientes?.nombre || reentryData.name || '',
            email: reentryData.clientes?.email || '',
            visitsCount: reentryData.visitsCount || reentryData.clientes?.visitas_acumuladas || 0
          });
          setChildren([{ 
            id: reentryData.childId,
            name: reentryData.childName || reentryData.nombre || '', 
            age: reentryData.edad || 0,
            included: true
          }]);
          setCurrentStep('PAQUETE');
        }
      } catch (err) {
        showToast('Error al conectar con los servicios vitales.', 'error', 'Fallo de Red');
      }
    };
    loadInit();
  }, [reentryData]);

  useEffect(() => {
    const timer = setTimeout(async () => {
        if (searchTerm.length >= 1) {
            setIsLoading(true);
            try {
                const results = await omniSearch(searchTerm);
                setSearchResults(results);
            } catch (e) {
                console.error('Error de búsqueda instantánea:', e);
            } finally {
                setIsLoading(false);
            }
        } else {
            setSearchResults(null);
        }
    }, 300); // 300ms debounce

    return () => clearTimeout(timer);
  }, [searchTerm]);

  const handleOmniSearch = (e: React.FormEvent) => {
    e.preventDefault();
  };

  const handleSelectCustomer = async (res: SearchResult) => {
    setCustomer({
        phone: res.phone || '',
        name: res.name || '',
        email: '', 
        visitsCount: res.visitsCount
    });
    
    // Cruce de datos con sesiones activas para bloquear niños ya adentro
    const activeSessions = await getActiveSessions();
    const activeIds = new Set(activeSessions.map((s: ActiveSession) => s.childId));

    if (res.registeredChildren && res.registeredChildren.length > 0) {
        setChildren(res.registeredChildren.map((c: any) => ({
            ...c, 
            included: false, 
            isAlreadyInside: activeIds.has(c.id),
            enListaNegra: c.enListaNegra,
            observations: c.observations
        })));
    } else if (res.type === 'child' && res.childName) {
        const isInside = (res.childId && activeIds.has(res.childId)) ? true : false;
        setChildren([{ 
            id: res.childId,
            name: res.childName, 
            age: 0, 
            included: !isInside && !res.enListaNegra, 
            isAlreadyInside: isInside,
            enListaNegra: res.enListaNegra,
            observations: res.observaciones
        }]);
    } else {
        setChildren([{ name: '', age: 0, included: true }]);
    }

    setSearchResults(null);
    setCurrentStep('NINO');
  };
  
  const activeChildren = children.filter((c: ChildData) => c.included !== false);


  const handleGoToPackages = () => {
      if (activeChildren.length === 0) {
          showToast('Debes marcar al menos un peke para el acceso.', 'warning', 'Ingreso Vacío');
          return;
      }
      if (activeChildren.some((c: ChildData) => !c.name || !c.age)) {
          showToast('Completa el nombre y edad de los pekes marcados.', 'warning', 'Datos Faltantes');
          return;
      }
      
      if (activeChildren.some((c: ChildData) => c.enListaNegra) && !isAuthorizedOverride) {
          setShowPinModal(true);
          return;
      }

      setCurrentStep('PAQUETE');
  };

  const handleAuthorizedSuccess = () => {
    setIsAuthorizedOverride(true);
    showToast('Acceso autorizado por Gerencia.', 'success', 'Autorizado');
    setCurrentStep('PAQUETE');
  };

  const totalAccessories = selectedAccessories.reduce((acc, curr) => acc + (curr.price * curr.qty), 0);
  const packageTotal = activeChildren.reduce((sum, _, idx) => {
      const pkg = availablePackages.find(p => p.id === childPackages[idx]);
      return sum + (pkg?.precio || 0);
  }, 0);
  const total = packageTotal + totalAccessories;

  const handleAccChange = (e: React.MouseEvent, acc: StockItem, delta: number) => {
      e.stopPropagation();
      const existing = selectedAccessories.find(a => a.id === acc.id);
      if (existing) {
          const newQty = existing.qty + delta;
          if (newQty <= 0) {
              setSelectedAccessories(selectedAccessories.filter(a => a.id !== acc.id));
          } else {
              setSelectedAccessories(selectedAccessories.map(a => a.id === acc.id ? { ...a, qty: newQty } : a));
          }
      } else if (delta > 0) {
          setSelectedAccessories([...selectedAccessories, { id: acc.id, name: acc.nombre, price: acc.precio_venta, qty: 1 }]);
      }
  };

  const handleConfirmPayment = async (method: 'efectivo' | 'tarjeta') => {
    setPaymentMethod(method);
    const numericCashAmount = getNumericAmount(cashAmount);
    if (method === 'efectivo' && (!cashAmount || numericCashAmount < total)) {
        showToast('Monto insuficiente para cubrir la venta.', 'error');
        return;
    }

    setIsLoading(true);
    try {
        const registration = await registerFullEntry({
            customer: {
                name: customer.name,
                phone: customer.phone,
                email: customer.email
            },
            children: activeChildren.map((c, i) => {
                const selPkg = availablePackages.find(p => p.id === childPackages[i]);
                return {
                    name: c.name,
                    age: c.age,
                    packageId: childPackages[i],
                    area: selPkg?.area || 'Mundo Pekes',
                    duration: selPkg?.duracion_minutos || 60
                };
            }),
            accessories: selectedAccessories.map(a => ({
                id: a.id,
                name: a.name,
                quantity: a.qty
            })),
            paymentMethod: method,
            total,
            isReentry: !!reentryData,
        } as any);
        setLastTransaction(registration);

        // -- IMPRESIÓN MÚLTIPLE DE TICKETS Y PULSERAS --
        if (registration?.transaction?.children && registration.transaction.children.length > 0) {
            const ticketData = {
                folio: registration.transaction.id.substring(0,8).toUpperCase(),
                cliente: registration.transaction.customer,
                telefono: registration.transaction.phone,
                staffEmail: registration.transaction.usuario_email || 'admin@mundodepekes.com',
                items: registration.transaction.children.map((c: any) => ({
                    nino: c.name,
                    nombre: availablePackages.find((p: any) => p.id === c.package)?.nombre || 'Paquete',
                    precio: availablePackages.find((p: any) => p.id === c.package)?.precio || 0,
                    hora_entrada: new Date(c.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                    hora_salida: new Date(c.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                })),
                accesorios: selectedAccessories.map(a => ({
                    cantidad: a.qty,
                    concepto: a.name,
                    pUnit: a.price,
                    importe: a.qty * a.price
                })),
                subtotal: total / 1.16,
                iva: total - (total / 1.16),
                total: total
            };

            const ticketStr = PrinterService.formatEpsonTicket(ticketData);
            PrinterService.printRaw(ticketStr, 'EPSON'); // Ticket para local
            PrinterService.printRaw(ticketStr, 'EPSON'); // Ticket para cliente

            registration.transaction.children.forEach((c: any) => {
                const zData = {
                    nino: c.name,
                    idPeke: c.name.substring(0,3).toUpperCase() + registration.transaction.id.substring(0,4).toUpperCase(),
                    paquete: availablePackages.find((p: any) => p.id === c.package)?.nombre || 'Paquete',
                    area: c.area,
                    horaEntrada: new Date(c.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                    horaSalida: new Date(c.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                    folio: registration.transaction.id.substring(0,8).toUpperCase()
                };
                PrinterService.printRaw(PrinterService.formatZebraWristband(zData), 'ZEBRA');
            });
        }

        setShowSuccessModal(true);
        showToast('¡Venta registrada y tickets en camino!', 'success', 'Venta Exitosa');
    } catch (e) {
        showToast('Error fatal al registrar la venta.', 'error');
    } finally {
        setIsLoading(false);
    }
  };

  if (isCashOpen === false) {
    return (
        <div className={styles.cashClosedNotice}>
            <div className={styles.lockCard}>
                <div className={styles.lockIconCircle}>
                    <FontAwesomeIcon icon={faLock} />
                </div>
                <h2>Caja Cerrada</h2>
                <p>Para procesar ventas, primero debe iniciar un turno de caja.</p>
                
                <div className={styles.quickOpenForm}>
                    <label>Fondo Inicial en Caja</label>
                    <div className={styles.openInputGroup}>
                        <span>$</span>
                        <input 
                            type="text" 
                            value={openingAmount} 
                            onChange={(e) => setOpeningAmount(formatMoney(e.target.value))}
                            onFocus={(e) => e.target.select()}
                            placeholder="0.00"
                        />
                    </div>
                    <button 
                        className={styles.openCashBtn} 
                        onClick={handleOpenCash}
                        disabled={isLoading}
                    >
                        {isLoading ? <FontAwesomeIcon icon={faSpinner} spin /> : 'Abrir Turno Ahora'}
                    </button>
                    <button className={styles.secondaryNavBtn} onClick={onCancel}>
                        Volver al Dashboard
                    </button>
                </div>
            </div>
        </div>
    );
  }

  return (
    <div className={styles.engineContainer}>
        <div className={styles.engineHeader}>
            <div className={styles.brand}>
                <span className={styles.logo}><FontAwesomeIcon icon={faTicketAlt} /></span>
                <h2>INGRESOS</h2>
            </div>
            <div className={styles.stepper}>
                {['BUSQUEDA', 'CLIENTE', 'NINO', 'PAQUETE', 'ACCESORIOS', 'PAGO'].map((step, i) => (
                    <div key={step} className={`${styles.stepIndicator} ${currentStep === step ? styles.active : ''}`}>
                        <div className={styles.dot} />
                        <span>PASO {i+1}</span>
                    </div>
                ))}
            </div>
            <button className="btn btn-ghost" onClick={onCancel}>Cerrar</button>
        </div>

        <main className={styles.engineMain}>
            <div className={styles.stepContent}>
                {currentStep === 'BUSQUEDA' && (
                    <div className={styles.fadeSlide}>
                        <div className={styles.stepHeader}>
                            <h2>Busque Cliente o Inicie Registro</h2>
                            <button className={styles.newRegButton} onClick={() => setCurrentStep('CLIENTE')}>
                                <FontAwesomeIcon icon={faUserPlus} /> Nuevo Registro
                            </button>
                        </div>
                        <form onSubmit={handleOmniSearch} className={styles.searchForm}>
                            <div className={styles.inputGroup}>
                                <FontAwesomeIcon icon={faSearch} className={styles.inputIcon} />
                                <input type="text" placeholder="Teléfono, Nombre o Folio..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} autoFocus />
                                <button type="submit" className="btn btn-primary" disabled={isLoading}>{isLoading ? <FontAwesomeIcon icon={faSpinner} spin /> : 'Buscar'}</button>
                            </div>
                        </form>

                        {searchResults && (
                            <div className={styles.resultsList}>
                                {searchResults.map(res => (
                                    <div 
                                        key={res.id} 
                                        className={styles.resultItem} 
                                        onClick={() => handleSelectCustomer(res)}
                                        tabIndex={0}
                                        onKeyDown={(e) => e.key === 'Enter' && handleSelectCustomer(res)}
                                    >
                                        <div className={styles.resInfo}>
                                            <strong>{res.childName || res.name}</strong>
                                            <span className={styles.phoneBadge}>
                                                <FontAwesomeIcon icon={faPhone} style={{ opacity: 0.6 }} /> 
                                                {res.phone || 'Sin WhatsApp'}
                                            </span>
                                        </div>
                                        <div className={styles.resStats}>
                                            <span className={styles.visits}>{res.visitsCount} Visitas</span>
                                            {res.enListaNegra && <span className={styles.blacklist}>LISTA NEGRA</span>}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                    </div>
                )}

                {currentStep === 'CLIENTE' && (
                    <div className={styles.fadeSlide}>
                        <div className={styles.premiumFormCard}>
                            <div className={styles.formHeader}>
                                <div className={styles.formHeaderIcon}>
                                    <FontAwesomeIcon icon={faUserPlus} />
                                </div>
                                <div>
                                    <h3>Información del Tutor</h3>
                                    <p>Persona responsable y contacto de emergencia</p>
                                </div>
                            </div>
                            
                            <div className={styles.formGrid}>
                                <div className={styles.inputWrapper}>
                                    <label>Nombre Completo</label>
                                    <input type="text" value={customer.name} onChange={(e) => setCustomer({...customer, name: e.target.value})} placeholder="Ej. Ana García" autoFocus />
                                </div>
                                <div className={styles.inputWrapper}>
                                    <label>WhatsApp / Teléfono</label>
                                    <input 
                                        type="tel" 
                                        value={
                                            customer.phone.replace(/\D/g, '').length <= 3 
                                                ? customer.phone 
                                                : customer.phone.replace(/\D/g, '').length <= 6 
                                                    ? `(${customer.phone.replace(/\D/g, '').substring(0,3)}) ${customer.phone.replace(/\D/g, '').substring(3)}` 
                                                    : `(${customer.phone.replace(/\D/g, '').substring(0,3)}) ${customer.phone.replace(/\D/g, '').substring(3,6)}-${customer.phone.replace(/\D/g, '').substring(6,10)}`
                                        } 
                                        onChange={(e) => {
                                            const raw = e.target.value.replace(/\D/g, '').substring(0, 10);
                                            setCustomer({...customer, phone: raw});
                                        }} 
                                        placeholder="(000) 000-0000" 
                                    />
                                </div>
                            </div>

                            <div className={styles.navigationButtons}>
                                <button className="btn btn-ghost" onClick={() => setCurrentStep('BUSQUEDA')}>Cancelar</button>
                                <button className="btn btn-primary" onClick={() => setCurrentStep('NINO')} disabled={!customer.name || customer.phone.length < 10}>Continuar</button>
                            </div>
                        </div>
                    </div>
                )}

                {currentStep === 'NINO' && (
                    <div className={styles.fadeSlide}>
                        <div className={styles.premiumFormCard}>
                            <div className={styles.formHeader}>
                                <div className={styles.formHeaderIcon}>
                                    <FontAwesomeIcon icon={faChild} />
                                </div>
                                <div>
                                    <h3>Registro de Pekes</h3>
                                    <p>¿Quiénes ingresan a jugar hoy?</p>
                                </div>
                            </div>

                            {children.map((child, idx) => (
                                <div key={idx} className={`
                                    ${styles.childRow} 
                                    ${child.included === false ? styles.childRowExcluded : ''}
                                    ${child.enListaNegra ? styles.childBlacklistRow : ''}
                                `}>
                                    <div className={styles.childToggleWrapper}>
                                        <label 
                                            className={`
                                                ${styles.toggleCheckboxLabel} 
                                                ${(child.isAlreadyInside || child.enListaNegra) ? styles.checkboxDisabled : ''}
                                            `} 
                                            title={child.isAlreadyInside ? "Este peke ya tiene una sesión activa" : child.enListaNegra ? "Bloqueado por Lista Negra" : "Marcar para incluir"}
                                        >
                                            <input 
                                                type="checkbox" 
                                                checked={child.included} 
                                                disabled={child.isAlreadyInside || child.enListaNegra}
                                                onChange={() => setChildren(children.map((c, i) => i === idx ? {...c, included: !c.included} : c))} 
                                            />
                                        </label>
                                    </div>
                                    <div className={styles.inputWrapper}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <label>Nombre del Peke</label>
                                            {child.isAlreadyInside && (
                                                <div className={styles.activeUserBadge}>
                                                    <FontAwesomeIcon icon={faExclamationTriangle} />
                                                    USUARIO ACTIVO
                                                </div>
                                            )}
                                            {child.enListaNegra && (
                                                <div className={styles.blacklistBadge}>
                                                    <FontAwesomeIcon icon={faLock} />
                                                    LISTA NEGRA
                                                </div>
                                            )}
                                        </div>
                                        <input type="text" value={child.name} onChange={(e) => { const n = [...children]; n[idx].name = e.target.value; setChildren(n); }} placeholder="Ej. Luisito" disabled={child.included === false} autoFocus={idx === 0} required />
                                        
                                        {child.enListaNegra && child.observations && (
                                            <div className={styles.blacklistReason}>
                                                <strong>Motivo:</strong> {child.observations}
                                            </div>
                                        )}
                                    </div>
                                    <div className={styles.inputWrapper} style={{ width: '80px' }}>
                                        <label>Edad</label>
                                        <input type="number" value={child.age || ''} onChange={(e) => { const n = [...children]; n[idx].age = Number(e.target.value); setChildren(n); }} placeholder="Años" min={1} max={15} disabled={child.included === false} required />
                                    </div>
                                </div>
                            ))}

                            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '2rem' }}>
                                <button className="btn btn-secondary" onClick={() => setChildren([...children, { name: '', age: 0, included: true }])}>
                                    <FontAwesomeIcon icon={faChild} /> + Añadir Nuevo
                                </button>
                            </div>

                            <div className={styles.navigationButtons}>
                                <button className={styles.btnCancel} onClick={() => setCurrentStep('BUSQUEDA')}>Cancelar</button>
                                <button className="btn btn-ghost" onClick={() => setCurrentStep('CLIENTE')}>Atrás</button>
                                <button className="btn btn-primary" onClick={handleGoToPackages}>Elegir Tiempo</button>
                            </div>
                        </div>
                    </div>
                )}

                {currentStep === 'PAQUETE' && (
                    <div className={styles.fadeSlide}>
                        <h3>Seleccione el Tiempo por Peke</h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                            {activeChildren.map((child, idx) => {
                                const areas = Array.from(new Set(availablePackages.map(p => p.area)));
                                const currentArea = selectedAreas[idx] || (areas.length > 0 ? areas[0] : '');
                                const filteredPackages = availablePackages.filter(p => p.area === currentArea);

                                return (
                                <div key={idx} style={{ background: '#f8fafc', padding: '1.5rem', borderRadius: '1rem', border: '1px solid #e2e8f0' }}>
                                    <h4 style={{ 
                                        marginBottom: '1.5rem', 
                                        color: '#334155', 
                                        fontSize: '1.4rem', 
                                        letterSpacing: '-0.5px'
                                    }}>
                                        <FontAwesomeIcon icon={faChild} style={{ color: 'var(--brand-500)', marginRight: '0.75rem' }} /> 
                                        <span style={{fontWeight: '300'}}>Paquete para </span>
                                        <span style={{ color: 'var(--brand-600)', fontWeight: '900', textTransform: 'uppercase' }}>{child.name || `Peke ${idx+1}`}</span>
                                    </h4>

                                    {/* Selector de Áreas (Tabs) */}
                                    <div className={styles.areaTabs}>
                                        {areas.map(area => (
                                            <button 
                                                key={area}
                                                className={`${styles.areaTab} ${currentArea === area ? styles.areaTabActive : ''}`}
                                                onClick={() => setSelectedAreas({ ...selectedAreas, [idx]: area })}
                                            >
                                                {area.toUpperCase()}
                                            </button>
                                        ))}
                                    </div>

                                    <div className={styles.packageGrid}>
                                        {filteredPackages.map(pkg => (
                                            <div 
                                                key={pkg.id} 
                                                className={`${styles.packageCard} ${childPackages[idx] === pkg.id ? styles.packageSelected : ''}`} 
                                                onClick={() => setChildPackages({...childPackages, [idx]: pkg.id})}
                                                tabIndex={0}
                                                onKeyDown={(e) => e.key === 'Enter' && setChildPackages({...childPackages, [idx]: pkg.id})}
                                            >
                                                <div className={styles.pkgHeader}><FontAwesomeIcon icon={faChild} /><span className={styles.pkgPrice}>${pkg.precio}.00</span></div>
                                                <span style={{fontWeight: '800', color: '#0f172a', display: 'block', marginBottom: '0.25rem'}}>{pkg.nombre}</span>
                                                <span style={{fontSize:'0.85rem', color:'#64748b'}}>{pkg.duracion_minutos} min</span>
                                            </div>
                                        ))}
                                    </div>
                                    {filteredPackages.length === 0 && (
                                        <p style={{textAlign: 'center', color: '#94a3b8', padding: '1rem'}}>
                                            No hay paquetes disponibles en esta zona.
                                        </p>
                                    )}
                                </div>
                                );
                            })}
                        </div>
                        <div className={styles.navigationButtons}>
                            <button className={styles.btnCancel} onClick={() => setCurrentStep('BUSQUEDA')}>Cancelar</button>
                            <button className="btn btn-ghost" onClick={() => setCurrentStep('NINO')}>Atrás</button>
                            <button className="btn btn-primary" onClick={() => setCurrentStep('ACCESORIOS')} disabled={activeChildren.some((_, i) => !childPackages[i])}>Siguiente</button>
                        </div>
                    </div>
                )}

                {currentStep === 'ACCESORIOS' && (
                    <div className={styles.fadeSlide}>
                        <h3>Accesorios Adicionales</h3>
                        <div className={styles.accessoryGrid}>
                            {availableAccessories.map(acc => {
                                const existing = selectedAccessories.find(a => a.id === acc.id);
                                const qty = existing?.qty || 0;
                                return (
                                <div 
                                    key={acc.id} 
                                    className={`${styles.accessoryCard} ${qty > 0 ? styles.accessorySelected : ''}`} 
                                    onClick={(e) => qty === 0 && handleAccChange(e, acc, 1)}
                                    tabIndex={0}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                            if (qty === 0) handleAccChange(e as any, acc, 1);
                                            else handleAccChange(e as any, acc, -1);
                                        }
                                    }}
                                >
                                    <div className={styles.pkgHeader} style={{ marginBottom: 0 }}>
                                        <span>📦 {acc.nombre}</span>
                                        <strong>${acc.precio_venta}.00</strong>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <small style={{ color: '#64748b' }}>{acc.cantidad} en stock</small>
                                        <div className={styles.qtyControlWidget}>
                                            <button 
                                                className={styles.qtyBtn} 
                                                onClick={(e) => handleAccChange(e, acc, -1)}
                                                disabled={qty === 0}
                                                tabIndex={-1} // Los botones secundarios no estorban el TAB general
                                            >-</button>
                                            <span className={styles.qtyValue}>{qty}</span>
                                            <button 
                                                className={styles.qtyBtn} 
                                                onClick={(e) => handleAccChange(e, acc, 1)}
                                                disabled={qty >= acc.cantidad}
                                                tabIndex={-1}
                                            >+</button>
                                        </div>
                                    </div>
                                </div>
                            )})}
                        </div>
                        <div className={styles.navigationButtons}>
                            <button className={styles.btnCancel} onClick={() => setCurrentStep('BUSQUEDA')}>Cancelar</button>
                            <button className="btn btn-ghost" onClick={() => setCurrentStep('PAQUETE')}>Atrás</button>
                            <button className="btn btn-primary" onClick={() => setCurrentStep('PAGO')}>Ir al Pago</button>
                        </div>
                    </div>
                )}

                {currentStep === 'PAGO' && (
                    <div className={styles.fadeSlide}>
                        <div className={styles.premiumFormCard}>
                            <div className={styles.formHeader}>
                                <div className={styles.formHeaderIcon}>
                                    <FontAwesomeIcon icon={faCreditCard} />
                                </div>
                                <div>
                                    <h3>Confirmación de Cobro</h3>
                                    <p>Revise el resumen y seleccione el método de pago</p>
                                </div>
                            </div>

                            <div className={styles.paymentSummary}>
                                {activeChildren.map((c, i) => {
                                    const pkg = availablePackages.find(p => p.id === childPackages[i]);
                                    return (
                                        <div key={i} className={styles.summaryRow}>
                                            <span>Pase {pkg?.nombre || 'Paquete'} - {c.name || `Peke ${i+1}`}</span>
                                            <strong>${pkg?.precio || 0}.00</strong>
                                        </div>
                                    );
                                })}
                                {selectedAccessories.map(a => (
                                    <div key={a.id} className={styles.summaryRow}>
                                        <span>{a.name} (x{a.qty})</span>
                                        <strong>${a.price * a.qty}.00</strong>
                                    </div>
                                ))}
                                <div className={`${styles.summaryRow} ${styles.totalRow}`}>
                                    <span>TOTAL A COBRAR</span>
                                    <span>${total}.00</span>
                                </div>
                            </div>

                            <div className={styles.paymentGrid}>
                                <button 
                                    className={`${styles.paymentBtn} ${paymentMethod === 'efectivo' ? styles.active : ''}`} 
                                    onClick={() => setPaymentMethod('efectivo')}
                                >
                                    <FontAwesomeIcon icon={faMoneyBillWave} />
                                    <span>EFECTIVO</span>
                                </button>
                                <button 
                                    className={`${styles.paymentBtn} ${paymentMethod === 'tarjeta' ? styles.active : ''}`} 
                                    onClick={() => setPaymentMethod('tarjeta')}
                                >
                                    <FontAwesomeIcon icon={faCreditCard} />
                                    <span>TARJETA</span>
                                </button>
                            </div>

                            {paymentMethod === 'efectivo' && (
                                <div className={styles.paymentInputBg}>
                                    <label>¿Con cuánto paga el cliente?</label>
                                    <input 
                                        type="text" 
                                        value={cashAmount} 
                                        onChange={(e) => setCashAmount(formatMoney(e.target.value))} 
                                        onFocus={(e) => e.target.select()}
                                        placeholder={`Ej. ${total + 100}`} 
                                        autoFocus 
                                    />
                                    
                                    {getNumericAmount(cashAmount) >= total && (
                                        <div className={styles.changeBadge}>
                                            <FontAwesomeIcon icon={faCheckCircle} /> 
                                            Cambio a entregar: ${(getNumericAmount(cashAmount) - total).toFixed(2)}
                                        </div>
                                    )}
                                </div>
                            )}

                            <div className={styles.navigationButtons}>
                                <button className={styles.btnCancel} onClick={() => setCurrentStep('BUSQUEDA')} disabled={isLoading}>Cancelar</button>
                                <button className="btn btn-ghost" onClick={() => setCurrentStep('ACCESORIOS')} disabled={isLoading}>Atrás</button>
                                <button className="btn btn-primary" onClick={() => handleConfirmPayment(paymentMethod)} disabled={isLoading}>
                                    {isLoading ? <><FontAwesomeIcon icon={faSpinner} spin /> Procesando...</> : 'Autorizar Pago'}
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </main>

        <StatusModal
            isOpen={showSuccessModal}
            status="success"
            title="¡Venta Exitosa!"
            message="Tickets e insignias generados correctamente."
            onAction={onComplete}
            actionLabel="Finalizar Operación"
        >
            <div className={styles.folioBadge}>
                FOLIO: {
                    (lastTransaction?.transaction?.id?.startsWith('OFFLINE') 
                        ? lastTransaction.transaction.id.substring(0, 15) 
                        : lastTransaction?.transaction?.id?.substring(0, 8))?.toUpperCase() || 'ERROR'
                }
            </div>
        </StatusModal>
        <PINModal 
            isOpen={showPinModal}
            onClose={() => setShowPinModal(false)}
            onSuccess={handleAuthorizedSuccess}
            actionDescription={`Autorización de ingreso para pekes en Lista Negra: ${activeChildren.filter(c => c.enListaNegra).map(c => c.name).join(', ')}`}
            message="Se han detectado pekes en LISTA NEGRA. Para permitir su ingreso, se requiere autorización de un Gerente."
        />
    </div>
  );
};
