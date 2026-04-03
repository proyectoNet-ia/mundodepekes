import React, { useState, useEffect } from 'react';
import styles from './SalesEngine.module.css';
import { omniSearch, registerFullEntry, type SearchResult } from '../../lib/salesService';
import { getPackages, type Package } from '../../lib/packageService';
import { stockService, type StockItem } from '../../lib/stockService';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSearch, faUserPlus, faChild, faCreditCard, faMoneyBillWave, faLock, faCheckCircle, faSpinner, faPhone, faExclamationTriangle, faTicketAlt, faClock } from '@fortawesome/free-solid-svg-icons';
import { faWhatsapp } from '@fortawesome/free-brands-svg-icons';
import { getActiveSession, openCash } from '../../lib/treasuryService';
import { PrinterService } from '../../lib/printerService';
import { type UserProfile } from '../../lib/authService';
import { useToast } from '../../components/Toast';
import { StatusModal } from '../../components/StatusModal';
import { getActiveSessions, type ActiveSession } from '../../lib/sessionService';
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

// Capitaliza nombres propios respetando preposiciones en español
// Ej: "fernando de la cruz" → "Fernando de la Cruz"
const LOWERCASE_WORDS = new Set(['de', 'del', 'la', 'las', 'los', 'el', 'y', 'e', 'o', 'a', 'en']);

const toTitleCase = (str: string): string => {
    return str
        .toLowerCase()
        .split(' ')
        .map((word, index) => {
            if (!word) return word;
            // Primera palabra siempre en mayúscula; preposiciones en el resto en minúscula
            if (index !== 0 && LOWERCASE_WORDS.has(word)) return word;
            // Soportar guión: "Luis-Angel" → cada parte capitalizada
            return word.split('-').map(part =>
                part.charAt(0).toUpperCase() + part.slice(1)
            ).join('-');
        })
        .join(' ');
};

interface CustomerData {
  id?: string;  // ID del cliente en BD (si fue encontrado por búsqueda)
  phone: string;
  name: string;
  email: string;
  visitsCount: number;
  children?: { id: string; name: string; age: number; observations: string; isAlreadyInside?: boolean }[];
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
  const [selectedAreas, setSelectedAreas] = useState<Record<number, string>>({});
  const [showPinModal, setShowPinModal] = useState(false);
  const [isAuthorizedOverride, setIsAuthorizedOverride] = useState(false);
  const [secondaryPhones, setSecondaryPhones] = useState<string[]>([]); // Teléfonos adicionales del tutor
  const [isNewRegistration, setIsNewRegistration] = useState(false);

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
            id: reentryData.tutorId || reentryData.clientes?.id,
            phone: reentryData.tutorContact || reentryData.clientes?.telefono || reentryData.phone || '',
            name: reentryData.tutorName || reentryData.clientes?.nombre || reentryData.name || '',
            email: reentryData.clientes?.email || '',
            visitsCount: reentryData.visitsCount || reentryData.clientes?.visitas_acumuladas || 0
          });

          // Obtener la edad real del niño desde la BD si tenemos su ID
          let childAge = reentryData.edad || 0;
          if (reentryData.childId && !childAge) {
            const { data: childRecord } = await supabase
              .from('ninos')
              .select('edad')
              .eq('id', reentryData.childId)
              .single();
            childAge = childRecord?.edad || 0;
          }

          setChildren([{ 
            id: reentryData.childId,
            name: reentryData.childName || reentryData.nombre || '', 
            age: childAge,
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
        id: res.id,          // Guardar ID para evitar duplicados al volver atrás
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
    setSecondaryPhones([]); // Limpiar teléfonos secundarios al seleccionar cliente
    setCurrentStep('NINO');
  };
  const handleCustomerContinue = async () => {
      // Validar si el teléfono principal y adicionales están duplicados
      setIsLoading(true);
      try {
          const cleanPhone = customer.phone.replace(/\D/g, '');
          const cleanSecondary = secondaryPhones.map(p => p.replace(/\D/g, '')).filter(p => p.length >= 10);
          
          let orQuery = `telefono.ilike.%${cleanPhone}%`;
          cleanSecondary.forEach(sp => {
              orQuery += `,telefono.ilike.%${sp}%`;
          });

          const { data, error } = await supabase
              .from('clientes')
              .select('id, nombre, telefono')
              .or(orQuery);
              
          if (!error && data && data.length > 0) {
              // Buscar si algún cliente diferente ya lo tiene
              const duplicate = data.find(c => c.id !== customer.id);
              if (duplicate) {
                  showToast(
                      `Uno de los celulares ingresados ya pertenece a "${duplicate.nombre}". Regrese a Búsqueda o quite el número para evitar múltiples perfiles con los mismos datos.`, 
                      'warning', 
                      'Número Duplicado'
                  );
                  setIsLoading(false);
                  return;
              }
          }
          
          setCurrentStep('NINO');
      } catch (e) {
          showToast('Error al validar el teléfono.', 'error');
      } finally {
          setIsLoading(false);
      }
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
      
      const blacklisted = activeChildren.filter(c => c.enListaNegra);
      const isAdmin = user?.role === 'admin';

      if (blacklisted.length > 0 && !isAuthorizedOverride && !isAdmin) {
          setShowPinModal(true);
          return;
      }
      
      if (isAdmin && blacklisted.length > 0) {
          setIsAuthorizedOverride(true);
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

    if (method === 'tarjeta' && voucherFolio.trim().length === 0) {
        showToast('Debe ingresar el número de folio o autorización del voucher para continuar.', 'warning');
        return;
    }

    setIsLoading(true);
    try {
        const registration = await registerFullEntry({
            customer: {
                id: customer.id,           // ID para UPDATE si ya existe
                name: customer.name,
                // Concatenar teléfono principal + secundarios
                phone: [customer.phone, ...secondaryPhones.filter(p => p.trim())].join(', '),
                email: customer.email
            },
            children: activeChildren.map((c, i) => {
                const selPkg = availablePackages.find(p => p.id === childPackages[i]);
                return {
                    id: c.id,              // ID para evitar duplicar niños existentes
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
            voucherFolio: method === 'tarjeta' ? voucherFolio : undefined,
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
                items: registration.transaction.children.map((c: any) => {
                    const pkg = availablePackages.find((p: any) => p.id === c.package);
                    return {
                        nino: c.name,
                        nombre: pkg?.nombre || 'Paquete',
                        precio: pkg?.precio || 0,
                        duracion: pkg?.duracion_minutos || 0,
                        hora_entrada: new Date(c.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                        hora_salida: new Date(c.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                    };
                }),
                accesorios: selectedAccessories.map(a => ({
                    cantidad: a.qty,
                    concepto: a.name,
                    pUnit: a.price,
                    importe: a.qty * a.price
                })),
                subtotal: total / 1.16,
                iva: total - (total / 1.16),
                total: total,
                paymentMethod: registration.transaction.metodo_pago
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
                    duracion: availablePackages.find((p: any) => p.id === c.package)?.duracion_minutos || 0,
                    horaEntrada: new Date(c.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                    horaSalida: new Date(c.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                    folio: registration.transaction.id.substring(0,8).toUpperCase()
                };
                PrinterService.printRaw(PrinterService.formatZebraWristband(zData), 'ZEBRA');
            });
        }

        const isNew = !customer.id;
        setIsNewRegistration(isNew);
        
        setShowSuccessModal(true);
        showToast('¡Venta registrada y tickets en camino!', 'success', 'Venta Exitosa');

        // WhatsApp Onboarding Automático para clientes nuevos
        if (isNew && customer.phone) {
            const cleanPhone = customer.phone.replace(/\D/g, '');
            if (cleanPhone.length >= 10) {
                const text = encodeURIComponent(`\xA1Hola ${customer.name}! \uD83D\uDC4B Bienvenido a Mundo de Pekes. \uD83D\uDE80\n\nNos da mucho gusto recibirte. Para garantizar un entorno seguro y divertido para todos, te recordamos que al ingresar con nosotros aceptas el aviso de privacidad y nuestro reglamento de convivencia y seguridad.\n\n\uD83D\uDCD6 Por favor, t\xF3mate un momento para leerlo aqu\xED:\nhttps://mundodepekes.com/reglamento\n\n\xA1Gracias por tu visita y que los pekes se diviertan al m\xE1ximo! \uD83C\uDF89`);
                // Pequeño timeout para permitir que React renderice el SuccessModal primero
                setTimeout(() => window.open(`https://wa.me/52${cleanPhone}?text=${text}`, '_blank'), 500);
            }
        }
    } catch (e) {
        showToast('Error fatal al registrar la venta.', 'error');
    } finally {
        setIsLoading(false);
    }
  };

  if (isCashOpen === null || (isCashOpen === true && isLoading && availablePackages.length === 0)) {
    return (
        <div className={styles.engineContainer} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ textAlign: 'center' }}>
                <FontAwesomeIcon icon={faSpinner} spin size="4x" style={{ color: 'var(--brand-500)', marginBottom: '1.5rem' }} />
                <h2 style={{ color: '#1e293b' }}>Sincronizando Bóveda...</h2>
                <p style={{ color: '#64748b' }}>Verificando turno de caja y paquetes activos</p>
            </div>
        </div>
    );
  }

  if (isCashOpen === false) {
    return (
        <div className={styles.cashClosedNotice}>
            <div className={styles.premiumLockCard}>
                <div className={styles.lockIconCircle}>
                    <FontAwesomeIcon icon={faLock} />
                </div>
                <h2>Caja Cerrada</h2>
                <p>Para procesar ventas, primero debe iniciar un turno de caja.</p>
                
                <div className={styles.quickOpenForm}>
                    <label>FONDO INICIAL EN CAJA</label>
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
                                    <input
                                        type="text"
                                        value={customer.name}
                                        onChange={(e) => setCustomer({...customer, name: toTitleCase(e.target.value)})}
                                        placeholder="Ej. Ana García"
                                        autoFocus
                                    />
                                </div>
                                <div className={styles.inputWrapper}>
                                    <label>WhatsApp / Teléfono Principal</label>
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

                                {/* Teléfonos secundarios */}
                                <div style={{ gridColumn: '1 / -1', borderTop: '1px dashed #e2e8f0', paddingTop: '1.25rem', marginTop: '0.25rem' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                                        <label style={{ margin: 0, fontSize: '0.75rem', fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                            Teléfonos Adicionales
                                            <span style={{ fontWeight: 500, textTransform: 'none', color: '#94a3b8', marginLeft: '0.4rem' }}>(opcional)</span>
                                        </label>
                                        <button
                                            type="button"
                                            onClick={() => setSecondaryPhones(prev => [...prev, ''])}
                                            className="btn btn-ghost"
                                            style={{ fontSize: '0.8rem', padding: '0.4rem 0.9rem', display: 'flex', alignItems: 'center', gap: '6px' }}
                                        >
                                            <FontAwesomeIcon icon={faPhone} /> + Añadir
                                        </button>
                                    </div>
                                    {secondaryPhones.length === 0 && (
                                        <p style={{ fontSize: '0.82rem', color: '#94a3b8', margin: 0 }}>
                                            Sin teléfonos adicionales. Pulsa "+ Añadir" para agregar.
                                        </p>
                                    )}
                                    {secondaryPhones.map((ph, idx) => (
                                        <div key={idx} className={styles.inputWrapper} style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-end', marginBottom: '0.75rem' }}>
                                            <div style={{ flex: 1 }}>
                                                <label>Teléfono adicional {idx + 1}</label>
                                                <input
                                                    type="tel"
                                                    value={
                                                        ph.length <= 3 ? ph
                                                        : ph.length <= 6 ? `(${ph.substring(0,3)}) ${ph.substring(3)}`
                                                        : `(${ph.substring(0,3)}) ${ph.substring(3,6)}-${ph.substring(6,10)}`
                                                    }
                                                    onChange={(e) => {
                                                        const raw = e.target.value.replace(/\D/g, '').substring(0, 10);
                                                        const updated = [...secondaryPhones];
                                                        updated[idx] = raw;
                                                        setSecondaryPhones(updated);
                                                    }}
                                                    placeholder="(000) 000-0000"
                                                />
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => setSecondaryPhones(prev => prev.filter((_, i) => i !== idx))}
                                                style={{ background: '#fee2e2', color: '#ef4444', border: '2px solid #fecdd3', borderRadius: 'var(--radius-xl)', padding: '1.1rem 1rem', cursor: 'pointer', flexShrink: 0, fontWeight: 700, fontSize: '1rem', lineHeight: 1 }}
                                                title="Eliminar teléfono"
                                            >
                                                ×
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className={styles.navigationButtons}>
                                <button className="btn btn-ghost" onClick={() => setCurrentStep('BUSQUEDA')}>Cancelar</button>
                                <button className="btn btn-primary" onClick={handleCustomerContinue} disabled={!customer.name || customer.phone.length < 10 || isLoading}>{isLoading ? <FontAwesomeIcon icon={faSpinner} spin /> : 'Continuar'}</button>
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
                                        <input
                                            type="text"
                                            value={child.name}
                                            onChange={(e) => { const n = [...children]; n[idx].name = toTitleCase(e.target.value); setChildren(n); }}
                                            placeholder="Ej. Luisito"
                                            disabled={child.included === false}
                                            autoFocus={idx === 0}
                                            required
                                        />
                                        
                                        {child.enListaNegra && child.observations && (
                                            <div className={styles.blacklistReason}>
                                                <strong>Motivo:</strong> {child.observations}
                                            </div>
                                        )}
                                    </div>
                                    <div className={styles.inputWrapper} style={{ width: '80px' }}>
                                        <label>Edad</label>
                                        <input type="number" value={child.age || ''} onChange={(e) => { const n = [...children]; n[idx].age = Number(e.target.value); setChildren(n); }} onFocus={(e) => e.target.select()} placeholder="Años" min={1} max={15} disabled={child.included === false} required />
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
                                                <span className={styles.pkgName} style={{fontWeight: '800', color: '#0f172a', display: 'block', marginBottom: '0.25rem'}}>{pkg.nombre}</span>
                                                <span style={{fontSize:'1rem', color:'#64748b', display: 'flex', alignItems: 'center', gap: '0.4rem'}}>
                                                    <FontAwesomeIcon icon={faClock} style={{opacity: 0.7, fontSize: '0.9rem'}} />
                                                    {Math.floor(pkg.duracion_minutos / 60) > 0 ? `${Math.floor(pkg.duracion_minutos / 60)}h ${pkg.duracion_minutos % 60 > 0 ? `${pkg.duracion_minutos % 60}m` : ''}` : `${pkg.duracion_minutos}m`}
                                                </span>
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
                        <div className={styles.accStepHeader}>
                            <div>
                                <h3 style={{ margin: 0 }}>Accesorios Adicionales</h3>
                                <p style={{ margin: '0.25rem 0 0', color: '#64748b', fontSize: '0.9rem' }}>
                                    Seleccione productos adicionales agrupados por categoría
                                </p>
                            </div>
                            {selectedAccessories.length > 0 && (
                                <div className={styles.accSelectionSummary}>
                                    <span className={styles.accBadge}>{selectedAccessories.reduce((s, a) => s + a.qty, 0)} items</span>
                                    <strong style={{ color: 'var(--brand-600)', fontSize: '1.1rem' }}>
                                        +${totalAccessories.toFixed(2)}
                                    </strong>
                                </div>
                            )}
                        </div>

                        {availableAccessories.length === 0 ? (
                            <div className={styles.accEmptyState}>
                                📦 No hay productos en inventario disponibles
                            </div>
                        ) : (
                            (() => {
                                // Agrupar por categoría
                                const byCategory = availableAccessories.reduce((groups, acc) => {
                                    const cat = acc.categoria || 'Sin categoría';
                                    if (!groups[cat]) groups[cat] = [];
                                    groups[cat].push(acc);
                                    return groups;
                                }, {} as Record<string, typeof availableAccessories>);

                                return Object.entries(byCategory).map(([category, items]) => (
                                    <div key={category} className={styles.accCategorySection}>
                                        <div className={styles.accCategoryHeader}>
                                            <span className={styles.accCategoryDot} />
                                            <span>{category}</span>
                                            <span className={styles.accCategoryCount}>{items.length} productos</span>
                                        </div>
                                        <div className={styles.accessoryGrid}>
                                            {items.map(acc => {
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
                                                        {qty > 0 && (
                                                            <div className={styles.accSelectedBadge}>✓ {qty}</div>
                                                        )}
                                                        <div className={styles.accCardBody}>
                                                            <span className={styles.accName}>{acc.nombre}</span>
                                                            <strong className={styles.accPrice}>${acc.precio_venta.toFixed(2)}</strong>
                                                        </div>
                                                        <div className={styles.accCardFooter}>
                                                            <small className={acc.cantidad <= 5 ? styles.accStockLow : styles.accStock}>
                                                                {acc.cantidad <= 5 ? `⚠️ ${acc.cantidad} restantes` : `${acc.cantidad} en stock`}
                                                            </small>
                                                            <div className={styles.qtyControlWidget} onClick={e => e.stopPropagation()}>
                                                                <button
                                                                    className={styles.qtyBtn}
                                                                    onClick={(e) => handleAccChange(e, acc, -1)}
                                                                    disabled={qty === 0}
                                                                    tabIndex={-1}
                                                                >−</button>
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
                                                );
                                            })}
                                        </div>
                                    </div>
                                ));
                            })()
                        )}

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

                            {paymentMethod === 'tarjeta' && (
                                <div className={styles.paymentInputBg}>
                                    <label>Folio del Voucher (Obligatorio)</label>
                                    <input 
                                        type="text" 
                                        value={voucherFolio} 
                                        onChange={(e) => setVoucherFolio(e.target.value.toUpperCase())}
                                        placeholder="Ingrese Folio o No. Autorización" 
                                        autoFocus 
                                    />
                                </div>
                            )}

                            <div className={styles.navigationButtons}>
                                <button className={styles.btnCancel} onClick={() => setCurrentStep('BUSQUEDA')} disabled={isLoading}>Cancelar</button>
                                <button className="btn btn-ghost" onClick={() => setCurrentStep('ACCESORIOS')} disabled={isLoading}>Atrás</button>
                                <button 
                                    className="btn btn-primary" 
                                    onClick={() => handleConfirmPayment(paymentMethod)} 
                                    disabled={isLoading}
                                >
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
            {isNewRegistration && (
                <button 
                  className="btn btn-secondary" 
                  style={{marginTop: '1.5rem', width: '100%', background: '#f0fdf4', color: '#16a34a', borderColor: '#bbf7d0'}}
                  onClick={() => {
                      const cleanPhone = customer.phone.replace(/\D/g, '');
                      const text = encodeURIComponent(`\xA1Hola ${customer.name}! \uD83D\uDC4B Bienvenido a Mundo de Pekes. \uD83D\uDE80\n\nNos da mucho gusto recibirte. Para garantizar un entorno seguro y divertido para todos, te recordamos que al ingresar con nosotros aceptas el aviso de privacidad y nuestro reglamento de convivencia y seguridad.\n\n\uD83D\uDCD6 Por favor, t\xF3mate un momento para leerlo aqu\xED:\nhttps://mundodepekes.com/reglamento\n\n\xA1Gracias por tu visita y que los pekes se diviertan al m\xE1ximo! \uD83C\uDF89`);
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
            actionDescription={`Autorización de ingreso para pekes en Lista Negra: ${activeChildren.filter(c => c.enListaNegra).map(c => c.name).join(', ')}`}
            message="Se han detectado pekes en LISTA NEGRA. Para permitir su ingreso, se requiere autorización de un Gerente."
        />
    </div>
  );
};
