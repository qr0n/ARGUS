# ARGUS Documentation: Usage Guide

This document outlines how an end user operates the ARGUS platform, from starting the server to utilizing its various features.

---

## Starting the System

### Prerequisites
- Node.js installed.
- Valid SSL Certificates (`cert.pem` and `key.pem`) generated and placed in the backend directory.

### Running Locally
To run the system in development mode:
1. Open two terminal instances.
2. In the first terminal, navigate to the `backend` directory and run `npm run dev` (or `node server.js`).
3. In the second terminal, navigate to the `frontend` (React/Vite) directory and run `npm run dev`.

*Note: You will need to accept the self-signed certificate warnings in your browser (click "Advanced" -> "Proceed") for both the frontend URL and the backend HTTPS API/WebSocket URLs.*

---

## Using the Live Camera Face Recognition

1. **Accessing the Dashboard (Viewer):**
   Navigate to the frontend React application on your laptop or monitoring computer. Go to the Live Camera section.
2. **Accessing the Streamer Device:**
   On a mobile phone connected to the same network (or accessing the public domain if deployed), navigate to `https://<backend-ip>:3000/stream-video`.
3. **Connecting and Streaming:**
   The backend WebSockets manage the connection. Once both are open, the phone's camera feed will appear on the laptop dashboard, overlaid with facial recognition data.

## Using the AI Aging Feature

1. Navigate to the **AI Aging** page on the frontend dashboard.
2. Use the provided upload area to select or drag-and-drop an image of the subject.
3. Initiate the aging simulation. 
4. The system will process the image, visually update the UI with the aged prediction, and display whether it found a match in the dataset alongside the highest confidence score.

## Managing the Dataset

1. Navigate to the **Dataset** or **Profiles** page on the frontend.
2. To add a known individual, upload their photo and provide their name as the subject identifier.
3. The system automatically syncs this with the backend, making the new face available for immediate recognition on the Live Camera feed.
4. You can also delete outdated or incorrect profiles from this view.

## Reviewing Logs and Alerts

1. Navigate to the **Alerts & Logs** page.
2. Here, a tabular feed displays recent network activity, matched faces, and system notifications.
3. Click on individual logs to expand them, and use the provided UI buttons to mark logs as "Reviewed" once they have been acknowledged by the security team.

---
*End of Document*
*See `04-Architecture.md` for a technical overview of the system design.*
