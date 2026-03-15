import fs from 'fs';
import path from 'path';
import selfsigned from 'selfsigned';
import os from 'os';

// Get local IPv4 address
function getLocalIp() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) {
                return iface.address;
            }
        }
    }
    return '127.0.0.1';
}

const ip = getLocalIp();

const attrs = [
    { name: 'commonName', value: 'localhost' },
];

const opts = {
    days: 365,
    extensions: [{
        name: 'subjectAltName',
        altNames: [
            { type: 2, value: ip },
            { type: 2, value: '127.0.0.1' },
            { type: 2, value: 'localhost' }
        ]
    }]
};

console.log(`Generating self-signed certificate for IP: ${ip}...`);

async function generate() {
    try {
        const pems = await selfsigned.generate(attrs, opts);

        fs.writeFileSync(path.join(process.cwd(), 'cert.pem'), pems.cert);
        fs.writeFileSync(path.join(process.cwd(), 'key.pem'), pems.private);

        console.log('✅ Generated cert.pem and key.pem successfully.');
    } catch (error) {
        console.error('❌ Error generating certificates:', error);
    }
}

generate();
