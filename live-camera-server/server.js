import fs from 'fs';
import path from 'path';
import express from 'express';
import https from 'https';
import { WebSocketServer } from 'ws';
import os from 'os';

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
const DATASET_DIR = path.join(process.cwd(), 'dataset');

const app = express();

// Explicit CORS Bypass for Vite Localhost
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
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
let viewer = null;

wss.on('connection', (ws, req) => {
    const isStreamer = req.url === '/ws-stream';

    if (isStreamer) {
        console.log('📱 Streamer connected');
        streamer = ws;
        if (viewer) {
            streamer.send(JSON.stringify({ type: 'viewer-ready' }));
            viewer.send(JSON.stringify({ type: 'streamer-present' }));
        }
    } else {
        console.log('💻 Viewer connected');
        viewer = ws;
        if (streamer) {
            streamer.send(JSON.stringify({ type: 'viewer-ready' }));
            viewer.send(JSON.stringify({ type: 'streamer-present' }));
        }
    }

    ws.on('message', (message) => {
        if (isStreamer && viewer) {
            viewer.send(message.toString());
        } else if (!isStreamer && streamer) {
            streamer.send(message.toString());
        }
    });

    ws.on('close', () => {
        if (isStreamer) {
            console.log('📱 Streamer disconnected');
            streamer = null;
            if (viewer) viewer.send(JSON.stringify({ type: 'streamer-gone' }));
        } else {
            console.log('💻 Viewer disconnected');
            viewer = null;
            if (streamer) streamer.send(JSON.stringify({ type: 'viewer-gone' }));
        }
    });
});

// Static file serving
app.use('/public', express.static(path.join(process.cwd(), 'public')));
app.use('/models', express.static(path.join(process.cwd(), 'models')));
app.use('/dataset', express.static(DATASET_DIR));

// Create dirs if missing
if (!fs.existsSync(DATASET_DIR)) fs.mkdirSync(DATASET_DIR);
if (!fs.existsSync('public')) fs.mkdirSync('public');

app.get('/stream-video', (req, res) => {
    res.sendFile(path.join(process.cwd(), 'public', 'stream-video.html'));
});

app.get('/view-stream', (req, res) => {
    res.sendFile(path.join(process.cwd(), 'public', 'view-stream.html'));
});

// GET /dataset — list image filenames
app.get('/dataset', (req, res) => {
    try {
        const files = fs.readdirSync(DATASET_DIR);
        const images = files.filter(f => /\.(jpg|jpeg|png|webp)$/i.test(f));
        res.json(images);
    } catch (e) {
        res.status(500).json({ error: 'Failed to read dataset directory' });
    }
});

// POST /dataset/upload — upload a new image via multipart/form-data (raw parsing, no extra deps)
app.post('/dataset/upload', (req, res) => {
    const contentType = req.headers['content-type'] || '';
    const boundaryMatch = contentType.match(/boundary=(.+)$/);
    if (!boundaryMatch) {
        return res.status(400).json({ error: 'Missing multipart boundary' });
    }
    const boundary = '--' + boundaryMatch[1];

    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => {
        try {
            const body = Buffer.concat(chunks);
            const bodyStr = body.toString('binary');

            // Parse the subject name text field
            const subjectMatch = bodyStr.match(/name="subject"\r\n\r\n([^\r\n]+)/);
            const subject = subjectMatch ? subjectMatch[1].trim() : '';

            // Parse filename from Content-Disposition
            const filenamePart = bodyStr.match(/filename="([^"]+)"/);
            if (!filenamePart) {
                return res.status(400).json({ error: 'No filename found in upload' });
            }
            const originalName = filenamePart[1];
            const ext = path.extname(originalName).toLowerCase() || '.jpg';

            // Build the safe output filename from the subject name
            const safeName = (subject || path.basename(originalName, ext))
                .toLowerCase()
                .replace(/\s+/g, '_')
                .replace(/[^a-z0-9_]/g, '') + ext;

            // Find where binary file data starts (after last \r\n\r\n in the file part)
            const headerEndMarker = Buffer.from('\r\n\r\n');
            const contentTypeMarker = Buffer.from('Content-Type:');
            let fileStart = -1;
            let ctPos = 0;
            while (ctPos < body.length) {
                const idx = body.indexOf(contentTypeMarker, ctPos);
                if (idx === -1) break;
                const end = body.indexOf(headerEndMarker, idx);
                if (end !== -1) {
                    fileStart = end + 4;
                    break;
                }
                ctPos = idx + 1;
            }
            if (fileStart === -1) {
                return res.status(400).json({ error: 'Could not locate file data in upload' });
            }

            // File data ends at the closing boundary
            const closingBoundary = Buffer.from('\r\n' + boundary);
            let fileEnd = body.indexOf(closingBoundary, fileStart);
            if (fileEnd === -1) fileEnd = body.length;

            const fileData = body.slice(fileStart, fileEnd);
            const outPath = path.join(DATASET_DIR, safeName);
            fs.writeFileSync(outPath, fileData);
            console.log(`✅ Dataset: Saved "${safeName}"`);
            res.json({ success: true, filename: safeName });
        } catch (err) {
            console.error('Upload error:', err);
            res.status(500).json({ error: 'Upload failed: ' + err.message });
        }
    });
});

// DELETE /dataset/:filename — remove an image from dataset
app.delete('/dataset/:filename', (req, res) => {
    try {
        const filename = path.basename(req.params.filename); // prevent path traversal
        const filePath = path.join(DATASET_DIR, filename);
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ error: 'File not found' });
        }
        fs.unlinkSync(filePath);
        console.log(`🗑️  Dataset: Removed "${filename}"`);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Delete failed: ' + err.message });
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
