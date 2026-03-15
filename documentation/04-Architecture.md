# ARGUS Documentation: Architecture Overview

This document provides a high-level overview of the technical architecture driving the ARGUS platform.

---

## 1. System Components

The ARGUS project is divided into two primary, decoupled components: the **Frontend** and the **Backend**.

### 1.1 Frontend (React / Vite)
- **Framework:** The user interface is built using React, bundled and served through Vite for extremely fast hot-module replacement and optimized production builds.
- **Language:** TypeScript is utilized to ensure type safety and code quality, alongside specific ESLint rules tailored for React DOM.
- **Role:** Handles user interaction (e.g., viewing logs, initiating AI aging requests, uploading dataset files) and renders the video canvas for the Viewer mode of the Live Camera feature. It also manages state for data fetching (like the `/api/logs` feed).

### 1.2 Backend (Node.js / Express)
- **Server:** A Node.js environment processes API requests for the application. Express simplifies route management.
- **WebSockets (ws):** A key technology driving real-time interaction. The backend operates a standalone `WebSocketServer` that securely relays messages between a "Streamer" device and multiple "Viewer" connected clients without requiring heavy polling.
- **Storage:**
  - Files, such as known faces, logs, and public static HTML/JS for the fallback camera modules, are stored on the disk within specific directories (`/dataset`, `/public`, `/models`).
  - `logs.json` acts as a simplified, flat-file database tailored for the Activity Logs. This prevents the need for a fully dedicated relational database for initial deployments.
- **Security / HTTPS:** The backend must run via HTTPS for modern web browsers to allow WebRTC or camera access (via `navigator.mediaDevices.getUserMedia`). As such, the application relies on SSL certificates (`cert.pem` / `key.pem`) to run securely. 

## 2. Face Recognition and AI Processing
- **AI Models:** Located within the `/models` directory, these provide offline, browser-based, or server-side compatible face detection and landmark inference. Usually, this relies on technologies like `face-api.js` (or similar TensorFlow.js wrappers).
- **Execution:** During the Streaming feature, face recognition is typically executed on the client-side Viewer to reduce server overhead. Visuals (like bounding boxes) are drawn over the real-time video element using standard HTML5 Canvas overlays.

## 3. Communication Flow
1. **Camera Initiation:** A streamer device hits a specific route (e.g., `/stream-video`), opens a WebSocket connection (`/ws-stream`), and pushes raw video data or WebRTC signaling.
2. **Viewer Display:** A viewing device connects to the WebSocket layer, triggering an alert that a "Streamer" is active. The feed starts rendering.
3. **API Endpoints:** Actions aside from streaming utilize standard RESTful endpoints (`GET`, `POST`, `DELETE`, `PATCH`) to interact with the backend (e.g., validating a log (`PATCH /api/logs/:id/status`) or uploading an image (`POST /dataset/upload`)).

---
*End of Document*
*This concludes the official ARGUS system documentation series.*
