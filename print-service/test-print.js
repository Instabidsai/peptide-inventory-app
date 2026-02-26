const https = require('https');
const fs = require('fs');
const path = require('path');

// Load the mkcert CA
const ca = fs.readFileSync(path.join(process.env.LOCALAPPDATA, 'mkcert', 'rootCA.pem'));

// Use a small public test PDF
const testPdfUrl = 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf';

const body = JSON.stringify({ url: testPdfUrl });

const options = {
    hostname: 'localhost',
    port: 9111,
    path: '/print',
    method: 'POST',
    ca: [ca],
    headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
    },
};

console.log('Sending test PDF to D520 printer via HTTPS...');
const req = https.request(options, (res) => {
    let data = '';
    res.on('data', (chunk) => data += chunk);
    res.on('end', () => {
        console.log('STATUS:', res.statusCode);
        console.log('RESPONSE:', data);
        if (res.statusCode === 200) {
            console.log('\n=== PRINT JOB SENT SUCCESSFULLY! Check the D520 printer. ===');
        } else {
            console.log('\n=== PRINT FAILED ===');
        }
    });
});

req.on('error', (e) => console.log('FAIL:', e.message));
req.write(body);
req.end();
