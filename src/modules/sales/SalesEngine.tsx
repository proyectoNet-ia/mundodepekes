import React, { useState, useEffect } from 'react';
import styles from './SalesEngine.module.css';
import { omniSearch, registerFullEntry, type SearchResult } from '../../lib/salesService';
import { getPackages, type Package } from '../../lib/packageService';
import { stockService, type StockItem } from '../../lib/stockService';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSearch, faUserPlus, faChild, faCreditCard, faMoneyBillWave, faLock, faSpinner, faPhone, faTicketAlt, faClock, faBirthdayCake } from '@fortawesome/free-solid-svg-icons';
import { faWhatsapp } from '@fortawesome/free-brands-svg-icons';
import { getActiveSession, openCash } from '../../lib/treasuryService';
import { PrinterService } from '../../lib/printerService';
import { type UserProfile } from '../../lib/authService';
import { useToast } from '../../components/Toast';
import { StatusModal } from '../../components/StatusModal';
import { getActiveSessions, consumeScheduledEvent } from '../../lib/sessionService';
import { PINModal } from '../../components/PINModal';
import { supabase } from '../../lib/supabase';

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

const LOWERCASE_WORDS = new Set(['de', 'del', 'la', 'las', 'los', 'el', 'y', 'e', 'o', 'a', 'en']);

const toTitleCase = (str: string): string => {
    return str
        .toLowerCase()
        .split(' ')
        .map((word, index) => {
            if (!word) return word;
            if (index !== 0 && LOWERCASE_WORDS.has(word)) return word;
            return word.split('-').map(part =>
                part.charAt(0).toUpperCase() + part.slice(1)
            ).join('-');
        })
        .join(' ');
};

interface CustomerData {
  id?: string;
  phone: string;
  name: string;
  email: string;
  visitsCount: number;
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

export const SalesEngine: React.FC<SalesEngineProps> = ({ user, reentryData, onComplete, onCancel }) => {
  const { showToast } = useToast();
  const [currentStep, setCurrentStep] = useState<SalesStep>('BUSQUEDA');
  const [customer, setCustomer] = useState<CustomerData>({ phone: '', name: '', email: '', visitsCount: 0 });
  const [children, setChildren] = useState<ChildData[]>([{ name: '', age: 0, included: true }]);
  const [childPackages, setChildPackages] = useState<Record<number, string>>({});
  const [privatePackageId, setPrivatePackageId] = useState('');
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
  const [voucherFolio, setVoucherFolio] = useState('');
  const [openingAmount, setOpeningAmount] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<'efectivo' | 'tarjeta'>('efectivo');
  const [showPinModal, setShowPinModal] = useState(false);
  const [isAuthorizedOverride, setIsAuthorizedOverride] = useState(false);
  const [secondaryPhones, setSecondaryPhones] = useState<string[]>([]);
  const [isNewRegistration, setIsNewRegistration] = useState(false);
  const [guestLimit, setGuestLimit] = useState<number>(15); // Default common limit

  const isPrivateEvent = !!(reentryData?.isPrivateEvent);
  const activeChildren = children.filter((c: ChildData) => c.included !== false && c.name.trim() !== '');

  const handleOpenCash = async () => {
    const monto = getNumericAmount(openingAmount);
    if (!openingAmount || isNaN(monto)) return showToast('Ingrese un monto válido', 'warning');
    setIsLoading(true);
    try {
        await openCash(monto);
        setIsCashOpen(true);
        showToast('Caja abierta con éxito.', 'success');
    } catch (error) {
        showToast('Error al abrir la caja.', 'error');
    } finally {
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
          if (reentryData.isPrivateEvent) {
            setCurrentStep('CLIENTE');
            setChildren([{ name: '', age: 0, included: true }]); 
            return;
          }
          setCustomer({
            id: reentryData.tutorId || reentryData.clientes?.id,
            phone: reentryData.tutorContact || reentryData.clientes?.telefono || reentryData.phone || '',
            name: reentryData.tutorName || reentryData.clientes?.nombre || reentryData.name || '',
            email: reentryData.email || reentryData.clientes?.email || '',
            visitsCount: reentryData.visitsCount || reentryData.clientes?.visitas_acumuladas || 0
          });
          if (reentryData.presaleChildren && reentryData.presaleChildren.length > 0) {
            setChildren(reentryData.presaleChildren.map((n: any) => ({
              name: n.nombre || '',
              age: n.edad || 0,
              included: true,
            })));
            const pkgMap: Record<number, string> = {};
            reentryData.presaleChildren.forEach((n: any, i: number) => {
              if (n.paquete_id) pkgMap[i] = n.paquete_id;
            });
            setChildPackages(pkgMap);
            setCurrentStep('PAQUETE');
          } else {
            setChildren([{ 
              id: reentryData.childId,
              name: reentryData.childName || reentryData.nombre || '', 
              age: reentryData.edad || 0,
              included: true
            }]);
            setCurrentStep('PAQUETE');
          }
        }
      } catch (err) {
        showToast('Error al conectar servicios.', 'error');
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
                console.error(e);
            } finally {
                setIsLoading(false);
            }
        } else {
            setSearchResults(null);
        }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const handleSelectCustomer = async (res: SearchResult) => {
    setCustomer({ id: res.id, phone: res.phone || '', name: res.name || '', email: '', visitsCount: res.visitsCount });
    const activeSessions = await getActiveSessions();
    const activeIds = new Set(activeSessions.map((s) => s.childId));

    if (res.registeredChildren && res.registeredChildren.length > 0) {
        setChildren(res.registeredChildren.map((c: any) => ({
            ...c, included: false, isAlreadyInside: activeIds.has(c.id),
            enListaNegra: c.enListaNegra, observations: c.observations
        })));
    } else if (res.type === 'child' && res.childName) {
        const isInside = res.childId && activeIds.has(res.childId);
        setChildren([{ 
            id: res.childId, name: res.childName, age: 0, 
            included: !isInside && !res.enListaNegra, isAlreadyInside: !!isInside,
            enListaNegra: res.enListaNegra, observations: res.observaciones
        }]);
    } else {
        setChildren([{ name: '', age: 0, included: true }]);
    }
    setSearchResults(null);
    setSecondaryPhones([]);
    setCurrentStep('NINO');
  };

  const handleCustomerContinue = async () => {
      if (isPrivateEvent) { setCurrentStep('NINO'); return; }
      setIsLoading(true);
      try {
          const cleanPhone = customer.phone.replace(/\D/g, '');
          const cleanSecondary = secondaryPhones.map(p => p.replace(/\D/g, '')).filter(p => p.length >= 10);
          let orQuery = `telefono.ilike.%${cleanPhone}%`;
          cleanSecondary.forEach(sp => { orQuery += `,telefono.ilike.%${sp}%`; });
          const { data, error } = await supabase.from('clientes').select('id, nombre').or(orQuery);
          if (!error && data && data.length > 0) {
              const duplicate = data.find(c => c.id !== customer.id);
              if (duplicate) {
                  showToast(`El teléfono ya pertenece a "${duplicate.nombre}".`, 'warning');
                  setIsLoading(false);
                  return;
              }
          }
          setCurrentStep('NINO');
      } catch (e) {
          showToast('Error de validación.', 'error');
      } finally {
          setIsLoading(false);
      }
  };

  const handleGoToPackages = () => {
    if (activeChildren.length === 0) {
        showToast('Registre al menos un peke para continuar.', 'warning');
        return;
    }
    const blacklisted = activeChildren.filter(c => c.enListaNegra);
    const isAdmin = user?.role === 'admin';
    if (blacklisted.length > 0 && !isAuthorizedOverride && !isAdmin) {
        setShowPinModal(true);
        return;
    }
    setCurrentStep('PAQUETE');
  };

  const handleAuthorizedSuccess = () => {
    setIsAuthorizedOverride(true);
    showToast('Autorizado por Gerencia.', 'success');
    setCurrentStep('PAQUETE');
  };

  const totalAccessories = selectedAccessories.reduce((acc, curr) => acc + (curr.price * curr.qty), 0);
  const privatePkg = isPrivateEvent ? availablePackages.find(p => p.id === privatePackageId) : null;
  const packageTotal = isPrivateEvent ? (privatePkg?.precio || 0) : activeChildren.reduce((sum, _, idx) => {
    const pkg = availablePackages.find(p => p.id === childPackages[idx]);
    return sum + (pkg?.precio || 0);
  }, 0);
  const total = packageTotal + totalAccessories;

  const handleAccChange = (e: React.MouseEvent, acc: StockItem, delta: number) => {
      e.stopPropagation();
      const existing = selectedAccessories.find(a => a.id === acc.id);
      if (existing) {
          const newQty = existing.qty + delta;
          if (newQty <= 0) setSelectedAccessories(selectedAccessories.filter(a => a.id !== acc.id));
          else setSelectedAccessories(selectedAccessories.map(a => a.id === acc.id ? { ...a, qty: newQty } : a));
      } else if (delta > 0) {
          setSelectedAccessories([...selectedAccessories, { id: acc.id, name: acc.nombre, price: acc.precio_venta, qty: 1 }]);
      }
  };

  const handleConfirmPayment = async (method: 'efectivo' | 'tarjeta') => {
    setPaymentMethod(method);
    if (method === 'efectivo' && getNumericAmount(cashAmount) < total) {
        showToast('Monto insuficiente.', 'error');
        return;
    }
    if (method === 'tarjeta' && !voucherFolio.trim()) {
        showToast('Folio del voucher obligatorio.', 'warning');
        return;
    }
    setIsLoading(true);
    try {
        const registration = await registerFullEntry({
            customer: { id: customer.id, name: customer.name, phone: [customer.phone, ...secondaryPhones.filter(p => !!p)].join(', '), email: customer.email },
            children: isPrivateEvent 
                ? activeChildren.map(c => ({ id: c.id, name: c.name, age: c.age, packageId: privatePackageId, area: privatePkg?.area || 'Mundo de Pekes', duration: privatePkg?.duracion_minutos || 60 }))
                : activeChildren.map((c, i) => {
                    const selPkg = availablePackages.find(p => p.id === childPackages[i]);
                    return { id: c.id, name: c.name, age: c.age, packageId: childPackages[i], area: selPkg?.area || 'Mundo de Pekes', duration: selPkg?.duracion_minutos || 60 };
                }),
            accessories: selectedAccessories.map(a => ({ id: a.id, name: a.name, quantity: a.qty })),
            paymentMethod: method, voucherFolio, total, isReentry: !!reentryData, 
            esPrivado: isPrivateEvent, paquete_id: isPrivateEvent ? privatePackageId : null,
            limite_invitados: isPrivateEvent ? guestLimit : null
        } as any);
        
        setLastTransaction(registration);
        setIsNewRegistration(!customer.id);
        setShowSuccessModal(true);
        showToast('¡Venta registrada con éxito!', 'success');

        if (isPrivateEvent) {
            await consumeScheduledEvent();
        }

        if (registration?.transaction?.children) {
            const ticketData = {
                folio: registration.transaction.id.substring(0,8).toUpperCase(),
                cliente: registration.transaction.customer,
                telefono: registration.transaction.phone,
                items: registration.transaction.children.map((c: any) => ({
                    nino: c.name,
                    nombre: availablePackages.find(p => p.id === c.package)?.nombre || 'Paquete',
                    precio: availablePackages.find(p => p.id === c.package)?.precio || 0,
                    duracion: availablePackages.find(p => p.id === c.package)?.duracion_minutos || 0,
                    hora_entrada: new Date(c.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                    hora_salida: new Date(c.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                })),
                accesorios: selectedAccessories.map(a => ({ cantidad: a.qty, concepto: a.name, pUnit: a.price, importe: a.qty * a.price })),
                subtotal: total / 1.16,
                iva: total - (total / 1.16),
                total: total,
                paymentMethod: registration.transaction.metodo_pago
            };
            PrinterService.printRaw(PrinterService.formatEpsonTicket(ticketData as any), 'EPSON');
        }

    } catch (e) {
        showToast('Error fatal al registrar la venta.', 'error');
    } finally {
        setIsLoading(false);
    }
  };

  if (isCashOpen === null) {
      return (
          <div className={styles.engineContainer} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ textAlign: 'center' }}>
                  <FontAwesomeIcon icon={faSpinner} spin size="4x" style={{ color: 'var(--brand-500)', marginBottom: '1.5rem' }} />
                  <h2>Sincronizando Bóveda...</h2>
              </div>
          </div>
      );
  }

  if (!isCashOpen) {
    return (
        <div className={styles.cashClosedNotice}>
            <div className={styles.premiumLockCard}>
                <div className={styles.lockIconCircle}><FontAwesomeIcon icon={faLock} /></div>
                <h2>Caja Cerrada</h2>
                <div className={styles.quickOpenForm}>
                    <label>FONDO INICIAL</label>
                    <input type="text" value={openingAmount} onChange={(e) => setOpeningAmount(formatMoney(e.target.value))} placeholder="0.00" />
                    <button className={styles.openCashBtn} onClick={handleOpenCash}>Abrir Turno</button>
                    <button className={styles.secondaryNavBtn} onClick={onCancel}>Volver</button>
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
                <h2>{isPrivateEvent ? 'EVENTO PRIVADO' : 'NUEVO INGRESO'}</h2>
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
                        <div className={styles.searchForm}>
                            <div className={styles.inputGroup}>
                                <FontAwesomeIcon icon={faSearch} className={styles.inputIcon} />
                                <input type="text" placeholder="Teléfono, Nombre..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} autoFocus />
                            </div>
                        </div>
                        {searchResults && (
                            <div className={styles.resultsList}>
                                {searchResults.map(res => (
                                    <div key={res.id} className={styles.resultItem} onClick={() => handleSelectCustomer(res)}>
                                        <div className={styles.resInfo}>
                                            <strong>{res.childName || res.name}</strong>
                                            <span className={styles.phoneBadge}><FontAwesomeIcon icon={faPhone} /> {res.phone || 'Sin WhatsApp'}</span>
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
                                <div className={styles.formHeaderIcon}><FontAwesomeIcon icon={faUserPlus} /></div>
                                <div><h3>Información del Tutor</h3><p>Persona responsable y contacto de emergencia</p></div>
                            </div>
                            <div className={styles.formGrid}>
                                <div className={styles.inputWrapper}>
                                    <label>Nombre Completo</label>
                                    <input type="text" value={customer.name} onChange={(e) => setCustomer({...customer, name: toTitleCase(e.target.value)})} placeholder="Ej. Ana García" autoFocus />
                                </div>
                                <div className={styles.inputWrapper}>
                                    <label>WhatsApp Principal</label>
                                    <input 
                                        type="tel" 
                                        value={
                                            customer.phone.replace(/\D/g, '').length <= 3 
                                                ? customer.phone 
                                                : customer.phone.replace(/\D/g, '').length <= 6 
                                                    ? `(${customer.phone.replace(/\D/g, '').substring(0,3)}) ${customer.phone.replace(/\D/g, '').substring(3)}` 
                                                    : `(${customer.phone.replace(/\D/g, '').substring(0,3)}) ${customer.phone.replace(/\D/g, '').substring(3,6)}-${customer.phone.replace(/\D/g, '').substring(6,10)}`
                                        } 
                                        onChange={(e) => setCustomer({...customer, phone: e.target.value.replace(/\D/g, '').substring(0, 10)})} 
                                        placeholder="(000) 000-0000" 
                                    />
                                </div>
                            </div>
                            <div className={styles.navigationButtons}>
                                <button className="btn btn-ghost" onClick={() => setCurrentStep('BUSQUEDA')}>Cancelar</button>
                                <button className="btn btn-primary" onClick={handleCustomerContinue} disabled={!customer.name || (customer.phone.length < 10 && !isPrivateEvent) || isLoading}>Continuar</button>
                            </div>
                        </div>
                    </div>
                )}

                {currentStep === 'NINO' && (
                    <div className={styles.fadeSlide}>
                        <div className={styles.premiumFormCard}>
                            <div className={styles.formHeader}>
                                <div className={styles.formHeaderIcon}><FontAwesomeIcon icon={faChild} /></div>
                                <div><h3>Registro de Pekes</h3><p>¿Quiénes ingresan hoy?</p></div>
                            </div>
                            {children.map((child, idx) => (
                                <div key={idx} className={`${styles.childRow} ${child.included === false ? styles.childRowExcluded : ''}`}>
                                    <div className={styles.childToggleWrapper}>
                                        <input type="checkbox" checked={child.included} disabled={child.isAlreadyInside || child.enListaNegra} onChange={() => setChildren(children.map((c, i) => i === idx ? {...c, included: !c.included} : c))} />
                                    </div>
                                    <div className={styles.inputWrapper} style={{ flex: 1 }}>
                                        <label>Nombre del Peke</label>
                                        <input type="text" value={child.name} onChange={(e) => { const n = [...children]; n[idx].name = toTitleCase(e.target.value); setChildren(n); }} placeholder="Luisito" disabled={child.included === false} />
                                    </div>
                                    {!isPrivateEvent && (
                                        <div className={styles.inputWrapper} style={{ width: '80px' }}>
                                            <label>Edad</label>
                                            <input type="number" value={child.age || ''} onChange={(e) => { const n = [...children]; n[idx].age = Number(e.target.value); setChildren(n); }} placeholder="Edad" disabled={child.included === false} />
                                        </div>
                                    )}
                                </div>
                            ))}
                            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '2rem' }}>
                                <button className="btn btn-secondary" onClick={() => setChildren([...children, { name: '', age: 0, included: true }])}>
                                    <FontAwesomeIcon icon={faChild} /> + Añadir Peke
                                </button>
                            </div>
                            <div className={styles.navigationButtons}>
                                <button className="btn btn-ghost" onClick={() => setCurrentStep('CLIENTE')}>Atrás</button>
                                <button className="btn btn-primary" onClick={handleGoToPackages} disabled={activeChildren.length === 0}>
                                    Siguiente
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {currentStep === 'PAQUETE' && (
                    <div className={styles.fadeSlide}>
                      {isPrivateEvent ? (
                        <>
                          <div style={{ background: 'linear-gradient(135deg,#d97706,#b45309)', color: 'white', padding: '1rem', borderRadius: '1rem', marginBottom: '1.5rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                             <FontAwesomeIcon icon={faBirthdayCake} /> EVENTO PRIVADO — Tarifa Fija por Evento
                          </div>
                          <div className={styles.packageGrid}>
                            {isPrivateEvent && (
                              <div style={{ gridColumn: '1 / -1', background: '#fffbeb', padding: '1.25rem', borderRadius: '12px', border: '1px solid #fde68a', marginBottom: '1rem' }}>
                                <label style={{ display: 'block', fontWeight: 800, color: '#92400e', marginBottom: '0.5rem', fontSize: '0.9rem' }}>CANTIDAD DE INVITADOS PAGADOS</label>
                                <input 
                                  type="number" 
                                  value={guestLimit} 
                                  onChange={(e) => setGuestLimit(parseInt(e.target.value) || 0)}
                                  style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '2px solid #fbbf24', fontSize: '1.2rem', fontWeight: 800, color: '#92400e', textAlign: 'center' }}
                                  min="1"
                                />
                                <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.75rem', color: '#b45309', textAlign: 'center' }}>El sistema bloqueará el ingreso después del niño #{guestLimit}</p>
                              </div>
                            )}
                            {availablePackages.filter(p => p.es_privado).map(pkg => (
                              <div key={pkg.id} className={`${styles.packageCard} ${privatePackageId === pkg.id ? styles.packageSelected : ''}`} onClick={() => setPrivatePackageId(pkg.id)}>
                                <strong>{pkg.nombre}</strong>
                                <span>${pkg.precio}</span>
                                <small><FontAwesomeIcon icon={faClock} /> {pkg.duracion_minutos} min</small>
                              </div>
                            ))}
                          </div>
                        </>
                      ) : (
                        activeChildren.map((child, idx) => (
                          <div key={idx} style={{ marginBottom: '2rem' }}>
                            <h4 style={{ color: 'var(--brand-600)', fontWeight: 900 }}>PAQUETE PARA {child.name}</h4>
                            <div className={styles.packageGrid}>
                              {availablePackages.filter(p => !p.es_privado).map(pkg => (
                                <div key={pkg.id} className={`${styles.packageCard} ${childPackages[idx] === pkg.id ? styles.packageSelected : ''}`} onClick={() => setChildPackages({...childPackages, [idx]: pkg.id})}>
                                  <strong>{pkg.nombre}</strong>
                                  <span>${pkg.precio}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))
                      )}
                      <div className={styles.navigationButtons}>
                        <button className="btn btn-ghost" onClick={() => setCurrentStep('NINO')}>Atrás</button>
                        <button className="btn btn-primary" onClick={() => setCurrentStep('ACCESORIOS')} disabled={isPrivateEvent ? !privatePackageId : activeChildren.some((_, i) => !childPackages[i])}>Siguiente</button>
                      </div>
                    </div>
                )}

                {currentStep === 'ACCESORIOS' && (
                    <div className={styles.fadeSlide}>
                        <h3>Accesorios Adicionales</h3>
                        <div className={styles.accessoryGrid}>
                            {availableAccessories.map(acc => {
                                const qty = selectedAccessories.find(a => a.id === acc.id)?.qty || 0;
                                return (
                                    <div key={acc.id} className={`${styles.accessoryCard} ${qty > 0 ? styles.accessorySelected : ''}`}>
                                        <strong>{acc.nombre}</strong>
                                        <span>${acc.precio_venta}</span>
                                        <div className={styles.qtyControlWidget}>
                                            <button onClick={(e) => handleAccChange(e, acc, -1)}>-</button>
                                            <span>{qty}</span>
                                            <button onClick={(e) => handleAccChange(e, acc, 1)} disabled={qty >= acc.cantidad}>+</button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                        <div className={styles.navigationButtons}>
                            <button className="btn btn-ghost" onClick={() => setCurrentStep('PAQUETE')}>Atrás</button>
                            <button className="btn btn-primary" onClick={() => setCurrentStep('PAGO')}>Ir al Pago</button>
                        </div>
                    </div>
                )}

                {currentStep === 'PAGO' && (
                    <div className={styles.fadeSlide}>
                        <div className={styles.premiumFormCard}>
                            <div className={styles.paymentSummary}>
                                {isPrivateEvent ? (
                                    <div style={{ marginBottom: '1rem', borderBottom: '1px solid #e2e8f0', paddingBottom: '1rem' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                                            <span style={{ color: '#64748b' }}>Contratante:</span>
                                            <strong style={{ color: '#1e293b' }}>{customer.name}</strong>
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                                            <span style={{ color: '#64748b' }}>Evento:</span>
                                            <strong style={{ color: '#d97706' }}>{privatePkg?.nombre}</strong>
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                            <span style={{ color: '#64748b' }}>Niños registrados:</span>
                                            <strong style={{ color: '#1e293b' }}>{activeChildren.length}</strong>
                                        </div>
                                    </div>
                                ) : (
                                    <div style={{ marginBottom: '1rem', borderBottom: '1px solid #e2e8f0', paddingBottom: '1rem' }}>
                                        {activeChildren.map((child, i) => {
                                            const pkg = availablePackages.find(p => p.id === childPackages[i]);
                                            return (
                                                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem', fontSize: '0.9rem' }}>
                                                    <span style={{ color: '#64748b' }}>Peke: {child.name} ({pkg?.nombre})</span>
                                                    <strong style={{ color: '#1e293b' }}>${pkg?.precio || 0}.00</strong>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                                
                                {selectedAccessories.length > 0 && (
                                    <div style={{ marginBottom: '1rem', borderBottom: '1px solid #e2e8f0', paddingBottom: '1rem' }}>
                                        {selectedAccessories.map(a => (
                                            <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem', fontSize: '0.9rem' }}>
                                                <span style={{ color: '#64748b' }}>{a.name} (x{a.qty})</span>
                                                <strong style={{ color: '#1e293b' }}>${a.price * a.qty}.00</strong>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                <div className={styles.totalRow}>
                                    <span>TOTAL A COBRAR</span>
                                    <span>${total}.00</span>
                                </div>
                            </div>
                            <div className={styles.paymentGrid}>
                                <button className={`${styles.paymentBtn} ${paymentMethod === 'efectivo' ? styles.active : ''}`} onClick={() => setPaymentMethod('efectivo')}><FontAwesomeIcon icon={faMoneyBillWave} /> EFECTIVO</button>
                                <button className={`${styles.paymentBtn} ${paymentMethod === 'tarjeta' ? styles.active : ''}`} onClick={() => setPaymentMethod('tarjeta')}><FontAwesomeIcon icon={faCreditCard} /> TARJETA</button>
                            </div>
                            {paymentMethod === 'efectivo' && (
                                <div className={styles.paymentInputBg}>
                                    <label>Monto recibido</label>
                                    <input type="text" value={cashAmount} onChange={(e) => setCashAmount(formatMoney(e.target.value))} placeholder="0.00" autoFocus />
                                    {getNumericAmount(cashAmount) >= total && <div className={styles.changeBadge}>Cambio: ${(getNumericAmount(cashAmount)-total).toFixed(2)}</div>}
                                </div>
                            )}
                            {paymentMethod === 'tarjeta' && (
                                <div className={styles.paymentInputBg}>
                                    <label>Folio del Voucher</label>
                                    <input type="text" value={voucherFolio} onChange={(e) => setVoucherFolio(e.target.value.toUpperCase())} placeholder="Folio" autoFocus />
                                </div>
                            )}
                            <div className={styles.navigationButtons}>
                                <button className="btn btn-ghost" onClick={() => setCurrentStep('ACCESORIOS')}>Atrás</button>
                                <button className="btn btn-primary" onClick={() => handleConfirmPayment(paymentMethod)} disabled={isLoading}>{isLoading ? <FontAwesomeIcon icon={faSpinner} spin /> : 'Finalizar Pago'}</button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </main>

        <StatusModal 
            isOpen={showSuccessModal} 
            status="success" 
            title={lastTransaction?.isOffline ? "¡Venta Guardada Localmente!" : "¡Venta Exitosa!"} 
            message={lastTransaction?.isOffline 
                ? "Sin conexión a internet detectada. La venta se ha guardado y se sincronizará automáticamente al recuperar la señal." 
                : "La transacción se ha registrado y los tickets están en la cola de impresión."} 
            onAction={onComplete} 
            actionLabel="Finalizar Operación" 
        >
             {isNewRegistration && lastTransaction?.transaction?.phone && (
                <button 
                  className="btn btn-secondary" 
                  style={{marginTop: '1.5rem', width: '100%', background: '#f0fdf4', color: '#16a34a', borderColor: '#bbf7d0'}}
                  onClick={() => {
                      const cleanPhone = lastTransaction.transaction.phone.split(',')[0].replace(/\D/g, '');
                      const text = encodeURIComponent(`¡Hola! Bienvenido a Mundo de Pekes. Por favor lee nuestro reglamento aquí: https://mundodepekes.com/reglamento`);
                      window.open(`https://wa.me/52${cleanPhone}?text=${text}`, '_blank');
                  }}
                >
                    <FontAwesomeIcon icon={faWhatsapp} /> Enviar Reglamento Vía WhatsApp
                </button>
            )}
        </StatusModal>
        <PINModal 
            isOpen={showPinModal} 
            onClose={() => setShowPinModal(false)} 
            onSuccess={handleAuthorizedSuccess} 
            actionDescription="Ingreso Lista Negra" 
        />
    </div>
  );
};
