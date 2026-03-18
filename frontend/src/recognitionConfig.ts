export const RECOGNITION_CONFIG = {
  modelVersion: 'face-api/ssdMobilenetv1+faceRecognitionNet@1',
  acceptDistance: 0.48,
  reviewDistance: 0.58,
  minDetectionScore: 0.55,
  minFaceSize: 42,
} as const;

export function clampConfidence(distance: number) {
  return Math.min(100, Math.max(0, Math.round((1 - distance) * 100)));
}

export function isUsableDetection(det: any) {
  const score = det?.detection?.score ?? 1;
  const box = det?.detection?.box;
  if (!box) return false;
  return score >= RECOGNITION_CONFIG.minDetectionScore
    && Math.min(box.width, box.height) >= RECOGNITION_CONFIG.minFaceSize;
}

export function getArgusAuthHeaders() {
  const token = localStorage.getItem('argusAuthToken') || '';
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}
