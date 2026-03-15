import fs from 'fs';
import https from 'https';
import path from 'path';

const models = [
    'ssd_mobilenetv1_model-weights_manifest.json',
    'ssd_mobilenetv1_model-shard1',
    'ssd_mobilenetv1_model-shard2',
    'face_landmark_68_model-weights_manifest.json',
    'face_landmark_68_model-shard1',
    'face_recognition_model-weights_manifest.json',
    'face_recognition_model-shard1',
    'face_recognition_model-shard2'
];

const BASE_URL = 'https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights/';
const MODELS_DIR = path.join(process.cwd(), 'models');

if (!fs.existsSync(MODELS_DIR)) {
    fs.mkdirSync(MODELS_DIR);
}

async function downloadFile(url, dest) {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(dest);
        https.get(url, (response) => {
            if (response.statusCode !== 200) {
                reject(new Error(`Failed to get '${url}' (${response.statusCode})`));
                return;
            }
            response.pipe(file);
            file.on('finish', () => {
                file.close();
                resolve();
            });
        }).on('error', (err) => {
            fs.unlink(dest, () => { });
            reject(err);
        });
    });
}

async function run() {
    console.log('Downloading face-api.js models (this may take a minute)...');
    for (const model of models) {
        const dest = path.join(MODELS_DIR, model);
        if (!fs.existsSync(dest)) {
            try {
                await downloadFile(BASE_URL + model, dest);
                console.log(`✅ Downloaded ${model}`);
            } catch (e) {
                console.error(`❌ Failed to download ${model}:`, e.message);
            }
        } else {
            console.log(`⏩ Skipped ${model} (already exists)`);
        }
    }
    console.log('All models downloaded!');
}

run();
