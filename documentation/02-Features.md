# ARGUS Documentation: Features

This document provides a detailed breakdown of the core features available within the ARGUS platform.

---

## 1. Live Camera Face Recognition
ARGUS allows operators to use a mobile phone or a connected device camera as a live stream, broadcast securely over WebSockets/WebRTC to the main dashboard.
- **Dual Feed Modes:** Operators can choose between a **phone stream** (a separate mobile device connects via the `/stream-video` URL) or a **local device camera** (the browser accesses the host machine's webcam directly).
- **Real-Time AI Processing:** The viewer dashboard processes the incoming video feed using `face-api.js` models loaded in the browser, detecting faces, classifying them, and comparing them against the Case Profiles dataset.
- **Visual Feedback:** Bounding boxes, names, and confidence scores are drawn over the video canvas in real time (~8 inference frames per second).

## 2. Find Matches
A standalone tool allowing operators to upload a still image and run it against the full Case Profiles dataset.
- **Image Upload:** Users select or drag-and-drop a photo of the subject.
- **Dataset Scan:** The system uses the same `face-api.js` recognition pipeline to generate a face descriptor for the uploaded image, then scores it against all known profiles.
- **Ranked Results:** All matching profiles are returned with their confidence scores, ranked from highest to lowest.

## 3. AI Aging Simulation
A specialized tool that simulates the aging process of a subject and then attempts to find a match in the dataset.
- **Image Upload & Preview:** Users upload a reference image via drag-and-drop.
- **Aging Simulation:** The system processes the image to visually age the facial features.
- **Post-Simulation Match:** After aging, the resulting image is run against the Case Profiles dataset to surface potential matches alongside a confidence score.

## 4. Case Profiles
ARGUS includes a built-in profile management system for known faces.
- **Secure Storage:** Profile images are saved in the backend `/dataset` directory.
- **Dynamic Updates:** Operators can upload new profiles or delete existing ones directly from the dashboard without restarting the server.
- **Sanitization:** Uploaded filenames are automatically sanitized (non-alphanumeric characters replaced with underscores) to ensure system stability and security.

## 5. Activity Logs & Alerts
To ensure maximum operational awareness, ARGUS tracks system events and face matches.
- **Real-Time Alerting:** Unreviewed high-severity events surface as active alerts on the Dashboard and Alerts page.
- **Persistent Logging:** All matching events, system warnings, and uploads are recorded in `dataset/logs.json` on the backend, capped at the 100 most recent entries.
- **Log Management:** Operators can review individual log entries on the Activity Log page, categorized by severity (Info, Warning, High) and update their review status (Unreviewed → Reviewed).

---
*End of Document*
*See `03-Usage.md` for instructions on how end users interact with the system.*
