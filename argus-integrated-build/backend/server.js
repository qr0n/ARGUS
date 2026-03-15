import fs from 'fs';
import path from 'path';
import express from 'express';
import https from 'https';
import { WebSocketServer } from 'ws';
import os from 'os';
import multer from 'multer';

// Get local IPv4 address for logging
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

const PORT = 3000;
const IP = getLocalIp();

const app = express();

// Explicit CORS Bypass for Vite Localhost
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, DELETE');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});

// Verify certs exist
try {
    fs.accessSync('cert.pem', fs.constants.R_OK);
    fs.accessSync('key.pem', fs.constants.R_OK);
} catch (e) {
    console.error('❌ SSL Certificates not found. Run `npm run setup` first.');
    process.exit(1);
}

const sslOptions = {
    key: fs.readFileSync('key.pem'),
    cert: fs.readFileSync('cert.pem')
};

const server = https.createServer(sslOptions, app);
const wss = new WebSocketServer({ server });

// Connections
let streamer = null;
const viewers = new Set();

wss.on('connection', (ws, req) => {
    const isStreamer = req.url === '/ws-stream';

    if (isStreamer) {
        console.log('📱 Streamer connected');
        streamer = ws;
        viewers.forEach(viewer => {
            if (streamer.readyState === ws.OPEN) streamer.send(JSON.stringify({ type: 'viewer-ready' }));
            if (viewer.readyState === ws.OPEN) viewer.send(JSON.stringify({ type: 'streamer-present' }));
        });
    } else {
        // Treat any other WS path as viewer (e.g., /ws-view)
        console.log('💻 Viewer connected');
        viewers.add(ws);
        if (streamer && streamer.readyState === ws.OPEN) {
            streamer.send(JSON.stringify({ type: 'viewer-ready' }));
            if (ws.readyState === ws.OPEN) ws.send(JSON.stringify({ type: 'streamer-present' }));
        }
    }

    ws.on('message', (message) => {
        // Relay everything
        if (isStreamer) {
            viewers.forEach(viewer => {
                if (viewer.readyState === ws.OPEN) {
                    viewer.send(message.toString());
                }
            });
        } else if (!isStreamer && streamer && streamer.readyState === ws.OPEN) {
            streamer.send(message.toString());
        }
    });

    ws.on('close', () => {
        if (isStreamer) {
            console.log('📱 Streamer disconnected');
            streamer = null;
            viewers.forEach(viewer => {
                if (viewer.readyState === ws.OPEN) viewer.send(JSON.stringify({ type: 'streamer-gone' }))
            });
        } else {
            console.log('💻 Viewer disconnected');
            viewers.delete(ws);
            if (streamer && streamer.readyState === ws.OPEN) streamer.send(JSON.stringify({ type: 'viewer-gone' }));
        }
    });
});

// App routing and static files
app.use('/public', express.static(path.join(process.cwd(), 'public')));
app.use('/models', express.static(path.join(process.cwd(), 'models')));
app.use('/dataset', express.static(path.join(process.cwd(), 'dataset')));

// Create dataset/public dirs if not present
if (!fs.existsSync('dataset')) fs.mkdirSync('dataset');
if (!fs.existsSync('public')) fs.mkdirSync('public');

app.get('/stream-video', (req, res) => {
    res.sendFile(path.join(process.cwd(), 'public', 'stream-video.html'));
});

app.get('/view-stream', (req, res) => {
    res.sendFile(path.join(process.cwd(), 'public', 'view-stream.html'));
});

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, path.join(process.cwd(), 'dataset'));
    },
    filename: (req, file, cb) => {
        const subject = req.body.subject || 'Unknown';
        const safeSubject = subject.replace(/[^a-zA-Z0-9]/g, '_');
        const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
        cb(null, safeSubject + ext);
    }
});
const upload = multer({ storage });

app.post('/dataset/upload', upload.single('photo'), (req, res) => {
    if (!req.file) return res.status(400).json({ success: false, error: 'No file uploaded' });
    res.json({ success: true, file: req.file.filename });
});

app.delete('/dataset/:filename', (req, res) => {
    const filename = req.params.filename;
    if (filename.includes('..') || filename.includes('/')) {
        return res.status(403).json({ success: false, error: 'Invalid config' });
    }
    const filepath = path.join(process.cwd(), 'dataset', filename);
    if (!fs.existsSync(filepath)) {
        return res.status(404).json({ success: false, error: 'File not found' });
    }
    fs.unlinkSync(filepath);
    res.json({ success: true });
});

app.get('/dataset', (req, res) => {
    try {
        const files = fs.readdirSync(path.join(process.cwd(), 'dataset'));
        const images = files.filter(f => f.toLowerCase().endsWith('.jpg') || f.toLowerCase().endsWith('.png') || f.toLowerCase().endsWith('.jpeg'));
        res.json(images);
    } catch (e) {
        res.status(500).json({ error: 'Failed to read dataset directory' });
    }
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`
      ✅ ARGUS Live Camera Server Running (HTTPS API & WSS over TLS)
      📡 Network IP    : https://${IP}:${PORT}
      🖥️  Localhost     : https://localhost:${PORT}
  
      🔗 1) Open Viewer on Laptop : https://${IP}:${PORT}/view-stream
      🔗 2) Open Streamer on Phone: https://${IP}:${PORT}/stream-video
  
      [!] IMPORTANT regarding Self-Signed Certificates [!]
      If WebSockets fail to connect, ensure you have clicked "Advanced" -> "Proceed" 
      on BOTH laptop and phone to bypass the Chrome/Safari certificate warnings.
    `);
});
