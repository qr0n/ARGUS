# ARGUS Documentation: Features

This document provides a detailed breakdown of the core features available within the ARGUS platform.

---

## 1. Live Camera Face Recognition (Continuity Camera)
ARGUS allows operators to use a mobile phone or secondary device as a remote camera stream, which is broadcasted securely over WebSockets to the main dashboard.
- **Live Streaming:** Video is captured on the streamer device and sent with near-zero latency to the viewer dashboard.
- **Real-Time AI Processing:** The web dashboard processes the incoming video feed, detecting faces, classifying them, and comparing them against the known "Dataset."
- **Visual Feedback:** Bounding boxes, names, and confidence scores are drawn directly over the video feed on the viewer's screen.

## 2. AI Aging Simulation
A specialized tool for predicting and analyzing how a subject might look after a certain number of years.
- **Image Upload & Preview:** Users can upload a reference image via intuitive drag-and-drop.
- **Aging Simulation Process:** The system utilizes AI models to visually age the facial features of the uploaded image.
- **Result Matching:** The simulated aged image is then run against the database to find potential matches, alongside a confidence score.

## 3. Dataset Management
ARGUS comes with a built-in database management system for recognized faces.
- **Secure Storage:** Images are saved in the backend `/dataset` directory.
- **Dynamic Updates:** Operators can upload new known faces or delete existing ones directly from the web application without needing server restarts.
- **Sanitization:** Files are automatically renamed to ensure system stability and security.

## 4. Activity Logs & Alerts
To ensure maximum operational awareness, ARGUS tracks system events and matches.
- **Real-Time Alerting:** New alerts trigger UI notifications when critical events occur (e.g., a high-confidence match from the camera stream).
- **Persistent Logging:** All matching events, system warnings, and uploads are logged in a structured `logs.json` file on the backend.
- **Log Management:** Operators can review the logs page to see the history of events, categorized by severity (Info, Warning, Critical) and update their review status (Reviewed vs. Unreviewed).

---
*End of Document*
*See `03-Usage.md` for instructions on how to end users interact with the system.*
