import React from 'react';

/**
 * Componente de código QR para el Backoffice.
 * Apunta al portal público (/portal) de Mundo de Pekes.
 * Usa la API de QR Code open-source sin dependencias adicionales.
 */

interface PortalQRProps {
  /** URL base del sistema, ej: https://tudominio.com */
  baseUrl?: string;
}

export const PortalQR: React.FC<PortalQRProps> = ({ baseUrl }) => {
  const portalUrl = `${baseUrl || window.location.origin}/portal`;

  // Genera el QR usando la API pública de QR Server (no requiere instalación)
  const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=256x256&data=${encodeURIComponent(portalUrl)}&bgcolor=ffffff&color=4f46e5&margin=16`;

  const handlePrint = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Portal QR - Mundo de Pekes</title>
        <meta charset="UTF-8">
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;700;900&display=swap');
          body {
            font-family: 'Outfit', sans-serif;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            margin: 0;
            background: white;
            color: #1e1b4b;
          }
          .card {
            text-align: center;
            border: 3px solid #7c3aed;
            border-radius: 24px;
            padding: 2.5rem 3rem;
            max-width: 400px;
          }
          h1 { font-size: 2rem; font-weight: 900; margin: 0 0 0.25rem; color: #7c3aed; }
          .sub { font-size: 0.9rem; color: #6b7280; margin-bottom: 1.5rem; }
          img { width: 240px; height: 240px; display: block; margin: 0 auto 1.5rem; }
          .steps { text-align: left; font-size: 0.85rem; color: #374151; line-height: 1.6; }
          .steps strong { color: #7c3aed; }
          .url { font-size: 0.75rem; color: #9ca3af; margin-top: 1.25rem; word-break: break-all; }
          @media print { body { -webkit-print-color-adjust: exact; } }
        </style>
      </head>
      <body>
        <div class="card">
          <h1>🌟 Mundo de Pekes</h1>
          <p class="sub">Pre-registro de Entrada Rápida</p>
          <img src="${qrApiUrl}" alt="QR Portal" />
          <div class="steps">
            <strong>¿Cómo funciona?</strong><br>
            1. Escanea el código con tu cámara<br>
            2. Llena los datos del tutor y los pekes<br>
            3. Elige el paquete de tiempo<br>
            4. ¡Tu orden llegará directo a caja!<br><br>
            <em>Evita filas — ¡ingresa más rápido!</em>
          </div>
          <p class="url">${portalUrl}</p>
        </div>
        <script>window.onload = () => window.print();</script>
      </body>
      </html>
    `);
    printWindow.document.close();
  };

  return (
    <div style={{
      background: 'var(--surface-primary, #fff)',
      border: '1.5px solid var(--border-primary, #e5e7eb)',
      borderRadius: '1.25rem',
      padding: '1.75rem',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: '1.25rem',
      maxWidth: '320px',
    }}>
      {/* Título */}
      <div style={{ textAlign: 'center' }}>
        <h3 style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--text-primary, #1e293b)', margin: 0 }}>
          Portal de Clientes
        </h3>
        <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary, #64748b)', marginTop: '4px' }}>
          Código QR para recepción
        </p>
      </div>

      {/* QR Image */}
      <div style={{
        padding: '12px',
        background: 'white',
        borderRadius: '12px',
        border: '2px solid #ede9fe',
        boxShadow: '0 4px 16px rgba(124,58,237,.1)',
      }}>
        <img
          src={qrApiUrl}
          alt="QR Portal Público"
          width={200}
          height={200}
          style={{ display: 'block', borderRadius: '6px' }}
        />
      </div>

      {/* URL */}
      <div style={{
        background: '#f8fafc',
        border: '1px solid #e2e8f0',
        borderRadius: '8px',
        padding: '0.6rem 0.85rem',
        width: '100%',
        textAlign: 'center',
      }}>
        <div style={{ fontSize: '0.65rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700, marginBottom: '2px' }}>
          URL del Portal
        </div>
        <div style={{ fontSize: '0.8rem', color: '#7c3aed', fontWeight: 700, wordBreak: 'break-all' }}>
          {portalUrl}
        </div>
      </div>

      {/* Info note */}
      <div style={{
        background: '#fffbeb',
        border: '1px solid #fde68a',
        borderRadius: '8px',
        padding: '0.65rem 0.85rem',
        fontSize: '0.76rem',
        color: '#92400e',
        width: '100%',
        textAlign: 'left',
        lineHeight: 1.5,
      }}>
        📌 <strong>Cómo usarlo:</strong> Imprime este QR y pégalo en la recepción. Los clientes lo escanean para pre-registrarse antes de llegar a caja.
      </div>

      {/* Buttons */}
      <div style={{ display: 'flex', gap: '0.6rem', width: '100%' }}>
        <button
          id="portal-qr-print-btn"
          onClick={handlePrint}
          style={{
            flex: 1,
            padding: '0.75rem',
            background: 'linear-gradient(135deg, #7c3aed, #4f46e5)',
            color: 'white',
            border: 'none',
            borderRadius: '10px',
            fontWeight: 800,
            fontSize: '0.85rem',
            cursor: 'pointer',
            boxShadow: '0 3px 10px rgba(124,58,237,.3)',
          }}
        >
          🖨️ Imprimir QR
        </button>
        <a
          href={portalUrl}
          target="_blank"
          rel="noreferrer"
          id="portal-qr-open-btn"
          style={{
            flex: 1,
            padding: '0.75rem',
            background: '#f3f4f6',
            color: '#374151',
            border: 'none',
            borderRadius: '10px',
            fontWeight: 700,
            fontSize: '0.85rem',
            cursor: 'pointer',
            textDecoration: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            textAlign: 'center',
          }}
        >
          🔗 Abrir Portal
        </a>
      </div>
    </div>
  );
};
