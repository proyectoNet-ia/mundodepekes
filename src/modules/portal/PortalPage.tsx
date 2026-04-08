import React, { useState, useEffect } from 'react';
import { createPresale, getPublicPackages, type PresaleChild } from '../../lib/presaleService';
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

type Step = 'tutor' | 'children' | 'confirm' | 'success';

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
  const icons: Record<string, React.ReactNode> = {
    star:    <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 22 12 18.54 5.82 22 7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>,
    child:   <svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="4" r="2"/><path d="M19 13h-6.6V8h-1.8v5H4v2h7v7h2v-7h6v-2z"/></svg>,
    check:   <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M20 6L9 17l-5-5"/></svg>,
    plus:    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12h14"/></svg>,
    trash:   <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/></svg>,
    clock:   <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
    phone:   <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81a19.79 19.79 0 01-3.07-8.64A2 2 0 012 .18h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L6.09 7.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 14.92z"/></svg>,
    ticket:  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 9a3 3 0 010-6h20a3 3 0 010 6v6a3 3 0 010 6H2a3 3 0 010-6V9z"/></svg>,
    confetti:<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="5" r="1.5"/><circle cx="12" cy="3" r="1"/><circle cx="19" cy="6" r="1.5"/><path d="M3 12l4 4 8-8 4 4-4 4"/></svg>,
    qr:      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="3" height="3"/><rect x="19" y="14" width="2" height="2"/><rect x="14" y="19" width="2" height="2"/><rect x="17" y="17" width="4" height="4"/></svg>,
  };
  return <span className="portal-icon">{icons[type] || null}</span>;
};

// ─── Componente Principal ─────────────────────────────────────────────────────
export const PortalPage: React.FC = () => {
  const [step, setStep] = useState<Step>('tutor');
  const [packages, setPackages] = useState<Package[]>([]);
  const [loadingPkgs, setLoadingPkgs] = useState(true);

  // Datos del tutor
  const [tutorNombre, setTutorNombre] = useState('');
  const [tutorTelefono, setTutorTelefono] = useState('');

  // Niños
  const [ninos, setNinos] = useState<PortalChild[]>([{ nombre: '', edad: 0, paquete_id: '' }]);
  // Tab de área activa por cada niño (idx -> area string)
  const [activeAreaPerNino, setActiveAreaPerNino] = useState<Record<number, string>>({});

  // Resultado
  const [confirmCode, setConfirmCode] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [presaleExpiry, setPresaleExpiry] = useState<Date | null>(null);
  const [countdown, setCountdown] = useState('');

  useEffect(() => {
    getPublicPackages()
      .then(setPackages)
      .catch(() => setError('No se pudieron cargar los paquetes. Intenta de nuevo.'))
      .finally(() => setLoadingPkgs(false));
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
  const canGoToConfirm = ninos.every(n => n.nombre.trim() && n.edad > 0 && n.paquete_id);

  const handleSubmit = async () => {
    setIsSubmitting(true);
    setError('');
    try {
      const ninosData: PresaleChild[] = ninos.map(n => {
        const pkg = packages.find(p => p.id === n.paquete_id)!;
        return {
          nombre: n.nombre,
          edad: n.edad,
          paquete_id: n.paquete_id,
          paquete_nombre: pkg.nombre,
          area: pkg.area,
          duracion_minutos: pkg.duracion_minutos,
          precio: pkg.precio,
        };
      });

      const presale = await createPresale({
        tutor_nombre: tutorNombre,
        tutor_telefono: tutorTelefono.replace(/\D/g, ''),
        ninos: ninosData,
        total_estimado: total,
      });

      setConfirmCode('PEKES-' + presale.id.substring(0, 6).toUpperCase());
      setPresaleExpiry(new Date(presale.expires_at));
      setStep('success');
    } catch (err: any) {
      setError('Ocurrió un error al enviar tu orden. Por favor intenta de nuevo.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="portal-root">
      {/* Header */}
      <header className="portal-header">
        <div className="portal-logo-wrap">
          <div className="portal-logo-icon">
            <Icon type="star" />
          </div>
          <div>
            <h1 className="portal-brand">Mundo de Pekes</h1>
            <p className="portal-tagline">Pre-registro de Entrada</p>
          </div>
        </div>
        {step !== 'success' && (
          <div className="portal-steps-bar">
            {(['tutor','children','confirm'] as const).map((s, i) => (
              <div key={s} className={`portal-step ${step === s ? 'active' : (step === 'children' && i === 0) || (step === 'confirm' && i <= 1) ? 'done' : ''}`}>
                <div className="portal-step-dot">{((step === 'children' && i === 0) || (step === 'confirm' && i <= 1)) ? <Icon type="check" /> : i + 1}</div>
                <span>{['Tutor', 'Pekes', 'Confirmar'][i]}</span>
              </div>
            ))}
          </div>
        )}
      </header>

      <main className="portal-main">
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
                <input
                  id="portal-tutor-phone"
                  type="tel"
                  placeholder="(000) 000-0000"
                  value={formatPhone(tutorTelefono)}
                  onChange={e => setTutorTelefono(e.target.value.replace(/\D/g, '').substring(0, 10))}
                  inputMode="numeric"
                />
                <span className="portal-field-hint">Lo usamos para contactarte si es necesario</span>
              </div>
            </div>

            <div className="portal-privacy-note">
              🔒 Tus datos están protegidos y solo se usan para tu registro de entrada.
            </div>

            <button
              id="portal-btn-to-children"
              className="portal-btn portal-btn-primary"
              disabled={!canGoToChildren}
              onClick={() => setStep('children')}
            >
              Continuar <span className="btn-arrow">→</span>
            </button>
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

                      {/* Selector de paquetes por área */}
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
                Revisar Orden →
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
                <h2>Resumen de tu Orden</h2>
                <p>Verifica los datos antes de enviar</p>
              </div>
            </div>

            <div className="portal-summary">
              <div className="portal-summary-section">
                <h4>Tutor / Responsable</h4>
                <div className="portal-summary-row"><span>Nombre</span><strong>{tutorNombre}</strong></div>
                <div className="portal-summary-row"><span>Teléfono</span><strong>{formatPhone(tutorTelefono)}</strong></div>

              </div>

              <div className="portal-summary-section">
                <h4>Pekes</h4>
                {ninos.map((n, idx) => {
                  const pkg = packages.find(p => p.id === n.paquete_id);
                  return (
                    <div key={idx} className="portal-summary-child">
                      <div className="portal-summary-child-name">👦 {n.nombre}, {n.edad} años</div>
                      <div className="portal-summary-child-pkg">
                        {pkg?.nombre} · {pkg?.duracion_minutos}min · <strong>${pkg?.precio.toLocaleString('es-MX')}</strong>
                      </div>
                      <div className="portal-summary-child-area">{pkg?.area}</div>
                    </div>
                  );
                })}
              </div>

              <div className="portal-total-row">
                <span>Total Estimado</span>
                <strong className="portal-total-amount">${total.toLocaleString('es-MX')}</strong>
              </div>

              <div className="portal-expiry-note">
                <Icon type="clock" /> Tu orden estará disponible en caja por <strong>30 minutos</strong> después de enviarse.
              </div>
            </div>

            {error && <div className="portal-error">{error}</div>}

            <div className="portal-nav-row">
              <button className="portal-btn portal-btn-ghost" onClick={() => setStep('children')}>← Atrás</button>
              <button
                id="portal-btn-submit"
                className="portal-btn portal-btn-primary portal-btn-submit"
                disabled={isSubmitting}
                onClick={handleSubmit}
              >
                {isSubmitting ? <span className="portal-spinner-sm" /> : '⚡ Enviar Orden a Caja'}
              </button>
            </div>
          </div>
        )}

        {/* PASO 4: Éxito */}
        {step === 'success' && (
          <div className="portal-card portal-success-card portal-animate">
            <div className="portal-success-icon">🎉</div>
            <h2 className="portal-success-title">¡Tu orden está en camino!</h2>
            <p className="portal-success-sub">Dirígete a caja con tu código de confirmación</p>

            <div className="portal-code-box">
              <span className="portal-code-label">Tu código</span>
              <span className="portal-code" id="portal-confirm-code">{confirmCode}</span>
            </div>

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
        <p>© 2026 Mundo de Pekes · <a href="#">Aviso de Privacidad</a></p>
      </footer>
    </div>
  );
};
