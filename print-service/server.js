const express = require('express');
const cors = require('cors');
const { execFile } = require('child_process');
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const app = express();
const PORT = 9111;
const PRINTER_NAME = 'D520 Printer';

// SumatraPDF bundled with pdf-to-printer — silent PDF printing on Windows
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
      const client = downloadUrl.startsWith('https') ? https : http;
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
    // -print-to "Printer" -silent  = print without opening a window
    const args = ['-print-to', printerName, '-silent', filePath];
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

app.listen(PORT, () => {
  console.log(`Label print service running on http://localhost:${PORT}`);
  console.log(`Target printer: ${PRINTER_NAME}`);
  console.log(`SumatraPDF: ${fs.existsSync(SUMATRA) ? 'Ready' : 'MISSING'}`);
  console.log(`Endpoints:`);
  console.log(`  GET  /health  — check service status`);
  console.log(`  POST /print   — { url: "https://..." } → prints to ${PRINTER_NAME}`);
});
