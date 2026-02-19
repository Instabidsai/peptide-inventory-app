const express = require('express');
const cors = require('cors');
const { execFile } = require('child_process');
const httpsLib = require('https');
const httpLib = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const app = express();
const PORT = 9111;
const PRINTER_NAME = 'D520 Printer';

const SUMATRA = path.join(__dirname, 'node_modules', 'pdf-to-printer', 'dist', 'SumatraPDF-3.4.6-32.exe');

app.use(cors());
app.use(express.json());

// Health check
app.get('/health', (_req, res) => {
  const sumatraExists = fs.existsSync(SUMATRA);
  res.json({
    status: 'ok',
    printer: PRINTER_NAME,
    sumatraReady: sumatraExists,
  });
});

// Download a file from URL to a temp path, following redirects
function downloadFile(url) {
  return new Promise((resolve, reject) => {
    const tmpFile = path.join(os.tmpdir(), `label-${Date.now()}.pdf`);

    const request = (downloadUrl) => {
      const client = downloadUrl.startsWith('https') ? httpsLib : httpLib;
      client.get(downloadUrl, (response) => {
        if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
          return request(response.headers.location);
        }
        if (response.statusCode !== 200) {
          return reject(new Error(`Download failed: HTTP ${response.statusCode}`));
        }
        const file = fs.createWriteStream(tmpFile);
        response.pipe(file);
        file.on('finish', () => { file.close(); resolve(tmpFile); });
        file.on('error', (err) => { fs.unlink(tmpFile, () => {}); reject(err); });
      }).on('error', reject);
    };

    request(url);
  });
}

// Print via SumatraPDF silently to the named printer
function printPdf(filePath, printerName) {
  return new Promise((resolve, reject) => {
    // Shipping labels are 4x6 portrait PDFs — print as-is without rotation or scaling
    // "portrait" prevents rotation, "noscale" prints at actual size (1:1 for 4x6 on 4x6 label stock)
    const args = ['-print-to', printerName, '-print-settings', 'noscale,portrait', '-silent', filePath];
    execFile(SUMATRA, args, { timeout: 30000 }, (err, stdout, stderr) => {
      if (err) return reject(new Error(`SumatraPDF error: ${err.message}`));
      resolve({ stdout, stderr });
    });
  });
}

// Print a shipping label PDF directly to the label printer
app.post('/print', async (req, res) => {
  const { url } = req.body;
  if (!url) {
    return res.status(400).json({ error: 'url is required' });
  }

  let tmpFile = null;
  try {
    console.log(`[print] Downloading: ${url}`);
    tmpFile = await downloadFile(url);
    console.log(`[print] Downloaded to: ${tmpFile}`);

    console.log(`[print] Sending to printer: ${PRINTER_NAME}`);
    await printPdf(tmpFile, PRINTER_NAME);
    console.log(`[print] Print job sent successfully`);

    res.json({ status: 'ok', printer: PRINTER_NAME });
  } catch (err) {
    console.error(`[print] Error:`, err);
    res.status(500).json({ error: err.message });
  } finally {
    if (tmpFile) {
      setTimeout(() => fs.unlink(tmpFile, () => {}), 10000);
    }
  }
});

// Start both HTTP and HTTPS servers
// HTTPS is needed because the web app runs on https:// and browsers block mixed content
const certPath = path.join(__dirname, 'cert.pem');
const keyPath = path.join(__dirname, 'key.pem');

if (fs.existsSync(certPath) && fs.existsSync(keyPath)) {
  const sslOptions = {
    key: fs.readFileSync(keyPath),
    cert: fs.readFileSync(certPath),
  };
  httpsLib.createServer(sslOptions, app).listen(PORT, () => {
    console.log(`Label print service running on https://localhost:${PORT}`);
    console.log(`Target printer: ${PRINTER_NAME}`);
    console.log(`SumatraPDF: ${fs.existsSync(SUMATRA) ? 'Ready' : 'MISSING'}`);
  });
  // Also listen on HTTP as fallback for local dev
  httpLib.createServer(app).listen(PORT + 1, () => {
    console.log(`HTTP fallback on http://localhost:${PORT + 1}`);
  });
} else {
  app.listen(PORT, () => {
    console.log(`Label print service running on http://localhost:${PORT} (no SSL certs found)`);
    console.log(`Target printer: ${PRINTER_NAME}`);
    console.log(`SumatraPDF: ${fs.existsSync(SUMATRA) ? 'Ready' : 'MISSING'}`);
  });
}
