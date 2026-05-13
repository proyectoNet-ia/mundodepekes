import React, { useState, useEffect } from 'react';
import { createPresale, getPublicPackages, type PresaleChild } from '../../lib/presaleServicePublic';
import { supabasePublic } from '../../lib/supabasePublic';

import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faChild, faCheck, faPlus, faTrash, faClock, faPhone, faTicketAlt, faStar, faQrcode, faMagic, faUserPlus, faShoppingCart, faChevronRight, faExclamationTriangle, faCheckCircle, faBirthdayCake } from '@fortawesome/free-solid-svg-icons';
import './Portal.css';

// ─── Tipos ───────────────────────────────────────────────────────────────────
interface Package {
  id: string;
  nombre: string;
  area: string;
  duracion_minutos: number;
  precio: number;
}

interface PortalChild {
  nombre: string;
  edad: number;
  paquete_id: string;
}

type Step = 'intent' | 'tutor' | 'verify' | 'children' | 'confirm' | 'success';
type PortalIntent = 'presale' | 'registration';

const toTitleCase = (str: string) =>
  str.toLowerCase().split(' ').map((w, i) => {
    const LW = new Set(['de', 'del', 'la', 'las', 'los', 'el', 'y', 'e', 'o', 'a', 'en']);
    if (!w) return w;
    if (i !== 0 && LW.has(w)) return w;
    return w.charAt(0).toUpperCase() + w.slice(1);
  }).join(' ');

const formatPhone = (raw: string) => {
  const d = raw.replace(/\D/g, '').substring(0, 10);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `(${d.slice(0,3)}) ${d.slice(3)}`;
  return `(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6)}`;
};

// ─── Ícono SVG simple sin dependencias ───────────────────────────────────────
const Icon = ({ type }: { type: string }) => {
  const icons: Record<string, any> = {
    star:     faStar,
    child:    faChild,
    check:    faCheck,
    plus:     faPlus,
    trash:    faTrash,
    clock:    faClock,
    phone:    faPhone,
    ticket:   faTicketAlt,
    sparkles: faMagic,
    userPlus: faUserPlus,
    cart:     faShoppingCart,
    qr:       faQrcode,
    warning:  faExclamationTriangle,
    cake:     faBirthdayCake
  };
  const icon = icons[type] || faStar;
  return <FontAwesomeIcon icon={icon} className="portal-fa-icon" />;
};

// ─── CAPTCHA ─────────────────────────────────────────────────────────────────
const CAPTCHA_WORDS = ['cero','uno','dos','tres','cuatro','cinco','seis','siete','ocho','nueve'];
const newCaptcha = () => {
  const a = Math.floor(Math.random() * 9) + 1;
  const b = Math.floor(Math.random() * 9) + 1;
  return { a, b, result: a + b, aAsWord: Math.random() > 0.5 };
};

// ─── Componente Principal ─────────────────────────────────────────────────────
export const PortalPage: React.FC = () => {
  const [step, setStep] = useState<Step>('intent');
  const [intent, setIntent] = useState<PortalIntent>('presale');
  const [packages, setPackages] = useState<Package[]>([]);
  const [loadingPkgs, setLoadingPkgs] = useState(true);

  // Datos del tutor
  const [tutorNombre, setTutorNombre] = useState('');
  const [tutorTelefono, setTutorTelefono] = useState('');
  const [tutorTelefonoConfirm, setTutorTelefonoConfirm] = useState('');
  const [tutorPrefix, setTutorPrefix] = useState('+52');

  // Niños
  const [ninos, setNinos] = useState<PortalChild[]>([{ nombre: '', edad: 0, paquete_id: '' }]);
  // Tab de área activa por cada niño (idx -> area string)
  const [activeAreaPerNino, setActiveAreaPerNino] = useState<Record<number, string>>({});

  // Resultado
  const [result, setResult] = useState<any>(null);
  const [confirmCode, setConfirmCode] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [presaleExpiry, setPresaleExpiry] = useState<Date | null>(null);
  const [countdown, setCountdown] = useState('');

  // Verificación WhatsApp
  const [vCode, setVCode] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [vError, setVError] = useState('');
  const [isVLoading, setIsVLoading] = useState(false);
  const [sysInfo, setSysInfo] = useState<{logo: string | null, name: string}>({logo: null, name: 'Mundo de Pekes'});

  // Captcha — inicializado con lazy initializer (solo se ejecuta UNA vez, incluso en StrictMode)
  const [captcha, setCaptcha] = useState(newCaptcha);
  const [captchaInput, setCaptchaInput] = useState('');
  const [isCaptchaValid, setIsCaptchaValid] = useState(false);

  const generateCaptcha = () => {
    setCaptcha(newCaptcha());
    setCaptchaInput('');
    setIsCaptchaValid(false);
  };

  useEffect(() => {
    getPublicPackages()
      .then(setPackages)
      .catch(() => setError('No se pudieron cargar los paquetes. Intenta de nuevo.'))
      .finally(() => setLoadingPkgs(false));

    // Intentar cargar ajustes con el cliente público para evitar errores de sesión
    const loadSettings = async () => {
      try {
        const { data } = await supabasePublic.from('config_sistema').select('valor').eq('clave', 'capacidades').maybeSingle();
        if (data?.valor) {
          const v = data.valor as any;
          setSysInfo({ logo: v.logo_url || null, name: v.nombre_negocio || 'Mundo de Pekes' });
        }
      } catch (e) {
        console.log('Usando ajustes por defecto.');
      }
    };
    loadSettings();
    // generateCaptcha() ya no se llama aquí — se inicializa en useState
  }, []);

  // Countdown timer
  useEffect(() => {
    if (!presaleExpiry) return;
    const interval = setInterval(() => {
      const diff = Math.max(0, presaleExpiry.getTime() - Date.now());
      const m = Math.floor(diff / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setCountdown(`${m}:${s.toString().padStart(2, '0')}`);
      if (diff === 0) clearInterval(interval);
    }, 1000);
    return () => clearInterval(interval);
  }, [presaleExpiry]);

  const areas = Array.from(new Set(packages.map(p => p.area)));

  const total = ninos.reduce((sum, n) => {
    const pkg = packages.find(p => p.id === n.paquete_id);
    return sum + (pkg?.precio || 0);
  }, 0);

  const addNino = () => {
    if (ninos.length >= 4) return;
    setNinos([...ninos, { nombre: '', edad: 0, paquete_id: '' }]);
  };

  const removeNino = (idx: number) => setNinos(ninos.filter((_, i) => i !== idx));

  const updateNino = (idx: number, field: keyof PortalChild, value: string | number) => {
    setNinos(ninos.map((n, i) => i === idx ? { ...n, [field]: value } : n));
  };


  const canGoToChildren = tutorNombre.trim().length >= 2 && tutorTelefono.replace(/\D/g, '').length === 10;
  const fullTutorPhone = `${tutorPrefix}${tutorTelefono.replace(/\D/g, '')}`;
  const canGoToConfirm = intent === 'registration' 
    ? ninos.every(n => n.nombre.trim() && n.edad > 0)
    : ninos.every(n => n.nombre.trim() && n.edad > 0 && n.paquete_id);

  const handleSubmit = async () => {
    setIsSubmitting(true);
    setError('');
    try {
      const ninosData: PresaleChild[] = ninos.map(n => {
        const pkg = packages.find(p => p.id === n.paquete_id);
        return {
          nombre: n.nombre,
          edad: n.edad,
          paquete_id: n.paquete_id || '', 
          paquete_nombre: pkg?.nombre || 'Solo Registro',
          area: pkg?.area || 'N/A',
          duracion_minutos: pkg?.duracion_minutos || 0,
          precio: pkg?.precio || 0,
        };
      });

      const res = await createPresale({
        tutor_nombre: tutorNombre,
        tutor_telefono: fullTutorPhone,
        tutor_email: '',
        ninos: ninosData,
        total_estimado: intent === 'registration' ? 0 : ninosData.reduce((sum, n) => sum + n.precio, 0),
        telefono_verificado: true,
        tipo: intent // 'registration' o 'presale'
      });

      setResult(res);
      if (res?.id) {
        setConfirmCode('PEKES-' + res.id.substring(0, 6).toUpperCase());
      }
      if (res?.expires_at) {
        setPresaleExpiry(new Date(res.expires_at));
      }
      setStep('success');
    } catch (err: any) {
      console.error('Error al enviar:', err);
      setError(err.message || 'Ocurrió un error al enviar tu orden. Por favor intenta de nuevo.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSendCode = async () => {
    setVError('');
    if (tutorTelefono !== tutorTelefonoConfirm) {
      setVError('Los números de teléfono no coinciden. Por favor verifícalos.');
      return;
    }
    setStep('children');
  };

  const handleVerifyCode = async () => {
    setIsVerifying(true);
    setVError('');
    try {
      const { whatsappService } = await import('../../lib/whatsappService');
      const { success, error } = await whatsappService.verifyCode(fullTutorPhone, vCode);
      if (success) {
        await handleSubmit();
      } else {
        setVError(error || 'Código incorrecto. Intenta de nuevo.');
      }
    } catch (err) {
      setVError('Error al verificar el código.');
    } finally {
      setIsVerifying(false);
    }
  };


  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="portal-root">
      {/* Header */}
      <header className="portal-header">
        <div className="portal-logo-wrap">
          {sysInfo.logo ? (
             <img src={sysInfo.logo} style={{ maxWidth: '60px', maxHeight: '50px', objectFit: 'contain' }} alt="Logo" />
          ) : (
            <div className="portal-logo-icon">
              <Icon type="star" />
            </div>
          )}
          <div>
            <h1 className="portal-brand">{sysInfo.name}</h1>
            <p className="portal-tagline">Pre-registro de Entrada</p>
          </div>
        </div>
        {step !== 'success' && (
          <div className="portal-steps-bar">
            {(['tutor','children','confirm'] as const).map((s, i) => (
              <div key={s} className={`portal-step ${step === s ? 'active' : (step === 'children' && i === 0) || (step === 'confirm' && i <= 1) ? 'done' : ''}`}>
                <div className="portal-step-dot">{((step === 'verify' && i === 0) || (step === 'children' && i <= 1) || (step === 'confirm' && i <= 2)) ? <Icon type="check" /> : i + 1}</div>
                <span>{['Registro', 'Pekes', 'Confirmar'][i]}</span>
              </div>
            ))}
          </div>
        )}
      </header>

      <main className="portal-main">
        {step === 'intent' && (
          <div className="portal-card portal-animate">
            <div className="portal-card-header" style={{ textAlign: 'center', display: 'block' }}>
              <div className="portal-card-icon" style={{ margin: '0 auto 1.5rem', background: 'linear-gradient(135deg, #fef3c7, #fde68a)', color: '#d97706' }}>
                <Icon type="sparkles" />
              </div>
              <h2 style={{ fontSize: '1.8rem', fontWeight: 900 }}>¡Hola!</h2>
              <p>Elige cómo quieres registrarte hoy</p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', marginTop: '2rem' }}>
              <button 
                className="portal-intent-card" 
                onClick={() => { setIntent('registration'); setStep('tutor'); }}
              >
                <div className="intent-icon" style={{ background: '#e0f2fe', color: '#0369a1' }}>
                  <Icon type="userPlus" />
                </div>
                <div className="intent-content">
                  <span className="intent-title">Solo Registro</span>
                  <span className="intent-desc">Captura datos de tus pekes y elige paquete en caja.</span>
                </div>
                <div className="intent-arrow">
                    <FontAwesomeIcon icon={faChevronRight} />
                </div>
              </button>

              <button 
                className="portal-intent-card highlight" 
                onClick={() => { setIntent('presale'); setStep('tutor'); }}
              >
                <div className="intent-icon" style={{ background: '#f5f3ff', color: '#6d28d9' }}>
                  <Icon type="cart" />
                </div>
                <div className="intent-content">
                  <span className="intent-title">Hacer Preventa</span>
                  <span className="intent-desc">Elige paquetes desde aquí y ahorra tiempo al pagar.</span>
                </div>
                <div className="intent-arrow">
                    <FontAwesomeIcon icon={faChevronRight} />
                </div>
              </button>
            </div>
          </div>
        )}

        {/* PASO 1: Datos del Tutor */}
        {step === 'tutor' && (
          <div className="portal-card portal-animate">
            <div className="portal-card-header">
              <div className="portal-card-icon"><Icon type="phone" /></div>
              <div>
                <h2>¿Quién eres?</h2>
                <p>Ingresa tus datos para agilizar el ingreso en caja</p>
              </div>
            </div>

            <div className="portal-form">
              <div className="portal-field">
                <label>Tu Nombre Completo <span className="portal-req">*</span></label>
                <input
                  id="portal-tutor-name"
                  type="text"
                  placeholder="Ej. Ana García López"
                  value={tutorNombre}
                  onChange={e => setTutorNombre(toTitleCase(e.target.value))}
                  autoFocus
                />
              </div>
              <div className="portal-field">
                <label>WhatsApp / Teléfono <span className="portal-req">*</span></label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input
                    type="text"
                    value={tutorPrefix}
                    onChange={e => setTutorPrefix(e.target.value)}
                    placeholder="+52"
                    style={{ width: '80px', textAlign: 'center', fontWeight: 'bold', border: '2px solid var(--p-border)', borderRadius: '12px' }}
                  />
                  <input
                    id="portal-tutor-phone"
                    type="tel"
                    placeholder="(000) 000-0000"
                    value={formatPhone(tutorTelefono)}
                    onChange={e => setTutorTelefono(e.target.value.replace(/\D/g, '').substring(0, 10))}
                    inputMode="numeric"
                    style={{ flex: 1 }}
                  />
                </div>
                <span className="portal-field-hint">Lo usamos para contactarte si es necesario</span>
              </div>
              <div className="portal-field">
                <label>Confirmar Teléfono (10 dígitos)</label>
                <input 
                  id="portal-tutor-phone-confirm"
                  type="tel" 
                  placeholder="(000) 000-0000"
                  value={formatPhone(tutorTelefonoConfirm)} 
                  onChange={e => setTutorTelefonoConfirm(e.target.value.replace(/\D/g, '').substring(0, 10))}
                />
              </div>
            </div>

            <div className="portal-privacy-note">
              🔒 Tus datos están protegidos y solo se usan para tu registro de entrada.
            </div>

            <button
              id="portal-btn-to-children"
              className="portal-btn portal-btn-primary"
              disabled={!tutorNombre || tutorTelefono.length < 10 || tutorTelefonoConfirm.length < 10}
              onClick={handleSendCode}
            >
              Continuar <span className="btn-arrow">→</span>
            </button>
            {vError && <div className="portal-error" style={{ marginTop: '1rem' }}>{vError}</div>}
          </div>
        )}

        {/* PASO 1.5: Verificación de Código */}
        {step === 'verify' && (
          <div className="portal-card portal-animate">
            <div className="portal-card-header">
              <div className="portal-card-icon"><Icon type="check" /></div>
              <div>
                <h2>Verifica tu número</h2>
                <p>Hemos enviado un código de 6 dígitos a <strong>{tutorPrefix} {formatPhone(tutorTelefono)}</strong></p>
              </div>
            </div>

            <div className="portal-form">
              <div className="portal-field">
                <label>Código de Verificación</label>
                <input
                  id="portal-vcode"
                  type="text"
                  placeholder="000000"
                  maxLength={6}
                  value={vCode}
                  onChange={e => setVCode(e.target.value.replace(/\D/g, ''))}
                  inputMode="numeric"
                  autoFocus
                  className="portal-vcode-input"
                  style={{ 
                    textAlign: 'center', 
                    fontSize: '2rem', 
                    letterSpacing: '0.8rem', 
                    paddingLeft: '0.8rem',
                    fontWeight: '900',
                    width: '280px',
                    margin: '0 auto',
                    display: 'block'
                  }}
                />
                <span className="portal-field-hint">Ingresa el código que recibiste por WhatsApp</span>
              </div>
            </div>

            {vError && <div className="portal-error">{vError}</div>}

            <div className="portal-nav-row">
              <button className="portal-btn portal-btn-ghost" onClick={() => setStep('tutor')}>Cambiar número</button>
              <button
                id="portal-btn-do-verify"
                className="portal-btn portal-btn-primary"
                disabled={vCode.length !== 6 || isVerifying}
                onClick={handleVerifyCode}
              >
                {isVerifying ? <span className="portal-spinner-sm" /> : 'Confirmar Código'}
              </button>
            </div>

            <div className="portal-resend-wrap" style={{ marginTop: '1.5rem', textAlign: 'center' }}>
               <button 
                className="portal-btn-link" 
                disabled={isVLoading}
                onClick={handleSendCode}
                style={{ background: 'none', border: 'none', color: 'var(--p-primary)', cursor: 'pointer', fontSize: '0.9rem' }}
               >
                 ¿No recibiste el código? Reenviar
               </button>
            </div>
          </div>
        )}

        {/* PASO 2: Registro de Pekes */}
        {step === 'children' && (
          <div className="portal-card portal-animate">
            <div className="portal-card-header">
              <div className="portal-card-icon"><Icon type="child" /></div>
              <div>
                <h2>¿Quiénes vienen a jugar?</h2>
                <p>Agrega hasta 4 pekes y elige su paquete</p>
              </div>
            </div>

            {loadingPkgs ? (
              <div className="portal-loading">
                <div className="portal-spinner" />
                <p>Cargando paquetes...</p>
              </div>
            ) : (
              <div className="portal-children-list">
                {ninos.map((nino, idx) => {
                  const selectedPkg = packages.find(p => p.id === nino.paquete_id);
                  return (
                    <div key={idx} className="portal-child-card">
                      <div className="portal-child-header">
                        <span className="portal-child-num">Peke #{idx + 1}</span>
                        {ninos.length > 1 && (
                          <button
                            id={`portal-remove-child-${idx}`}
                            className="portal-remove-btn"
                            onClick={() => removeNino(idx)}
                            title="Eliminar"
                          >
                            <Icon type="trash" />
                          </button>
                        )}
                      </div>

                      <div className="portal-fields-row">
                        <div className="portal-field">
                          <label>Nombre del Peke</label>
                          <input
                            id={`portal-child-name-${idx}`}
                            type="text"
                            placeholder="Ej. Sofía"
                            value={nino.nombre}
                            onChange={e => updateNino(idx, 'nombre', toTitleCase(e.target.value))}
                          />
                        </div>
                        <div className="portal-field portal-field-sm">
                          <label>Edad</label>
                          <input
                            id={`portal-child-age-${idx}`}
                            type="number"
                            placeholder="Años"
                            min={1} max={15}
                            value={nino.edad || ''}
                            onChange={e => updateNino(idx, 'edad', Number(e.target.value))}
                          />
                        </div>
                      </div>

                      {/* Selector de paquetes (solo si es preventa) */}
                      {intent === 'presale' && (
                        <>
                          <div className="portal-pkg-section">
                            <label>Elige el paquete</label>

                            {/* ── Area Tabs ── */}
                            {(() => {
                              const activeArea = activeAreaPerNino[idx] || areas[0] || '';
                              const areaPkgs   = packages.filter(p => p.area === activeArea);
                              const fmtDur = (m: number) =>
                                m >= 60
                                  ? `${Math.floor(m / 60)}h${m % 60 ? `${m % 60}m` : ''}`
                                  : `${m}m`;
                              return (
                                <>
                                  <div className="portal-area-tabs">
                                    {areas.map(area => (
                                      <button
                                        key={area}
                                        className={`portal-area-tab ${activeArea === area ? 'active' : ''}`}
                                        onClick={() => setActiveAreaPerNino(prev => ({ ...prev, [idx]: area }))}
                                        type="button"
                                      >
                                        {area}
                                      </button>
                                    ))}
                                  </div>

                                  {/* ── Package Chips ── */}
                                  <div className="portal-pkg-chips">
                                    {areaPkgs.map(pkg => {
                                      const isSelected = nino.paquete_id === pkg.id;
                                      return (
                                        <button
                                          key={pkg.id}
                                          id={`portal-pkg-${idx}-${pkg.id}`}
                                          className={`portal-pkg-chip ${isSelected ? 'selected' : ''}`}
                                          onClick={() => updateNino(idx, 'paquete_id', pkg.id)}
                                          type="button"
                                        >
                                          <span className="pkg-chip-left">
                                            <span className="pkg-chip-check">
                                              {isSelected && <Icon type="check" />}
                                            </span>
                                            <span className="pkg-chip-name">{pkg.nombre}</span>
                                          </span>
                                          <span className="pkg-chip-right">
                                            <span className="pkg-chip-duration">{fmtDur(pkg.duracion_minutos)}</span>
                                            <span className="pkg-chip-price">${pkg.precio.toLocaleString('es-MX')}</span>
                                          </span>
                                        </button>
                                      );
                                    })}
                                    {areaPkgs.length === 0 && (
                                      <p style={{ color: 'var(--p-text-2)', fontSize: '0.82rem', textAlign: 'center', padding: '0.75rem 0' }}>
                                        Sin paquetes en esta área
                                      </p>
                                    )}
                                  </div>
                                </>
                              );
                            })()}
                          </div>

                          {selectedPkg && (
                            <div className="portal-pkg-selected-badge">
                              ✓ {selectedPkg.nombre} — {selectedPkg.duracion_minutos}min — <strong>${selectedPkg.precio.toLocaleString('es-MX')}</strong>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  );
                })}

                {ninos.length < 4 && (
                  <button id="portal-add-child" className="portal-add-child-btn" onClick={addNino}>
                    <Icon type="plus" /> Agregar otro peke
                  </button>
                )}
              </div>
            )}

            <div className="portal-nav-row">
              <button className="portal-btn portal-btn-ghost" onClick={() => setStep('tutor')}>← Atrás</button>
              <button
                id="portal-btn-to-confirm"
                className="portal-btn portal-btn-primary"
                disabled={!canGoToConfirm}
                onClick={() => setStep('confirm')}
              >
                {intent === 'registration' ? 'Revisar Registro →' : 'Revisar Orden →'}
              </button>
            </div>
          </div>
        )}

        {/* PASO 3: Confirmación */}
        {step === 'confirm' && (
          <div className="portal-card portal-animate">
            <div className="portal-card-header">
              <div className="portal-card-icon"><Icon type="ticket" /></div>
              <div>
                <h2>{intent === 'registration' ? 'Resumen de Registro' : 'Resumen de tu Orden'}</h2>
                <p>Verifica los datos antes de enviar</p>
              </div>
            </div>

            <div className="portal-summary">
              <div className="portal-summary-section">
                <h4>Tutor / Responsable</h4>
                <div className="portal-summary-row"><span>Nombre</span><strong>{tutorNombre}</strong></div>
                <div className="portal-summary-row"><span>Teléfono</span><strong>{tutorPrefix} {formatPhone(tutorTelefono)}</strong></div>

              </div>

              <div className="portal-summary-section">
                <h4>Pekes</h4>
                {ninos.map((n, idx) => {
                  const pkg = packages.find(p => p.id === n.paquete_id);
                  return (
                    <div key={idx} className="portal-summary-child">
                      <div className="portal-summary-child-name">👦 {n.nombre}, {n.edad} años</div>
                      {intent === 'presale' && pkg && (
                        <>
                          <div className="portal-summary-child-pkg">
                            {pkg.nombre} · {pkg.duracion_minutos}min · <strong>${pkg.precio.toLocaleString('es-MX')}</strong>
                          </div>
                          <div className="portal-summary-child-area">{pkg.area}</div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>

              {intent === 'presale' && (
                <div className="portal-total-row">
                  <span>Total Estimado</span>
                  <strong className="portal-total-amount">${total.toLocaleString('es-MX')}</strong>
                </div>
              )}

              {intent === 'presale' && (
                <div className="portal-expiry-note">
                  <Icon type="clock" /> Tu orden estará disponible en caja por <strong>30 minutos</strong> después de enviarse.
                </div>
              )}

              {/* CAPTCHA MEJORADO */}
              <div className="portal-captcha-section">
                <label style={{ fontSize: '0.85rem', fontWeight: 'bold', color: 'var(--p-text-1)', display: 'block', marginBottom: '0.5rem' }}>
                  Validación de Seguridad (Humano)
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', background: '#f1f5f9', padding: '1rem', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                  <span style={{ fontSize: '1.1rem', fontWeight: 'bold', color: 'var(--p-brand)', userSelect: 'none' }}>
                    {captcha.aAsWord ? CAPTCHA_WORDS[captcha.a] : captcha.a} + {captcha.b} =
                  </span>
                  <input 
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={captchaInput}
                    onChange={(e) => {
                      const val = e.target.value.replace(/\D/g, '');
                      setCaptchaInput(val);
                      setIsCaptchaValid(parseInt(val) === captcha.result);
                    }}
                    placeholder="?"
                    style={{ width: '60px', textAlign: 'center', border: '2px solid var(--p-border)', borderRadius: '8px', padding: '0.5rem', fontWeight: 'bold' }}
                  />
                  {isCaptchaValid && <span style={{ color: '#10b981', fontSize: '1.2rem' }}><Icon type="check" /></span>}
                </div>
                <span style={{ fontSize: '0.7rem', color: '#64748b', marginTop: '0.4rem', display: 'block' }}>Por favor resuelve la suma para finalizar</span>
              </div>
            </div>

            {error && <div className="portal-error">{error}</div>}

            <div className="portal-nav-row">
              <button className="portal-btn portal-btn-ghost" onClick={() => setStep('children')}>← Atrás</button>
              <button
                id="portal-btn-submit"
                className="portal-btn portal-btn-primary portal-btn-submit"
                disabled={isSubmitting || !isCaptchaValid}
                onClick={handleSubmit}
              >
                {isSubmitting ? <span className="portal-spinner-sm" /> : (intent === 'registration' ? '⚡ Finalizar Registro' : '⚡ Enviar Orden a Caja')}
              </button>
            </div>
          </div>
        )}

        {/* PASO 4: Éxito */}
        {step === 'success' && (
          <div className="portal-card portal-success-card portal-animate">
            <div className="portal-success-icon">🎉</div>
            <h2 className="portal-success-title">{intent === 'registration' ? '¡Registro completado!' : '¡Tu orden está en camino!'}</h2>
            <p className="portal-success-sub">
              {intent === 'registration' 
                ? 'Tus datos ya están en nuestro sistema. ¡Te esperamos!' 
                : 'Dirígete a caja con tu código de confirmación'}
            </p>

            {result && (
              <div className="portal-code-box">
                <span className="portal-code-label">
                  {intent === 'registration' ? 'Tu Código de Registro' : 'Tu Código de Preventa'}
                </span>
                <span className="portal-code">{result.id.substring(0, 6).toUpperCase()}</span>
              </div>
            )}

            <div className="portal-countdown-wrap">
              <Icon type="clock" />
              <div>
                <div className="portal-countdown">{countdown}</div>
                <small>Tiempo restante para presentarte en caja</small>
              </div>
            </div>

            <div className="portal-success-steps">
              <div className="portal-success-step">
                <span className="portal-success-num">1</span>
                <span>Dirígete al área de ingreso de Mundo de Pekes</span>
              </div>
              <div className="portal-success-step">
                <span className="portal-success-num">2</span>
                <span>Muestra este código al cajero: <strong>{confirmCode}</strong></span>
              </div>
              <div className="portal-success-step">
                <span className="portal-success-num">3</span>
                <span>El cajero ya tiene todo listo — solo confirmas el pago y ¡a jugar!</span>
              </div>
            </div>

            <div className="portal-success-total">
              Total a pagar en caja: <strong>${total.toLocaleString('es-MX')}</strong>
            </div>

            <button
              id="portal-btn-new-order"
              className="portal-btn portal-btn-ghost"
              onClick={() => {
                setStep('tutor');
                setTutorNombre(''); setTutorTelefono('');
                setNinos([{ nombre: '', edad: 0, paquete_id: '' }]);
                setConfirmCode(''); setPresaleExpiry(null);
              }}
            >
              Nueva Orden
            </button>
          </div>
        )}
      </main>

      <footer className="portal-footer">
        <p>© {new Date().getFullYear()} {sysInfo.name} · <a href="#">Aviso de Privacidad</a></p>
      </footer>
    </div>
  );
};
