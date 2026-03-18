# ARGUS

ARGUS is a real-time face recognition platform with:
- **Frontend**: React + TypeScript + Vite (`/frontend`)
- **Backend**: Node.js + Express + WebSocket relay over HTTPS (`/backend`)

## Core Features
- Live camera streaming with face detection/recognition overlays
- Find Matches (image upload + face matching)
- AI Aging match workflow
- Case Profiles dataset management
- Alerts and activity logging

## Current Recognition Stack
- `face-api.js`
- `ssdMobilenetv1` (face detection)
- `faceLandmark68Net` (landmarks)
- `faceRecognitionNet` (descriptors)

## Quick Start

### 1) Backend
```bash
cd backend
npm install
npm run setup
npm run dev
```
Backend runs on `https://localhost:3000`.

### 2) Frontend
```bash
cd frontend
npm install
npm run dev
```
Frontend runs on Vite (default `https://localhost:5173`) and proxies API/model/dataset routes to backend.

## Optional Auth (Experimental Branch)
If auth tokens are set, protected endpoints and WebSocket channels require bearer/token auth.

Set any/all of:
- `ARGUS_ADMIN_TOKEN`
- `ARGUS_OPERATOR_TOKEN`
- `ARGUS_VIEWER_TOKEN`
- `ARGUS_ALLOWED_ORIGINS` (comma-separated origins)
- `ARGUS_MODEL_VERSION` (optional log metadata override)

In frontend/browser, set:
- `localStorage.setItem('argusAuthToken', '<token>')`

For streamer/viewer static pages, token can be passed via query param:
- `?token=<token>`

## Notes
- This repository contains documentation in `/documentation`.
- The government-readiness proposal is in:
  - `documentation/05-Government-Readiness-Recognition-Improvement-Plan.md`
