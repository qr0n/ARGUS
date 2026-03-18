# ARGUS: Government-Readiness Gaps and Recognition Improvement Plan

## Scope
This document focuses on what currently limits ARGUS from being a government-grade facial recognition platform, with emphasis on recognition quality, reliability, security, and compliance.

## Current State (Observed in Codebase)
- Frontend inference uses `face-api.js` with:
  - `ssdMobilenetv1` for detection
  - `faceLandmark68Net` for landmarks
  - `faceRecognitionNet` for embeddings
- Matching thresholds are static (`FaceMatcher` at ~`0.48` to `0.50`) and not calibrated per camera/domain.
- Dataset is file-based (`/dataset` images); logs are flat-file (`dataset/logs.json`, capped at 100).
- Recognition runs entirely in browser clients, with no centralized model governance.
- APIs and WebSocket channels currently have no authentication/authorization boundaries.

---

## What Is Blocking Government-Grade Readiness

### 1) Recognition Accuracy and Robustness
1. **Model stack is lightweight and older-generation** for modern high-stakes identification.
2. **Single-threshold matching** is brittle across lighting, pose, occlusion, and camera quality variance.
3. **No quality gates** (blur, low resolution, profile angle, occlusion) before matching.
4. **No liveness / anti-spoof controls** (print/photo/replay attacks).
5. **No open-set calibration** to control false accepts at strict operating points.

### 2) Dataset and Identity Management
1. **No enrollment quality policy** (minimum image quality, pose diversity, age spread).
2. **Single-image enrollment patterns possible**, causing poor descriptor robustness.
3. **No identity lifecycle controls** (merge/split identities, provenance, retention enforcement).
4. **No ground-truth labeling and adjudication workflow** for model performance improvement.

### 3) Evaluation, Validation, and Auditability
1. **No formal biometric evaluation suite** (FAR, FRR, ROC/DET, rank-k, open-set metrics).
2. **No benchmark environments** for day/night, camera types, crowd density, and demographics.
3. **No continuous drift monitoring** (camera replacement, seasonal lighting, domain shift).
4. **No reproducible model/version audit chain** tied to each decision event.

### 4) Security and Platform Hardening
1. **Open CORS and unauthenticated endpoints** (`/dataset`, `/api/logs`, WebSocket routes).
2. **Flat-file persistence** for logs and profiles is non-resilient for concurrency/integrity.
3. **No RBAC, no tenant/agency separation, no signed API tokens**.
4. **No rate limiting, abuse controls, tamper-evident logging, or key rotation framework**.

### 5) Compliance, Governance, and Operational Controls
1. **No policy engine** for legal basis, purpose limitation, and watchlist governance.
2. **No human-in-the-loop adjudication requirement** for high-impact actions.
3. **No explainability/reporting layer** for why a match was surfaced and at what calibrated risk.
4. **No formal retention/deletion and evidentiary chain-of-custody controls**.

---

## Proposed Changes

## A) Recognition Pipeline Upgrades (Highest Impact)
1. **Move to modern detector + embedding stack**
   - Evaluate migration from browser-only `face-api.js` to a server-side inference service (GPU-capable).
   - Candidate architectures:
     - Detector: RetinaFace / SCRFD / YOLO-face variants.
     - Embeddings: ArcFace-family (InsightFace derivatives) or equivalent SOTA embedding models.
2. **Dual-threshold open-set logic**
   - Introduce:
     - `accept_threshold` (high precision),
     - `review_threshold` (manual review queue),
     - below review = unknown.
3. **Frame/image quality gates**
   - Reject or defer low-quality detections using:
     - face size threshold,
     - blur score,
     - yaw/pitch/roll bounds,
     - occlusion confidence.
4. **Multi-frame aggregation for live video**
   - Aggregate embeddings over N frames and use temporal smoothing before alerting.
5. **Liveness/anti-spoof**
   - Add passive PAD scoring and challenge-response mode where required.

## B) Dataset and Enrollment Standards
1. **Enrollment policy**
   - Minimum 5–10 high-quality images per identity across pose/lighting conditions.
2. **Data curation workflow**
   - Duplicate detection, mislabeled identity detection, and periodic revalidation.
3. **Identity governance**
   - Full metadata: source, consent/legal basis, retention class, review history.
4. **Augmentation and domain adaptation**
   - Controlled augmentation for robust matching to field camera conditions.

## C) Evaluation Program (Must-Have Before Government Use)
1. **Build an offline evaluation harness**
   - Measure FAR/FRR/EER, ROC/DET, watchlist precision/recall, open-set identification rate.
2. **Calibrate thresholds per deployment context**
   - Different thresholds by camera class and mission type.
3. **Bias/fairness and subgroup analysis**
   - Stratified performance and remediation gates before production rollout.
4. **Operational drift monitoring**
   - Alert when score distributions or quality metrics shift materially.

## D) Security, Reliability, and Audit Controls
1. **Introduce AuthN/AuthZ everywhere**
   - mTLS or OAuth2/JWT, RBAC, and scoped permissions for upload/delete/alert APIs.
2. **Replace flat files with durable storage**
   - Postgres for metadata + append-only audit tables.
   - Object storage for images with immutable versioning.
3. **Secure real-time channels**
   - Authenticated WebSocket sessions, replay protection, and rate limiting.
4. **Tamper-evident audit trail**
   - Hash-chained logs, signed decision records, immutable retention policies.

## E) Governance and Human Review
1. **Human-in-the-loop decision policy**
   - Automated matches produce recommendations, not final enforcement actions.
2. **Case management workflow**
   - Review queue with evidentiary context and confidence rationale.
3. **Policy + compliance controls**
   - Purpose binding, retention/deletion automation, and jurisdiction-specific controls.

---

## Recommended Target Architecture
- **Edge/client:** capture + lightweight pre-processing only.
- **Inference service:** centralized detector + embedder on controlled hardware.
- **Matching service:** calibrated vector search + threshold policy engine.
- **Case/audit service:** immutable event store, reviewer actions, and compliance reports.
- **Model registry:** versioned models, threshold configs, evaluation artifacts, and rollback.

---

## Phased Execution Plan
1. **Phase 1: Security + Data Foundations**
   - AuthN/AuthZ, durable DB/object storage, structured schemas, immutable audit.
2. **Phase 2: Evaluation Harness + Threshold Calibration**
   - Build benchmark datasets, tune thresholds, define acceptance criteria.
3. **Phase 3: Model Upgrade and Service Migration**
   - Introduce modern detector/embedding service; A/B against current stack.
4. **Phase 4: Governance + HITL Rollout**
   - Reviewer workflows, policy engine, compliance evidence generation.
5. **Phase 5: Continuous Monitoring**
   - Drift detection, periodic recertification, incident and retraining runbooks.

---

## Immediate Next 10 Engineering Actions
1. Add request schema validation for all REST APIs.
2. Add API auth + RBAC and secure WebSocket authentication.
3. Migrate logs/profiles metadata to Postgres with migrations.
4. Introduce immutable object storage path for image evidence.
5. Implement face/image quality scoring before matching.
6. Add per-camera configurable thresholds and review band.
7. Build offline evaluation CLI and baseline report generation.
8. Create labeled validation set from current dataset and real captures.
9. Add model/threshold version fields to every logged recognition event.
10. Add reviewer queue UI for uncertain matches.

---

## Note on Current Model Question
Based on current frontend code, ARGUS is using `ssdMobilenetv1` (not MobileNetV2) for face detection through `face-api.js`.
