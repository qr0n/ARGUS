# ARGUS Documentation: Usage Guide

This document outlines how an end user operates the ARGUS platform, from initial setup to utilizing its various features.

---

## Initial Setup

### Prerequisites
- Node.js installed (v18+ recommended).

### Installation

1. **Install backend dependencies:**
   ```bash
   cd backend
   npm install
   ```

2. **Generate SSL certificates and download AI models:**
   ```bash
   npm run setup
   ```
   This runs `generate-certs.js` (creates `cert.pem` and `key.pem` in the backend directory) and `download-models.js` (fetches the required `face-api.js` model weights into `/models`).

3. **Install frontend dependencies:**
   ```bash
   cd ../frontend
   npm install
   ```

---

## Running Locally

Open two terminal instances:

1. **Terminal 1 — Backend:** From the `backend` directory, run:
   ```bash
   npm run dev
   ```
   The HTTPS server starts on `https://localhost:3000` (also accessible by local IP, e.g. `https://192.168.x.x:3000`).

2. **Terminal 2 — Frontend:** From the `frontend` directory, run:
   ```bash
   npm run dev
   ```
   The Vite dev server starts on `http://localhost:5173`. Requests to `/api`, `/dataset`, `/models`, `/ws-view`, and `/ws-stream` are automatically proxied to the backend.

> **Note:** The first time you open the frontend or backend URLs in a browser, you will need to accept the self-signed certificate warning (click **Advanced → Proceed**) for both the frontend host and the backend HTTPS URL (`https://localhost:3000`). This is required for WebSocket and camera access to work correctly.

---

## Using the Live Camera

1. **Open the Dashboard** on your laptop/monitoring computer and navigate to **Live Camera**.
2. Choose a **feed mode**:
   - **External Phone:** On a mobile device connected to the same network, navigate to `https://<backend-ip>:3000/stream-video`. The backend WebSocket relay connects the phone's camera to the viewer dashboard automatically.
   - **Dual Phone:** Two phones stream simultaneously, displayed side by side with independent face recognition and alerts per camera. Navigate Phone 1 to `https://<backend-ip>:3000/stream-video` and Phone 2 to `https://<backend-ip>:3000/stream-video?slot=2`. The URL hints are also shown in the dashboard controls panel while the feed is live.
   - **Local Device Camera:** Click the option to use the host machine's webcam directly in the browser.
3. Once streaming, the canvas overlay displays real-time bounding boxes, matched names, and confidence scores.
4. When a known face is detected, an alert is automatically logged to the Activity Log and Alerts page, tagged with the camera that detected it (e.g. `Camera 1 — Match Detected: JOHN DOE (92%)`). A 30-second cooldown per person per camera prevents duplicate alerts for the same face staying in frame.

## Using Find Matches

1. Navigate to the **Find Matches** page.
2. Use the upload area to select or drag-and-drop an image of the subject.
3. The system scans the uploaded face against all profiles in the Case Profiles dataset and returns ranked matches with confidence scores.

## Using the AI Aging Feature

1. Navigate to the **AI Aging** page.
2. Upload an image of the subject using the drag-and-drop area.
3. Initiate the aging simulation. The system processes the image and displays the visually aged result.
4. After simulation completes, the aged image is automatically scanned against the dataset and the closest match (if any) is displayed with its confidence score.

## Managing Case Profiles

1. Navigate to the **Case Profiles** page.
2. To add a known individual, click the upload control, provide their name, and select their photo.
3. The backend saves the image to the `/dataset` directory and it becomes immediately available for recognition across all modules (Live Camera, Find Matches, AI Aging).
4. To remove a profile, select it and use the delete option. The file is permanently removed from the server.

## Reviewing Logs and Alerts

1. Navigate to the **Alerts** page for a focused view of unreviewed high-severity events, or the **Activity Log** page for the full history.
2. Log entries display the event time, activity description, type, and severity.
3. Use the **Mark as Reviewed** action on individual entries to acknowledge them and remove them from the active alerts count.

---
*End of Document*
*See `04-Architecture.md` for a technical overview of the system design.*
