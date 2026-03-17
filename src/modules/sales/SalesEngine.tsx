import React, { useState, useEffect } from 'react';
import styles from './SalesEngine.module.css';
import { omniSearch, registerFullEntry, type SearchResult } from '../../lib/salesService';
import { getPackages, type Package } from '../../lib/packageService';

// Types
type SalesStep = 'BUSQUEDA' | 'CLIENTE' | 'NINO' | 'PAQUETE' | 'PAGO';
type SaleMode = 'REGISTRO_INTELIGENTE' | 'VENTA_RAPIDA';

interface CustomerData {
  phone: string;
  name: string;
  email: string;
  visitsCount: number; // Added for loyalty
}

interface ChildData {
  name: string;
  age: number;
}

// Types removed, imported from services

export const SalesEngine: React.FC = () => {
  const [saleMode, setSaleMode] = useState<SaleMode | null>(null);
  const [currentStep, setCurrentStep] = useState<SalesStep>('BUSQUEDA');
  
  // Form State
  const [customer, setCustomer] = useState<CustomerData>({ phone: '', name: '', email: '', visitsCount: 0 });
  const [children, setChildren] = useState<ChildData[]>([{ name: '', age: 0 }]);
  const [selectedPackage, setSelectedPackage] = useState<string>('');
  const [availablePackages, setAvailablePackages] = useState<Package[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const loadPackages = async () => {
      const pkgs = await getPackages();
      setAvailablePackages(pkgs);
    };
    loadPackages();
  }, []);


  const renderStepsIndicator = () => {
    if (saleMode !== 'REGISTRO_INTELIGENTE') return null;
    
    const steps: { key: SalesStep; label: string }[] = [
      { key: 'BUSQUEDA', label: 'Búsqueda' },
      { key: 'CLIENTE', label: 'Cliente' },
      { key: 'NINO', label: 'Niño' },
      { key: 'PAQUETE', label: 'Paquete' },
      { key: 'PAGO', label: 'Pago' }
    ];
    
    return (
      <nav aria-label="Progreso de ingreso" className={styles.stepperContainer}>
        <ol className={styles.stepper}>
          {steps.map((step, index) => {
            const isCurrent = currentStep === step.key;
            const isPast = steps.findIndex(s => s.key === currentStep) > index;
            
            return (
              <li key={step.key} className={`${styles.step} ${isCurrent ? styles.active : ''} ${isPast ? styles.past : ''}`}>
                <span className={styles.stepCircle}>
                  {isPast ? '✓' : index + 1}
                </span>
                <span className={styles.stepLabel}>{step.label}</span>
              </li>
            );
          })}
        </ol>
      </nav>
    );
  };

  const handleNext = () => {
    const steps: SalesStep[] = ['BUSQUEDA', 'CLIENTE', 'NINO', 'PAQUETE', 'PAGO'];
    const currentIndex = steps.indexOf(currentStep);
    if (currentIndex < steps.length - 1) {
      setCurrentStep(steps[currentIndex + 1]);
    }
  };

  const handleBack = () => {
    const steps: SalesStep[] = ['BUSQUEDA', 'CLIENTE', 'NINO', 'PAQUETE', 'PAGO'];
    const currentIndex = steps.indexOf(currentStep);
    if (currentIndex > 0) {
      setCurrentStep(steps[currentIndex - 1]);
    }
  };

  const renderActiveStep = () => {
    switch (currentStep) {
      case 'BUSQUEDA':
        const handleSearch = async () => {
          if (!searchTerm) return;
          setIsLoading(true);
          try {
            const results = await omniSearch(searchTerm);
            setSearchResults(results);
          } catch (error) {
            console.error(error);
          } finally {
            setIsLoading(false);
          }
        };

        const selectResult = (result: SearchResult) => {
          setCustomer({
            name: result.name,
            phone: result.phone || '',
            email: result.type === 'tutor' ? 'cliente@recuperado.com' : '',
            visitsCount: result.visitsCount
          });
          if (result.childName) {
            setChildren([{ name: result.childName, age: 5 }]);
          }
          handleNext();
        };

        return (
          <div className={styles.stepContent}>
            <h3>Omni-Búsqueda de Ingreso</h3>
            <p className={styles.stepDescription}>Busque por nombre de tutor, nombre del niño o teléfono celular.</p>
            
            <div className={styles.searchBox}>
              <input 
                type="text" 
                placeholder="Ej: Juan Pérez o 555-0123..." 
                className={styles.input} 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              />
              <button
                className="btn btn-primary" 
                onClick={handleSearch}
                disabled={isLoading}
              >
                {isLoading ? '...' : 'Buscar'}
              </button>
            </div>

            {searchResults && (
              <div className={styles.resultsList}>
                {searchResults.length > 0 ? (
                  searchResults.map(result => (
                    <div key={result.id} className={styles.resultItem} onClick={() => selectResult(result)}>
                      <div className={styles.resultInfo}>
                        <h4>{result.name}</h4>
                        <div className={styles.resultMeta}>
                          {result.phone && <span>📞 {result.phone}</span>}
                          {result.childName && <span>👶 Niño: {result.childName}</span>}
                          <span>🔄 {result.visitsCount} visitas</span>
                        </div>
                      </div>
                      <span className={styles.resultBadge}>
                        {result.type === 'tutor' ? 'Tutor' : 'Historial'}
                      </span>
                    </div>
                  ))
                ) : (
                  <div className={styles.noResults}>No se encontraron coincidencias. Intente con otros datos.</div>
                )}
              </div>
            )}

            <div className={styles.quickActions}>
              <button 
                onClick={() => { 
                    setCustomer({phone: '', name: '', email: '', visitsCount: 0}); 
                    setChildren([{ name: '', age: 0 }]);
                    setCurrentStep('CLIENTE'); 
                }} 
                className="btn btn-secondary"
              >
                + Nuevo Registro
              </button>
            </div>
          </div>
        );
      case 'CLIENTE':
        return (
          <div className={styles.stepContent}>
            <h3>Datos del Tutor</h3>
            <p className={styles.stepDescription}>Registro de la persona responsable del menor.</p>
            <div className={styles.formGrid}>
              <div className={styles.formGroup}>
                <label>Nombre Completo</label>
                <input className={styles.input} type="text" placeholder="Ej: Juan Pérez" value={customer.name} onChange={e => setCustomer({...customer, name: e.target.value})} />
              </div>
              <div className={styles.formGroup}>
                <label>Teléfono de Contacto</label>
                <input className={styles.input} type="tel" placeholder="Ej: 555-0123" value={customer.phone} onChange={e => setCustomer({...customer, phone: e.target.value})} />
              </div>
              <div className={styles.formGroup}>
                <label>Correo Electrónico (Opcional)</label>
                <input className={styles.input} type="email" placeholder="email@ejemplo.com" value={customer.email} onChange={e => setCustomer({...customer, email: e.target.value})} />
              </div>
            </div>
            <div className={styles.navigationButtons}>
              <button onClick={handleBack} className="btn btn-ghost">Anterior</button>
              <button onClick={handleNext} className="btn btn-primary">Continuar al Registro del Niño</button>
            </div>
          </div>
        );
      case 'NINO':
        return (
          <div className={styles.stepContent}>
            <h3>Datos de los Menores</h3>
            <p className={styles.stepDescription}>Puede agregar varios niños bajo un mismo tutor.</p>
            {children.map((child, idx) => (
              <div key={idx} className={styles.childEntry}>
                <div className={styles.formGroup}>
                  <label>Nombre del Niño</label>
                  <input 
                    className={styles.input} 
                    type="text" 
                    placeholder="Nombre" 
                    value={child.name} 
                    onChange={e => {
                      const newChildren = [...children];
                      newChildren[idx].name = e.target.value;
                      setChildren(newChildren);
                    }}
                  />
                </div>
                <div className={styles.formGroup}>
                  <label>Edad</label>
                  <input 
                    className={styles.input} 
                    type="number" 
                    placeholder="Edad" 
                    value={child.age || ''} 
                    onChange={e => {
                      const newChildren = [...children];
                      newChildren[idx].age = parseInt(e.target.value) || 0;
                      setChildren(newChildren);
                    }}
                  />
                </div>
                {idx > 0 && (
                  <button 
                    className={styles.removeButton}
                    onClick={() => setChildren(children.filter((_, i) => i !== idx))}
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
            <button className={`${styles.addButton} btn btn-secondary`} onClick={() => setChildren([...children, { name: '', age: 0 }])}>+ Agregar otro niño</button>
            <div className={styles.navigationButtons}>
              <button onClick={handleBack} className="btn btn-ghost">Anterior</button>
              <button onClick={handleNext} className="btn btn-primary">Continuar a Paquetes</button>
            </div>
          </div>
        );
      case 'PAQUETE':
        const currentHour = new Date().getHours();
        const isNearClosing = currentHour >= 18; // Mock: Closing at 20:00

        return (
          <div className={styles.stepContent}>
            <div className={styles.loyaltyBanner}>
                {customer.visitsCount >= 9 ? (
                    <div className={styles.reward}>
                        🔥 ¡RECOMPENSA ACTIVA! 10ª Visita - Paquete Básico Gratis
                    </div>
                ) : (
                    <div className={styles.counter}>
                        Visitas acumuladas: <strong>{customer.visitsCount}</strong> (Faltan {10 - customer.visitsCount} para regalo)
                    </div>
                )}
            </div>

            <h3>Seleccionar Áreas y Paquetes</h3>
            <p className={styles.stepDescription}>Elija el tiempo y zona de juego para cada niño.</p>
            
            {isNearClosing && (
                <div className={styles.timeWarning}>
                    ⚠️ Hora de cierre cercana (20:00). Paquetes de larga duración desactivados.
                </div>
            )}

            <div className={styles.packageGrid}>
              {availablePackages.map(pkg => {
                const isBlocked = isNearClosing && pkg.duracion_minutos > 60;
                const isFree = customer.visitsCount >= 9 && pkg.duracion_minutos === 60;
                
                return (
                  <div 
                    key={pkg.id} 
                    className={`
                        ${styles.packageCard} 
                        ${selectedPackage === pkg.id ? styles.packageSelected : ''}
                        ${isBlocked ? styles.blocked : ''}
                    `}
                    onClick={() => !isBlocked && setSelectedPackage(pkg.id)}
                  >
                    <div className={styles.packageHeader}>
                      <span className={styles.packageTitle}>{pkg.nombre} ({pkg.area})</span>
                      <span className={styles.packagePrice}>
                          {isFree ? '$0.00' : `$${pkg.precio}.00`}
                      </span>
                    </div>
                    {isBlocked && <div className={styles.blockedOverlay}>No disponible por horario</div>}
                    <ul className={styles.packageFeatures}>
                      <li>{pkg.duracion_minutos} min de juego</li>
                      <li>Acceso a área {pkg.area}</li>
                    </ul>
                  </div>
                );
              })}
            </div>
            <div className={styles.navigationButtons}>
              <button onClick={handleBack} className="btn btn-ghost">Anterior</button>
              <button onClick={handleNext} className={`btn btn-primary ${!selectedPackage ? styles.disabled : ''}`} disabled={!selectedPackage}>Continuar al Pago</button>
            </div>
          </div>
        );
        const handleConfirmPayment = async (method: string) => {
          setIsLoading(true);
          try {
            const pkg = availablePackages.find(p => p.id === selectedPackage);
            if (!pkg) return;

            const total = (customer.visitsCount >= 9 && pkg.duracion_minutos === 60) ? 0 : pkg.precio;

            await registerFullEntry({
              customer: { name: customer.name, phone: customer.phone, email: customer.email },
              children: children.map(c => ({
                name: c.name,
                age: c.age,
                packageId: pkg.id,
                area: pkg.area,
                duration: pkg.duracion_minutos
              })),
              paymentMethod: method,
              total: total
            });
            
            alert('¡Ingreso registrado exitosamente!');
            setSaleMode(null);
          } catch (error) {
            console.error(error);
            alert('Error al registrar el ingreso.');
          } finally {
            setIsLoading(false);
          }
        };

        return (
          <div className={styles.stepContent}>
            <h3>Procesar Pago</h3>
            <p className={styles.stepDescription}>Seleccione el método de pago para finalizar.</p>
            <div className={styles.summaryBox}>
              <div className={styles.summaryItem}>
                <span>Total a Pagar:</span>
                <strong>
                  ${(customer.visitsCount >= 9 && availablePackages.find(p=>p.id===selectedPackage)?.duracion_minutos === 60) ? '0.00' : availablePackages.find(p => p.id === selectedPackage)?.precio + '.00'}
                </strong>
              </div>
              <div className={styles.paymentMethods}>
                <button className={styles.paymentButton} onClick={() => handleConfirmPayment('Efectivo')} disabled={isLoading}>
                    <span className={styles.paymentIcon}>💵</span> Efectivo
                </button>
                <button className={styles.paymentButton} onClick={() => handleConfirmPayment('Tarjeta')} disabled={isLoading}>
                    <span className={styles.paymentIcon}>💳</span> Tarjeta
                </button>
              </div>
            </div>
            {isLoading && <div className={styles.loadingOverlay}>Procesando transacción...</div>}
            <div className={styles.navigationButtons}>
              <button onClick={handleBack} className="btn btn-ghost" disabled={isLoading}>Anterior</button>
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  if (!saleMode) {
    return (
      <div className={styles.selectionMode}>
        <div className={styles.selectionHeader}>
            <h2>Terminal de Operaciones</h2>
            <p>Seleccione el flujo de trabajo para iniciar</p>
        </div>
        <div className={styles.cardsContainer}>
          <button onClick={() => { setSaleMode('REGISTRO_INTELIGENTE'); setCurrentStep('BUSQUEDA'); }} className={styles.modeCard}>
            <div className={styles.modeIcon}>✨</div>
            <h3>Registro Inteligente</h3>
            <p>Flujo guiado para nuevos ingresos y clientes frecuentes.</p>
          </button>
          <button onClick={() => { setSaleMode('VENTA_RAPIDA'); }} className={styles.modeCard}>
            <div className={styles.modeIcon}>☕</div>
            <h3>Venta Rápida</h3>
            <p>Venta de productos, snacks y cafetería sin registro.</p>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.engineContainer}>
      <header className={styles.engineHeader}>
        <div>
            <span className={styles.modeBadge}>{saleMode === 'REGISTRO_INTELIGENTE' ? 'Ingreso' : 'Snacks'}</span>
            <h2>{saleMode === 'REGISTRO_INTELIGENTE' ? 'Nuevo Ingreso' : 'Venta Rápida'}</h2>
        </div>
        <button onClick={() => setSaleMode(null)} className={styles.cancelButton}>Abandonar Flujo</button>
      </header>
      
      {renderStepsIndicator()}
      
      <main aria-live="polite" className={styles.engineMain}>
        {saleMode === 'REGISTRO_INTELIGENTE' ? renderActiveStep() : (
          <div className={styles.stepContent}>
            <h3>Terminal de Productos</h3>
            <p>Registro de snacks y bebidas (Cafetería).</p>
            <div className={styles.placeholderGrid}>
                {[1,2,3,4,5,6].map(i => (
                    <div key={i} className={styles.productPlaceholder}></div>
                ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
};
