/**
 * Agente Local de Impresion - Mundo de Pekes
 * ============================================
 * Metodos CONFIRMADOS en prueba real:
 *   Tickets  -> Epson TM-T20II   (POS)                    via copy /b
 *   Pulseras -> Zebra ZD510-300dpi ZPL                     via copy /b
 *
 * Uso: node index.js
 * Puerto: 3000
 */

const express  = require('express');
const cors     = require('cors');
const { exec } = require('child_process');
const os   = require('os');
const fs   = require('fs');
const path = require('path');

const app  = express();
const PORT = process.env.PORT || 3000;

// Impresoras activas (confirmadas en este equipo)
let ticketPrinter    = process.env.TICKET_PRINTER    || 'POS';
let wristbandPrinter = process.env.WRISTBAND_PRINTER || 'ZDesigner ZD510-300dpi ZPL';

app.use(cors({ origin: '*' }));
app.use(express.json());
app.use(express.text({ type: 'text/plain', limit: '1mb' }));

// ── Pagina de estado ──────────────────────────────────────────────────────────
app.get('/', (req, res) => {
    res.send(`<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Agente de Impresion - Mundo de Pekes</title>
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
           background:#0f172a; color:#e2e8f0; min-height:100vh;
           display:flex; align-items:center; justify-content:center; }
    .card { background:#1e293b; border:1px solid #334155; border-radius:20px;
            padding:3rem; max-width:520px; width:90%; text-align:center;
            box-shadow:0 25px 50px rgba(0,0,0,0.5); }
    .badge { display:inline-flex; align-items:center; gap:8px;
             background:#022c22; color:#4ade80; border:1.5px solid #16a34a;
             border-radius:999px; padding:6px 16px; font-weight:700;
             font-size:0.85rem; margin-bottom:1.5rem; }
    .dot { width:8px; height:8px; background:#4ade80; border-radius:50%;
           animation:pulse 1.5s infinite; }
    @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }
    h1 { font-size:1.5rem; margin-bottom:0.5rem; color:#f1f5f9; }
    .sub { color:#94a3b8; margin-bottom:1.5rem; font-size:0.9rem; }
    .printers { display:grid; grid-template-columns:1fr 1fr; gap:1rem; margin-bottom:1.5rem; }
    .pcard { background:#0f172a; border-radius:12px; padding:1rem; text-align:left; }
    .pcard .label { font-size:0.7rem; text-transform:uppercase; color:#64748b; font-weight:700; margin-bottom:4px; }
    .pcard .name { color:#fbbf24; font-weight:600; font-size:0.85rem; }
    .pcard .ok { color:#4ade80; font-size:0.75rem; margin-top:2px; }
    .endpoints { background:#0f172a; border-radius:12px; padding:1.25rem;
                 text-align:left; }
    .ep { display:flex; align-items:center; gap:10px; padding:5px 0;
          border-bottom:1px solid #1e293b; font-size:0.82rem; }
    .ep:last-child { border:none; }
    .method { background:#1d4ed8; color:#bfdbfe; border-radius:4px;
              padding:2px 7px; font-size:0.72rem; font-weight:700; min-width:38px; text-align:center; }
    .method.post { background:#065f46; color:#a7f3d0; }
    code { color:#67e8f9; font-family:monospace; }
  </style>
</head>
<body>
  <div class="card">
    <div class="badge"><div class="dot"></div> ACTIVO</div>
    <h1>Agente de Impresion</h1>
    <p class="sub">Mundo de Pekes &mdash; Puerto ${PORT} &mdash; ${os.hostname()}</p>
    <div class="printers">
      <div class="pcard">
        <div class="label">Tickets (ESC/POS)</div>
        <div class="name">${ticketPrinter}</div>
        <div class="ok">&#10003; Epson TM-T20II</div>
      </div>
      <div class="pcard">
        <div class="label">Pulseras (ZPL)</div>
        <div class="name">${wristbandPrinter.replace('ZDesigner ', '')}</div>
        <div class="ok">&#10003; Zebra ZD510</div>
      </div>
    </div>
    <div class="endpoints">
      <div class="ep"><span class="method">GET</span><code>/health</code> &mdash; Estado</div>
      <div class="ep"><span class="method">GET</span><code>/printers</code> &mdash; Listar impresoras</div>
      <div class="ep"><span class="method post">POST</span><code>/print</code> &mdash; Imprimir ticket ESC/POS</div>
      <div class="ep"><span class="method post">POST</span><code>/print-wristband</code> &mdash; Imprimir pulsera ZPL</div>
      <div class="ep"><span class="method post">POST</span><code>/config</code> &mdash; Configurar impresoras</div>
    </div>
  </div>
</body>
</html>`);
});

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
    res.json({
        status:          'ok',
        version:         '1.2.0',
        ticketPrinter,
        wristbandPrinter,
        platform:        os.platform(),
        hostname:        os.hostname(),
        tiempo:          new Date().toISOString()
    });
});

// ── Listar impresoras instaladas en Windows ───────────────────────────────────
app.get('/printers', (req, res) => {
    exec('wmic printer get Name /format:list', (error, stdout) => {
        if (error) return res.status(500).json({ error: error.message });
        const printers = stdout
            .split('\n')
            .filter(l => l.startsWith('Name='))
            .map(l => l.replace('Name=', '').trim())
            .filter(Boolean);
        res.json({ printers });
    });
});

// ── Configurar impresoras ─────────────────────────────────────────────────────
app.post('/config', (req, res) => {
    if (req.body.ticketPrinter)    ticketPrinter    = req.body.ticketPrinter;
    if (req.body.wristbandPrinter) wristbandPrinter = req.body.wristbandPrinter;
    // Compatibilidad con campo generico "printer"
    if (req.body.printer)          ticketPrinter    = req.body.printer;
    console.log(`[CONFIG] Tickets:"${ticketPrinter}"  Pulseras:"${wristbandPrinter}"`);
    res.json({ ok: true, ticketPrinter, wristbandPrinter });
});

// ── Imprimir ticket ESC/POS ───────────────────────────────────────────────────
app.post('/print', async (req, res) => {
    try {
        const content = typeof req.body === 'string' ? req.body : (req.body?.content || '');
        const printer = req.body?.printerName || ticketPrinter;

        if (!content) return res.status(400).json({ error: 'Sin contenido' });

        console.log(`[TICKET] -> "${printer}" (${content.length} bytes)`);
        await copyBinToPrinter(content, printer, 'latin1');
        res.json({ ok: true, message: 'Ticket enviado correctamente' });
    } catch (err) {
        console.error('[TICKET ERROR]', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ── Imprimir pulsera ZPL ──────────────────────────────────────────────────────
app.post('/print-wristband', async (req, res) => {
    try {
        const content = typeof req.body === 'string' ? req.body : (req.body?.content || '');
        const printer = req.body?.printerName || wristbandPrinter;

        if (!content) return res.status(400).json({ error: 'Sin contenido ZPL' });

        console.log(`[PULSERA] -> "${printer}" (${content.length} bytes)`);
        await copyBinToPrinter(content, printer, 'ascii');
        res.json({ ok: true, message: 'Pulsera enviada correctamente' });
    } catch (err) {
        console.error('[PULSERA ERROR]', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ── Core: copy /b \\HOSTNAME\Impresora ────────────────────────────────────────
// Metodo CONFIRMADO con Epson TM-T20II y Zebra ZD510 en este equipo
function copyBinToPrinter(content, printer, encoding) {
    return new Promise((resolve, reject) => {
        const tmpFile = path.join(os.tmpdir(), `print_${Date.now()}_${Math.floor(Math.random() * 1000)}.prn`);
        fs.writeFileSync(tmpFile, Buffer.from(content, encoding || 'latin1'));

        const target = '\\\\' + os.hostname() + '\\' + printer;
        const cmd    = 'cmd /c copy /b "' + tmpFile + '" "' + target + '"';

        console.log('[CMD] ' + cmd);
        exec(cmd, (error, stdout, stderr) => {
            try { fs.unlinkSync(tmpFile); } catch (_) {}

            const out = (stdout + stderr).toLowerCase();
            if (out.includes('copiado') || out.includes('copied')) {
                console.log('[OK] Impresion enviada');
                resolve();
            } else {
                const msg = stdout.trim() || stderr.trim() || 'Error al imprimir';
                console.error('[FAIL]', msg);
                reject(new Error(msg));
            }
        });
    });
}

// ── Arrancar servidor ─────────────────────────────────────────────────────────
app.listen(PORT, '127.0.0.1', () => {
    console.log('');
    console.log('╔══════════════════════════════════════════════════╗');
    console.log('║      AGENTE DE IMPRESION - MUNDO DE PEKES        ║');
    console.log('╠══════════════════════════════════════════════════╣');
    console.log('║  URL:      http://localhost:' + PORT + '                  ║');
    console.log('║  Tickets:  ' + ticketPrinter.padEnd(38) + '║');
    console.log('║  Pulseras: ' + wristbandPrinter.substring(0,38).padEnd(38) + '║');
    console.log('╠══════════════════════════════════════════════════╣');
    console.log('║  POST /print              Ticket ESC/POS         ║');
    console.log('║  POST /print-wristband    Pulsera ZPL            ║');
    console.log('║  GET  /health             Estado                 ║');
    console.log('║  GET  /printers           Lista impresoras       ║');
    console.log('╚══════════════════════════════════════════════════╝');
    console.log('');
});
