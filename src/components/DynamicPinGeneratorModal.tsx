import React, { useState, useEffect } from 'react';
import styles from './DynamicPinGeneratorModal.module.css';
import { dynamicPinService, type DynamicPin, type CreatePinResult } from '../lib/dynamicPinService';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faKey, faShieldAlt, faTimes, faCopy, faCheck, faSpinner, faClock, faTrash, faHistory, faExclamationTriangle } from '@fortawesome/free-solid-svg-icons';
import { faWhatsapp } from '@fortawesome/free-brands-svg-icons';

interface DynamicPinGeneratorModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const PRESET_MOTIVOS = [
  'Ajuste de Stock (Entrada/Salida)',
  'Descuento Especial / Cortesía',
  'Cancelación / Reembolso',
  'Apertura Manual de Caja',
  'Retiro de Efectivo',
  'Modificación de Tarifa / Tiempo',
  'Otro motivo...'
];

const PRESET_VIGENCIAS = [
  { label: '15 min (Recomendado)', value: 15 },
  { label: '30 min', value: 30 },
  { label: '1 hora', value: 60 },
  { label: 'Todo el día (12h)', value: 720 }
];

export const DynamicPinGeneratorModal: React.FC<DynamicPinGeneratorModalProps> = ({ isOpen, onClose }) => {
  const [selectedMotivo, setSelectedMotivo] = useState(PRESET_MOTIVOS[0]);
  const [customMotivo, setCustomMotivo] = useState('');
  const [vigenciaMinutos, setVigenciaMinutos] = useState(15);
  const [isGenerating, setIsGenerating] = useState(false);
  const [createdPin, setCreatedPin] = useState<CreatePinResult | null>(null);
  const [copied, setCopied] = useState(false);
  const [recentPins, setRecentPins] = useState<DynamicPin[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [error, setError] = useState('');

  const loadHistory = async () => {
    setIsLoadingHistory(true);
    try {
      const pins = await dynamicPinService.getRecentPins();
      setRecentPins(pins);
    } catch {
      // Ignorar fallo de historial silenciosamente
    } finally {
      setIsLoadingHistory(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadHistory();
      setCreatedPin(null);
      setError('');
      setCopied(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleGeneratePin = async () => {
    setIsGenerating(true);
    setError('');
    setCreatedPin(null);
    setCopied(false);

    const finalMotivo = selectedMotivo === 'Otro motivo...' 
      ? (customMotivo.trim() || 'Autorización Administrativa') 
      : selectedMotivo;

    try {
      const result = await dynamicPinService.createPin(finalMotivo, vigenciaMinutos);
      if (result.success && result.pin) {
        setCreatedPin(result);
        loadHistory();
      } else {
        setError(result.error || 'No se pudo generar el PIN. Verifique permisos de Administrador.');
      }
    } catch (err: any) {
      setError(err.message || 'Error inesperado al generar PIN.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopyPin = async () => {
    if (!createdPin?.pin) return;
    try {
      await navigator.clipboard.writeText(createdPin.pin);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Fallback
    }
  };

  const handleRevokePin = async (pinId: string) => {
    const success = await dynamicPinService.revokePin(pinId);
    if (success) {
      loadHistory();
      if (createdPin?.id === pinId) {
        setCreatedPin(null);
      }
    }
  };

  const finalMotivo = selectedMotivo === 'Otro motivo...' 
    ? (customMotivo.trim() || 'Autorización') 
    : selectedMotivo;

  const expiraDate = createdPin?.expira_en ? new Date(createdPin.expira_en) : undefined;
  const whatsappUrl = createdPin?.pin 
    ? dynamicPinService.buildWhatsAppShareUrl(createdPin.pin, finalMotivo, expiraDate)
    : '#';

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        {/* Header */}
        <div className={styles.header}>
          <FontAwesomeIcon icon={faShieldAlt} className={styles.headerIcon} />
          <div>
            <h3 className={styles.headerTitle}>Generador de PIN Dinámico</h3>
            <p className={styles.headerSubtitle}>Autorización remota de 1 solo uso (OTP)</p>
          </div>
          <button onClick={onClose} className={styles.closeBtn}>
            <FontAwesomeIcon icon={faTimes} />
          </button>
        </div>

        {/* Body */}
        <div className={styles.body}>
          {/* Motivo de la autorización */}
          <div>
            <div className={styles.sectionTitle}>Motivo de la Autorización</div>
            <div className={styles.chipGrid}>
              {PRESET_MOTIVOS.map((motivo) => (
                <button
                  key={motivo}
                  type="button"
                  className={`${styles.chip} ${selectedMotivo === motivo ? styles.chipActive : ''}`}
                  onClick={() => setSelectedMotivo(motivo)}
                >
                  {motivo}
                </button>
              ))}
            </div>
            {selectedMotivo === 'Otro motivo...' && (
              <input
                type="text"
                placeholder="Escribe el motivo del movimiento..."
                className={styles.inputCustom}
                value={customMotivo}
                onChange={(e) => setCustomMotivo(e.target.value)}
                maxLength={80}
                autoFocus
              />
            )}
          </div>

          {/* Vigencia / Caducidad */}
          <div>
            <div className={styles.sectionTitle}>Vigencia Máxima</div>
            <div className={styles.chipGrid}>
              {PRESET_VIGENCIAS.map((v) => (
                <button
                  key={v.value}
                  type="button"
                  className={`${styles.chip} ${vigenciaMinutos === v.value ? styles.chipActive : ''}`}
                  onClick={() => setVigenciaMinutos(v.value)}
                >
                  <FontAwesomeIcon icon={faClock} style={{ marginRight: '0.3rem' }} />
                  {v.label}
                </button>
              ))}
            </div>
          </div>

          {/* Botón de Generar */}
          <button
            type="button"
            className={styles.generateBtn}
            onClick={handleGeneratePin}
            disabled={isGenerating}
          >
            {isGenerating ? (
              <>
                <FontAwesomeIcon icon={faSpinner} spin />
                Generando PIN Seguro...
              </>
            ) : (
              <>
                <FontAwesomeIcon icon={faKey} />
                Generar Nuevo PIN OTP
              </>
            )}
          </button>

          {error && (
            <div style={{ color: '#ef4444', fontSize: '0.85rem', textAlign: 'center', background: '#fee2e2', padding: '0.5rem', borderRadius: '0.5rem' }}>
              <FontAwesomeIcon icon={faExclamationTriangle} style={{ marginRight: '0.4rem' }} />
              {error}
            </div>
          )}

          {/* Tarjeta de PIN Generado */}
          {createdPin && createdPin.pin && (
            <div className={styles.pinDisplayCard}>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#166534', textTransform: 'uppercase' }}>
                PIN Creado con Éxito (1 Solo Uso)
              </div>
              <div className={styles.pinCode}>
                {createdPin.pin}
              </div>
              <div className={styles.pinMeta}>
                <span>Válido hasta: {expiraDate ? expiraDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '15 min'}</span>
                <span>•</span>
                <span>{createdPin.motivo}</span>
              </div>

              <div className={styles.actionButtons}>
                <button type="button" className={styles.copyBtn} onClick={handleCopyPin}>
                  <FontAwesomeIcon icon={copied ? faCheck : faCopy} />
                  {copied ? '¡Copiado!' : 'Copiar PIN'}
                </button>
                <a
                  href={whatsappUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.whatsappBtn}
                >
                  <FontAwesomeIcon icon={faWhatsapp} style={{ fontSize: '1.1rem' }} />
                  Enviar por WhatsApp
                </a>
              </div>
            </div>
          )}

          {/* Historial de PINs de Hoy */}
          <div>
            <div className={styles.sectionTitle} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span>
                <FontAwesomeIcon icon={faHistory} style={{ marginRight: '0.35rem' }} />
                PINs Generados Recientemente
              </span>
              <button 
                type="button" 
                onClick={loadHistory} 
                style={{ background: 'none', border: 'none', color: '#02457a', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600 }}
              >
                Actualizar
              </button>
            </div>

            {isLoadingHistory && (
              <div style={{ textAlign: 'center', padding: '1rem', color: '#94a3b8', fontSize: '0.8rem' }}>
                <FontAwesomeIcon icon={faSpinner} spin style={{ marginRight: '0.3rem' }} />
                Cargando historial...
              </div>
            )}

            {!isLoadingHistory && recentPins.length === 0 && (
              <div style={{ textAlign: 'center', padding: '0.75rem', color: '#94a3b8', fontSize: '0.8rem' }}>
                No hay PINs dinámicos generados hoy.
              </div>
            )}

            {!isLoadingHistory && recentPins.length > 0 && (
              <div className={styles.historyList}>
                {recentPins.map((p) => {
                  const isExpired = new Date(p.expira_en) < new Date();
                  let statusBadge = (
                    <span className={styles.statusActive}>
                      🟢 Activo ({new Date(p.expira_en).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})
                    </span>
                  );

                  if (p.revocado) {
                    statusBadge = <span className={styles.statusExpired}>🚫 Revocado</span>;
                  } else if (p.usado) {
                    statusBadge = (
                      <span className={styles.statusUsed} title={`Usado por ${p.usuario_consumidor_nombre || 'Usuario'}`}>
                        🔵 Usado por {p.usuario_consumidor_nombre || 'Cajero'}
                      </span>
                    );
                  } else if (isExpired) {
                    statusBadge = <span className={styles.statusExpired}>⚪ Expirado</span>;
                  }

                  return (
                    <div key={p.id} className={styles.historyItem}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <span className={styles.pinBadge}>{p.pin_codigo}</span>
                          {statusBadge}
                        </div>
                        <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '0.15rem' }}>
                          {p.motivo} {p.accion_autorizada ? `• ${p.accion_autorizada}` : ''}
                        </div>
                      </div>

                      {!p.usado && !p.revocado && !isExpired && (
                        <button
                          type="button"
                          className={styles.revokeBtn}
                          onClick={() => handleRevokePin(p.id)}
                          title="Cancelar este PIN para que ya no pueda usarse"
                        >
                          <FontAwesomeIcon icon={faTrash} style={{ marginRight: '0.2rem' }} />
                          Cancelar
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
