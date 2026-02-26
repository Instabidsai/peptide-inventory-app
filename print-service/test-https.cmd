@echo off
set "NODE_EXTRA_CA_CERTS=C:\Users\Not John Or Justin\AppData\Local\mkcert\rootCA.pem"
node -e "fetch('https://localhost:9111/health').then(r=>r.json()).then(d=>console.log('TRUSTED HTTPS:', JSON.stringify(d))).catch(e=>console.log('FAIL:', e.cause ? e.cause.message : e.message))"
