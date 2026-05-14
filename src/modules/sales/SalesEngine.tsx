import React, { useState, useEffect } from 'react';
import styles from './SalesEngine.module.css';
import { omniSearch, registerFullEntry, type SearchResult } from '../../lib/salesService';
import { getPackages, type Package } from '../../lib/packageService';
import { stockService, type StockItem } from '../../lib/stockService';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSearch, faUserPlus, faChild, faCreditCard, faMoneyBillWave, faLock, faSpinner, faPhone, faTicketAlt, faClock, faBirthdayCake, faTrash, faPlus } from '@fortawesome/free-solid-svg-icons';
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
type SalesStep = 'BUSQUEDA' | 'CLIENTE' | 'VERIFICACION' | 'NINO' | 'PAQUETE' | 'ACCESORIOS' | 'PAGO';

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

const formatPhone = (phone: string) => {
    if (!phone) return '';
    // Si viene con prefijo internacional (+521234567890), extraer solo los 10 dígitos locales
    let digits = phone.replace(/\D/g, '');
    // Si tiene 12 dígitos y empieza con 52, quitar el código de país
    if (digits.length === 12 && digits.startsWith('52')) digits = digits.substring(2);
    // Si tiene 11 dígitos y empieza con 1, quitar el 1 (formato NANP)
    if (digits.length === 11 && digits.startsWith('1')) digits = digits.substring(1);
    digits = digits.substring(0, 10);
    if (digits.length <= 3) return digits;
    if (digits.length <= 6) return `(${digits.substring(0, 3)}) ${digits.substring(3)}`;
    return `(${digits.substring(0, 3)}) ${digits.substring(3, 6)}-${digits.substring(6, 10)}`;
};

/** Extrae el prefijo de lada de un número almacenado, ej: '+528001234567' → '+52' */
const extractPrefix = (phone: string): string => {
    if (!phone) return '+52';
    const digits = phone.replace(/\D/g, '');
    if (digits.startsWith('52')) return '+52';
    if (digits.startsWith('1') && digits.length === 11) return '+1';
    return '+52'; // Default México
};

const formatDuration = (mins: number) => {
    if (mins === 0) return 'Tiempo Ilimitado';
    if (mins >= 60) {
        const hrs = Math.floor(mins / 60);
        const remaining = mins % 60;
        return remaining > 0 ? `${hrs}h ${remaining}m` : `${hrs} ${hrs === 1 ? 'Hora' : 'Horas'}`;
    }
    return `${mins} Minutos`;
};

interface CustomerData {
  id?: string;
  phone: string;
  name: string;
  email: string;
  visitsCount: number;
  whatsapp_verificado?: boolean;
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
  const [mainPrefix, setMainPrefix] = useState(() => extractPrefix(reentryData?.tutorContact || reentryData?.clientes?.telefono || reentryData?.phone || ''));
  const [secondaryPhones, setSecondaryPhones] = useState<string[]>([]);
  const [secondaryPrefixes, setSecondaryPrefixes] = useState<string[]>([]);
  const [isNewRegistration, setIsNewRegistration] = useState(false);
  const [guestLimit, setGuestLimit] = useState<number>(15); // Default common limit

  // Verificación WhatsApp
  const [vCode, setVCode] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [vError, setVError] = useState('');

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
            visitsCount: reentryData.visitsCount || reentryData.clientes?.visitas_acumuladas || 0,
            whatsapp_verificado: reentryData.whatsapp_verificado || reentryData.clientes?.whatsapp_verificado || false
          });
          // Actualizar el prefijo basado en el número real
          setMainPrefix(extractPrefix(reentryData.tutorContact || reentryData.clientes?.telefono || reentryData.phone || ''));
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
          } else if (reentryData.registeredChildren) {
            // Caso: Venimos de "Registros" seleccionando un Tutor
            setChildren(reentryData.registeredChildren.map((c: any) => ({
              id: c.id,
              name: c.nombre,
              age: c.edad || 0,
              included: false, // El cajero debe marcarlos
              enListaNegra: c.en_lista_negra,
              observations: c.observaciones
            })));
            setCurrentStep('NINO');
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
    // Parsear múltiples teléfonos si existen
    const phoneEntries = (res.phone || '').split(',').map(p => p.trim()).filter(Boolean);
    
    // Procesar teléfono principal
    const firstFullPhone = phoneEntries[0] || '';
    let pPrefix = '+52';
    let pLocal  = firstFullPhone;
    
    if (firstFullPhone.startsWith('+')) {
        // Asumimos lada de 2 o 3 dígitos después del + (ej: +52, +1)
        // Buscamos el punto de corte (en México es +52 + 10 dígitos)
        const digits = firstFullPhone.replace(/\D/g, '');
        if (digits.startsWith('52') && digits.length === 12) {
            pPrefix = '+52';
            pLocal = digits.substring(2);
        } else if (digits.length > 10) {
            // Intentar detectar lada dinámicamente o dejar como está
            pPrefix = `+${digits.substring(0, digits.length - 10)}`;
            pLocal = digits.substring(digits.length - 10);
        }
    } else if (firstFullPhone.length === 10) {
        pPrefix = '+52';
        pLocal = firstFullPhone;
    }

    setCustomer({ 
        id: res.id, 
        phone: pLocal, 
        name: res.name || '', 
        email: '', 
        visitsCount: res.visitsCount,
        whatsapp_verificado: res.whatsapp_verificado 
    });
    setMainPrefix(pPrefix);

    // Procesar teléfonos secundarios
    const extraPhones = phoneEntries.slice(1);
    const sPrefixes: string[] = [];
    const sLocals: string[] = [];

    extraPhones.forEach(full => {
        const d = full.replace(/\D/g, '');
        if (d.startsWith('52') && d.length === 12) {
            sPrefixes.push('+52');
            sLocals.push(d.substring(2));
        } else if (d.length > 10) {
            sPrefixes.push(`+${d.substring(0, d.length - 10)}`);
            sLocals.push(d.substring(d.length - 10));
        } else {
            sPrefixes.push('+52');
            sLocals.push(d);
        }
    });

    setSecondaryPhones(sLocals);
    setSecondaryPrefixes(sPrefixes);
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
      // Verificación de WhatsApp desactivada por solicitud
      setCustomer(prev => ({ ...prev, whatsapp_verificado: true }));
      setCurrentStep('NINO');
  };

  const handleVerifyCode = async () => {
      setIsVerifying(true);
      setVError('');
      try {
          const { whatsappService } = await import('../../lib/whatsappService');
          const fullPhone = `${mainPrefix}${customer.phone.replace(/\D/g, '')}`;
          const { success, error } = await whatsappService.verifyCode(fullPhone, vCode);
          if (success) {
              // Actualizar estado local para evitar re-verificación
              setCustomer(prev => ({ ...prev, whatsapp_verificado: true }));
              
              // Si el cliente existe, actualizar su estatus en la BD
              if (customer.id) {
                await supabase.from('clientes').update({ 
                    whatsapp_verificado: true,
                    whatsapp_verificado_at: new Date().toISOString()
                }).eq('id', customer.id);
              }
              setCurrentStep('NINO');
          } else {
              setVError(error || 'Código incorrecto.');
          }
      } catch (err) {
          setVError('Fallo en la verificación.');
      } finally {
          setIsVerifying(false);
      }
  };

  const handleGoToPackages = async () => {
    if (activeChildren.length === 0) {
        showToast('Registre al menos un peke para continuar.', 'warning');
        return;
    }

    // Verificar lista negra
    const blacklisted = activeChildren.filter(c => c.enListaNegra);
    const isAdmin = user?.role === 'admin';
    if (blacklisted.length > 0 && !isAuthorizedOverride && !isAdmin) {
        setShowPinModal(true);
        return;
    }

    // Verificación de WhatsApp desactivada temporalmente
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
        const fullMain = `${mainPrefix}${customer.phone.replace(/\D/g, '')}`;
        const fullSecondary = secondaryPhones.map((p, idx) => {
            if (!p) return null;
            const pref = secondaryPrefixes[idx] || '+52';
            return `${pref}${p.replace(/\D/g, '')}`;
        }).filter(Boolean);
        const allPhones = [fullMain, ...fullSecondary].join(', ');

        const registration = await registerFullEntry({
            customer: { id: customer.id, name: customer.name, phone: allPhones, email: customer.email },
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
                    idPeke: (c.id || '').substring(0,8).toUpperCase(),
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
            // Configuración de impresión actual
            const settings = JSON.parse(localStorage.getItem('printer_settings') || '{}');

            // Imprimir Ticket General si está activo y hay impresora configurada
            if (settings.autoPrintTickets !== false && settings.ticketPrinter?.address) {
                const original = PrinterService.formatEpsonTicket(ticketData as any, false);
                const copia = PrinterService.formatEpsonTicket(ticketData as any, true);
                
                // Enviamos dos trabajos de impresión separados
                await PrinterService.printRaw(original, 'TICKET');
                await PrinterService.printRaw(copia, 'TICKET');
            }

            // Imprimir Pulseras solo si está activo, hay impresora y NO es un reingreso
            if (settings.autoPrintWristbands !== false && settings.wristbandPrinter?.address && !reentryData?.isReentry) {
                // Imprimir Pulseras (una por cada niño) de forma secuencial
                for (const c of (registration.transaction.children || [])) {
                    const pkg = availablePackages.find(p => p.id === c.package);
                    const wristbandData = {
                        nino: c.name,
                        idPeke: (c.id || registration.transaction.id).substring(0,8).toUpperCase(),
                        paquete: pkg?.nombre || 'Paquete',
                        area: pkg?.area || 'Mundo de Pekes',
                        duracion: pkg?.duracion_minutos || 0,
                        horaEntrada: new Date(c.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                        horaSalida: new Date(c.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                        folio: registration.transaction.id.substring(0,8).toUpperCase(),
                        telefono: (registration.transaction.phone || '').split(',')[0].trim(),
                        tutor: registration.transaction.customer
                    };
                    await PrinterService.printRaw(PrinterService.formatZebraWristband(wristbandData), 'WRISTBAND');
                }
            }
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
                    <div className={styles.openInputGroup}>
                        <span>$</span>
                        <input type="text" value={openingAmount} onChange={(e) => setOpeningAmount(formatMoney(e.target.value))} placeholder="0.00" />
                    </div>
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
                {['BUSQUEDA', 'CLIENTE', 'VERIFICACION', 'NINO', 'PAQUETE', 'ACCESORIOS', 'PAGO'].map((step, i) => (
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
                                    <div key={`${res.id}-${res.type}-${res.childId || ''}`} className={styles.resultItem} onClick={() => handleSelectCustomer(res)}>
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
                                    <div style={{ display: 'flex', gap: '8px' }}>
                                        <input 
                                            type="text" 
                                            value={mainPrefix} 
                                            onChange={(e) => setMainPrefix(e.target.value)} 
                                            placeholder="+52"
                                            style={{ width: '80px', textAlign: 'center', fontWeight: 800, color: 'var(--brand-600)', background: 'var(--brand-50)', border: '2px solid var(--brand-200)', borderRadius: '12px' }}
                                        />
                                        <input 
                                            type="tel" 
                                            value={formatPhone(customer.phone)} 
                                            onChange={(e) => setCustomer({...customer, phone: e.target.value.replace(/\D/g, '').substring(0, 10)})} 
                                            placeholder="(000) 000-0000" 
                                            style={{ flex: 1 }}
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Sección de Teléfonos Adicionales */}
                            <div style={{ marginTop: '1.5rem', background: '#f8fafc', padding: '1.25rem', borderRadius: '16px', border: '1px solid #e2e8f0' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                                    <label style={{ fontSize: '0.75rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                        Teléfonos Adicionales / Emergencia
                                    </label>
                                    <button 
                                        type="button"
                                        onClick={() => {
                                            setSecondaryPhones([...secondaryPhones, '']);
                                            setSecondaryPrefixes([...secondaryPrefixes, '+52']);
                                        }}
                                        style={{ 
                                            background: 'var(--brand-50)', 
                                            border: '1px solid var(--brand-200)', 
                                            borderRadius: '8px', 
                                            padding: '0.4rem 0.8rem', 
                                            fontSize: '0.75rem', 
                                            fontWeight: 700, 
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '6px'
                                        }}
                                    >
                                        <FontAwesomeIcon icon={faPlus} /> Añadir
                                    </button>
                                </div>

                                {secondaryPhones.length === 0 ? (
                                    <p style={{ fontSize: '0.8rem', color: '#94a3b8', fontStyle: 'italic', margin: '0.5rem 0' }}>No hay teléfonos adicionales registrados.</p>
                                ) : (
                                    secondaryPhones.map((phone, idx) => (
                                        <div key={idx} style={{ display: 'flex', gap: '0.75rem', marginBottom: '0.75rem', alignItems: 'center' }}>
                                            <div style={{ display: 'flex', gap: '8px', flex: 1 }}>
                                                <input 
                                                    type="text" 
                                                    value={secondaryPrefixes[idx] || '+52'} 
                                                    onChange={(e) => {
                                                        const updated = [...secondaryPrefixes];
                                                        updated[idx] = e.target.value;
                                                        setSecondaryPrefixes(updated);
                                                    }}
                                                    placeholder="+52"
                                                    style={{ width: '60px', textAlign: 'center', borderRadius: '12px', border: '2px solid #e2e8f0', fontWeight: 700, fontSize: '0.9rem' }}
                                                />
                                                <div style={{ flex: 1, position: 'relative' }}>
                                                    <input 
                                                        type="tel" 
                                                        value={formatPhone(phone)} 
                                                        onChange={(e) => {
                                                            const updated = [...secondaryPhones];
                                                            updated[idx] = e.target.value.replace(/\D/g, '').substring(0, 10);
                                                            setSecondaryPhones(updated);
                                                        }}
                                                        placeholder="(000) 000-0000"
                                                        style={{ width: '100%', padding: '0.75rem 1rem', borderRadius: '12px', border: '2px solid #e2e8f0', fontSize: '1rem', outline: 'none' }}
                                                    />
                                                </div>
                                            </div>
                                            <button 
                                                type="button"
                                                onClick={() => {
                                                    setSecondaryPhones(secondaryPhones.filter((_, i) => i !== idx));
                                                    setSecondaryPrefixes(secondaryPrefixes.filter((_, i) => i !== idx));
                                                }}
                                                style={{ background: '#fee2e2', color: '#ef4444', border: 'none', borderRadius: '10px', padding: '0.75rem 0.9rem', cursor: 'pointer', transition: 'all 0.2s' }}
                                                title="Eliminar teléfono"
                                            >
                                                <FontAwesomeIcon icon={faTrash} />
                                            </button>
                                        </div>
                                    ))
                                )}
                            </div>
                            <div className={styles.navigationButtons}>
                                <button className="btn btn-ghost" onClick={() => setCurrentStep('BUSQUEDA')}>Cancelar</button>
                                <button className="btn btn-primary" onClick={handleCustomerContinue} disabled={!customer.name || (customer.phone.length < 10 && !isPrivateEvent) || isLoading}>Continuar</button>
                            </div>
                        </div>
                    </div>
                )}

                {currentStep === 'VERIFICACION' && (
                    <div className={styles.fadeSlide}>
                        <div className={styles.premiumFormCard}>
                            <div className={styles.formHeader}>
                                <div className={styles.formHeaderIcon} style={{ background: '#25D366' }}><FontAwesomeIcon icon={faWhatsapp} /></div>
                                <div>
                                    <h3>Confirmar WhatsApp</h3>
                                    <p>Se envió un código a <strong>{customer.phone}</strong></p>
                                </div>
                            </div>
                            <div style={{ padding: '2rem 0', textAlign: 'center' }}>
                                <label style={{ display: 'block', marginBottom: '1rem', fontWeight: 800, color: '#64748b' }}>CÓDIGO DE 6 DÍGITOS</label>
                                <input 
                                    type="text" 
                                    maxLength={6}
                                    value={vCode}
                                    onChange={(e) => setVCode(e.target.value.replace(/\D/g, ''))}
                                    style={{ 
                                        width: '320px', 
                                        fontSize: '2.5rem', 
                                        textAlign: 'center', 
                                        letterSpacing: '1rem', 
                                        paddingLeft: '1rem', // Para compensar el último letter-spacing
                                        fontWeight: 900,
                                        border: '3px solid #e2e8f0',
                                        borderRadius: '16px',
                                        padding: '1rem'
                                    }}
                                    placeholder="000000"
                                />
                                {vError && <p style={{ color: 'var(--danger)', marginTop: '1rem', fontWeight: 700 }}>{vError}</p>}
                            </div>
                            <div className={styles.navigationButtons}>
                                <button className="btn btn-ghost" onClick={() => setCurrentStep('CLIENTE')}>Corregir Teléfono</button>
                                <button className="btn btn-primary" onClick={handleVerifyCode} disabled={vCode.length !== 6 || isVerifying}>
                                    {isVerifying ? <FontAwesomeIcon icon={faSpinner} spin /> : 'Verificar e Ingresar'}
                                </button>
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
                        activeChildren.map((child, idx) => {
                          const packagesByArea = availablePackages.filter(p => !p.es_privado).reduce((acc, pkg) => {
                            if (!acc[pkg.area]) acc[pkg.area] = [];
                            acc[pkg.area].push(pkg);
                            return acc;
                          }, {} as Record<string, Package[]>);

                          return (
                            <div key={idx} className={styles.childPackageSelection}>
                              <div className={styles.packageHeaderGroup}>
                                <span className={styles.packageLabel}>PAQUETE PARA</span>
                                <h4 className={styles.childNameHighlight}>{child.name}</h4>
                              </div>
                              <select 
                                value={childPackages[idx] || ''} 
                                onChange={(e) => setChildPackages({...childPackages, [idx]: e.target.value})}
                                className={styles.packageSelect}
                              >
                                <option value="">Seleccione un paquete...</option>
                                {Object.entries(packagesByArea).map(([area, pkgs]) => (
                                  <optgroup key={area} label={`ÁREA: ${area.toUpperCase()}`}>
                                    {pkgs.map(pkg => (
                                      <option key={pkg.id} value={pkg.id}>
                                        {pkg.nombre} — ${pkg.precio} ({formatDuration(pkg.duracion_minutos)})
                                      </option>
                                    ))}
                                  </optgroup>
                                ))}
                              </select>
                            </div>
                          );
                        })
                      )}
                      <div className={styles.navigationButtons}>
                        <button className="btn btn-ghost" onClick={() => setCurrentStep('NINO')}>Atrás</button>
                        <button className="btn btn-primary" onClick={() => setCurrentStep('ACCESORIOS')} disabled={isPrivateEvent ? !privatePackageId : activeChildren.some((_, i) => !childPackages[i])}>Siguiente</button>
                      </div>
                    </div>
                )}

                {currentStep === 'ACCESORIOS' && (
                    <div className={styles.fadeSlide}>
                        <div className={styles.accStepHeader}>
                            <div className={styles.formHeader}>
                                <div className={styles.formHeaderIcon}><FontAwesomeIcon icon={faTicketAlt} /></div>
                                <div>
                                    <h3>Accesorios Adicionales</h3>
                                    <p>Venta sugerida y complementos</p>
                                </div>
                            </div>
                            <div className={styles.accSelectionSummary}>
                                <span className={styles.accBadge}>{selectedAccessories.reduce((sum, a) => sum + a.qty, 0)}</span>
                                <span style={{ fontWeight: 700, fontSize: '0.8rem', color: 'var(--brand-700)' }}>Artículos seleccionados</span>
                            </div>
                        </div>

                        {availableAccessories.length === 0 ? (
                            <div className={styles.accEmptyState}>
                                <p>No hay productos disponibles en inventario actualmente.</p>
                            </div>
                        ) : (
                            Object.entries(
                                availableAccessories.reduce((acc, item) => {
                                    const cat = item.categoria || 'Generales';
                                    if (!acc[cat]) acc[cat] = [];
                                    acc[cat].push(item);
                                    return acc;
                                }, {} as Record<string, StockItem[]>)
                            ).map(([category, items]) => (
                                <div key={category} className={styles.accCategorySection}>
                                    <div className={styles.accCategoryHeader}>
                                        <div className={styles.accCategoryDot} />
                                        <span>{category}</span>
                                        <span className={styles.accCategoryCount}>{items.length} productos</span>
                                    </div>
                                    <div className={styles.accessoryGrid}>
                                        {items.map(acc => {
                                            const sel = selectedAccessories.find(a => a.id === acc.id);
                                            const qty = sel?.qty || 0;
                                            return (
                                                <div 
                                                    key={acc.id} 
                                                    className={`${styles.accessoryCard} ${qty > 0 ? styles.accessorySelected : ''}`}
                                                    onClick={(e) => handleAccChange(e, acc, 1)}
                                                >
                                                    {qty > 0 && <div className={styles.accSelectedBadge}>✓ {qty}</div>}
                                                    <div className={styles.accCardBody}>
                                                        <span className={styles.accName}>{acc.nombre}</span>
                                                        <span className={styles.accPrice}>${acc.precio_venta}</span>
                                                    </div>
                                                    <div className={styles.accCardFooter}>
                                                        <span className={`${acc.cantidad <= (acc.minimo_alert || 5) ? styles.accStockLow : styles.accStock}`}>
                                                            {acc.cantidad} disp.
                                                        </span>
                                                        <div className={styles.qtyControlWidget} onClick={(e) => e.stopPropagation()}>
                                                            <button className={styles.qtyBtn} onClick={(e) => handleAccChange(e, acc, -1)} disabled={qty === 0}>-</button>
                                                            <span className={styles.qtyValue}>{qty}</span>
                                                            <button className={styles.qtyBtn} onClick={(e) => handleAccChange(e, acc, 1)} disabled={qty >= acc.cantidad}>+</button>
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            ))
                        )}

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

                                <div className={styles.totalRow} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
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
