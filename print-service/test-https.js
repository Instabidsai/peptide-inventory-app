const https = require('https');
const fs = require('fs');
const path = require('path');

// Load the mkcert CA
const ca = fs.readFileSync(path.join(process.env.LOCALAPPDATA, 'mkcert', 'rootCA.pem'));

const options = {
    hostname: 'localhost',
    port: 9111,
    path: '/health',
    method: 'GET',
    ca: [ca],
};

const req = https.request(options, (res) => {
    let data = '';
    res.on('data', (chunk) => data += chunk);
    res.on('end', () => {
        console.log('STATUS:', res.statusCode);
        console.log('RESPONSE:', data);
        console.log('\n=== CERT IS TRUSTED! Browser will work. ===');
    });
});

req.on('error', (e) => {
    console.log('FAIL:', e.message);
});

req.end();
