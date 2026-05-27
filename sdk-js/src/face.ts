/**
 * OTRUST SDK - Face Recognition & Liveness Detection
 *
 * Client-side face verification using face-api.js.
 * All processing happens locally - no face data is sent to servers.
 *
 * @example
 * ```ts
 * import { face } from '@otrust/sdk';
 *
 * // Initialize (load models)
 * await face.init();
 *
 * // Extract face from ID document
 * const idFace = await face.detectFromImage(idImage);
 *
 * // Start selfie verification with liveness
 * const result = await face.verifySelfie(videoElement, idFace, {
 *   requireLiveness: true,
 *   onProgress: (status) => console.log(status),
 * });
 *
 * if (result.ok) {
 *   console.log('Match:', result.value.faceMatch);
 *   console.log('Liveness:', result.value.livenessVerified);
 * }
 * ```
 */

import { Result, ok, err, OTrustError } from './result.js';

// ============================================
// Types
// ============================================

/** Face detection result */
export interface FaceDetection {
  /** Bounding box of the face */
  box: { x: number; y: number; width: number; height: number };
  /** Face descriptor (128-dimensional vector) for matching */
  descriptor: Float32Array;
  /** Confidence score 0-1 */
  confidence: number;
  /** Landmarks (eyes, nose, mouth) */
  landmarks?: {
    leftEye: { x: number; y: number };
    rightEye: { x: number; y: number };
    nose: { x: number; y: number };
    mouth: { x: number; y: number };
  };
}

/** Face verification result */
export interface FaceVerificationResult {
  /** Whether faces match (similarity > threshold) */
  faceMatch: boolean;
  /** Similarity score 0-1 */
  similarity: number;
  /** Whether liveness check passed */
  livenessVerified: boolean;
  /** Number of blinks detected */
  blinksDetected: number;
  /** Confidence in the verification */
  confidence: number;
}

/** Liveness detection status */
export interface LivenessStatus {
  faceDetected: boolean;
  eyesOpen: boolean;
  blinksDetected: number;
  requiredBlinks: number;
  message: string;
}

/** Options for selfie verification */
export interface VerifySelfieOptions {
  /** Require liveness detection (default: true) */
  requireLiveness?: boolean;
  /** Number of blinks required (default: 2) */
  requiredBlinks?: number;
  /** Minimum similarity for match (default: 0.6) */
  similarityThreshold?: number;
  /** Timeout in milliseconds (default: 30000) */
  timeout?: number;
  /** Progress callback */
  onProgress?: (status: LivenessStatus) => void;
}

// ============================================
// Face-api.js dynamic import
// ============================================

import type { FaceAPI } from './types/face-api.js';

let faceapi: FaceAPI | null = null;
let modelsLoaded = false;
const MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model/';

/**
 * Initialize face recognition models.
 * Must be called before using other face functions.
 *
 * @example
 * ```ts
 * await face.init();
 * ```
 */
export async function init(): Promise<Result<void>> {
  try {
    if (modelsLoaded) {
      return ok(undefined);
    }

    // Load face-api.js from CDN (browser only)
    if (!faceapi) {
      faceapi = await loadFaceApiFromCDN();
    }

    // Load required models
    const api = faceapi!;
    await Promise.all([
      api.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
      api.nets.faceLandmark68TinyNet.loadFromUri(MODEL_URL),
      api.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
    ]);

    modelsLoaded = true;
    return ok(undefined);
  } catch (error) {
    return err(new OTrustError('init_failed', `Failed to initialize face recognition: ${error}`));
  }
}

/**
 * Load face-api.js from CDN (browser fallback)
 */
async function loadFaceApiFromCDN(): Promise<FaceAPI> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') {
      reject(new Error('CDN loading only works in browser'));
      return;
    }

    // Check if already loaded
    if (window.faceapi) {
      resolve(window.faceapi);
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/dist/face-api.min.js';
    script.onload = () => resolve(window.faceapi!);
    script.onerror = () => reject(new Error('Failed to load face-api.js from CDN'));
    document.head.appendChild(script);
  });
}

/**
 * Check if face recognition is initialized.
 */
export function isInitialized(): boolean {
  return modelsLoaded;
}

/**
 * Detect face from an image element or canvas.
 *
 * @example
 * ```ts
 * const idImage = document.getElementById('id-photo');
 * const detection = await face.detectFromImage(idImage);
 * if (detection.ok) {
 *   console.log('Face found with confidence:', detection.value.confidence);
 * }
 * ```
 */
export async function detectFromImage(
  input: HTMLImageElement | HTMLCanvasElement | HTMLVideoElement
): Promise<Result<FaceDetection>> {
  if (!modelsLoaded || !faceapi) {
    return err(new OTrustError('not_initialized', 'Call face.init() first'));
  }

  try {
    const api = faceapi;
    const detection = await api
      .detectSingleFace(input, new api.TinyFaceDetectorOptions())
      .withFaceLandmarks(true)
      .withFaceDescriptor();

    if (!detection) {
      return err(new OTrustError('no_face', 'No face detected in image'));
    }

    const landmarks = detection.landmarks;
    const leftEye = landmarks.getLeftEye();
    const rightEye = landmarks.getRightEye();
    const nose = landmarks.getNose();
    const mouth = landmarks.getMouth();

    return ok({
      box: {
        x: detection.detection.box.x,
        y: detection.detection.box.y,
        width: detection.detection.box.width,
        height: detection.detection.box.height,
      },
      descriptor: detection.descriptor,
      confidence: detection.detection.score,
      landmarks: {
        leftEye: { x: leftEye[0].x, y: leftEye[0].y },
        rightEye: { x: rightEye[0].x, y: rightEye[0].y },
        nose: { x: nose[3].x, y: nose[3].y },
        mouth: { x: mouth[3].x, y: mouth[3].y },
      },
    });
  } catch (error) {
    return err(new OTrustError('detection_failed', `Face detection failed: ${error}`));
  }
}

/**
 * Calculate similarity between two face descriptors.
 * Returns a value between 0 (different) and 1 (identical).
 */
export function calculateSimilarity(desc1: Float32Array, desc2: Float32Array): number {
  if (!faceapi) return 0;
  const distance = faceapi.euclideanDistance(desc1, desc2);
  // Convert distance to similarity (distance 0 = similarity 1, distance 1+ = similarity ~0)
  return Math.max(0, 1 - distance);
}

/**
 * Verify selfie against ID photo with liveness detection.
 *
 * This is the main function for identity verification.
 * It captures video from the user's camera, matches their face
 * against the ID photo, and verifies they're alive (not a photo/video).
 *
 * @example
 * ```ts
 * const video = document.getElementById('webcam');
 * const idFace = await face.detectFromImage(idPhoto);
 *
 * const result = await face.verifySelfie(video, idFace.value, {
 *   requireLiveness: true,
 *   onProgress: (status) => {
 *     console.log(status.message);
 *     console.log(`Blinks: ${status.blinksDetected}/${status.requiredBlinks}`);
 *   },
 * });
 * ```
 */
export async function verifySelfie(
  videoElement: HTMLVideoElement,
  idFace: FaceDetection,
  options: VerifySelfieOptions = {}
): Promise<Result<FaceVerificationResult>> {
  if (!modelsLoaded || !faceapi) {
    return err(new OTrustError('not_initialized', 'Call face.init() first'));
  }

  const {
    requireLiveness = true,
    requiredBlinks = 2,
    similarityThreshold = 0.6,
    timeout = 30000,
    onProgress,
  } = options;

  const api = faceapi;

  return new Promise((resolve) => {
    let blinksDetected = 0;
    let lastEyeState: 'open' | 'closed' | null = null;
    let bestSimilarity = 0;
    let bestDescriptor: Float32Array | null = null;
    let faceMatchConfirmed = false;
    const startTime = Date.now();

    const checkFrame = async () => {
      // Check timeout
      if (Date.now() - startTime > timeout) {
        resolve(err(new OTrustError('timeout', 'Verification timed out')));
        return;
      }

      try {
        const detection = await api
          .detectSingleFace(videoElement, new api.TinyFaceDetectorOptions())
          .withFaceLandmarks(true)
          .withFaceDescriptor();

        if (!detection) {
          onProgress?.({
            faceDetected: false,
            eyesOpen: false,
            blinksDetected,
            requiredBlinks,
            message: 'Position your face in the frame',
          });
          requestAnimationFrame(checkFrame);
          return;
        }

        // Calculate face match
        const similarity = calculateSimilarity(detection.descriptor, idFace.descriptor);
        if (similarity > bestSimilarity) {
          bestSimilarity = similarity;
          bestDescriptor = detection.descriptor;
        }

        if (similarity >= similarityThreshold) {
          faceMatchConfirmed = true;
        }

        // Check eye state for liveness (blink detection)
        const landmarks = detection.landmarks;
        const leftEye = landmarks.getLeftEye();
        const rightEye = landmarks.getRightEye();

        // Calculate eye aspect ratio (EAR)
        const leftEAR = calculateEAR(leftEye);
        const rightEAR = calculateEAR(rightEye);
        const avgEAR = (leftEAR + rightEAR) / 2;

        // EAR threshold for closed eyes (typical: 0.2-0.25)
        const eyesClosed = avgEAR < 0.22;
        const currentEyeState = eyesClosed ? 'closed' : 'open';

        // Detect blink (transition from open -> closed -> open)
        if (lastEyeState === 'closed' && currentEyeState === 'open') {
          blinksDetected++;
        }
        lastEyeState = currentEyeState;

        // Progress callback
        const livenessComplete = !requireLiveness || blinksDetected >= requiredBlinks;
        onProgress?.({
          faceDetected: true,
          eyesOpen: !eyesClosed,
          blinksDetected,
          requiredBlinks,
          message: livenessComplete
            ? (faceMatchConfirmed ? 'Verification complete!' : 'Face match in progress...')
            : `Blink ${blinksDetected}/${requiredBlinks} - ${eyesClosed ? 'Eyes closed' : 'Blink now'}`,
        });

        // Check if verification is complete
        if (faceMatchConfirmed && livenessComplete) {
          resolve(ok({
            faceMatch: true,
            similarity: bestSimilarity,
            livenessVerified: blinksDetected >= requiredBlinks,
            blinksDetected,
            confidence: Math.min(bestSimilarity, detection.detection.score),
          }));
          return;
        }

        // Continue checking
        requestAnimationFrame(checkFrame);
      } catch (error) {
        // Continue on errors (might be temporary)
        requestAnimationFrame(checkFrame);
      }
    };

    checkFrame();
  });
}

/**
 * Calculate Eye Aspect Ratio (EAR) for blink detection.
 * Based on the paper: "Real-Time Eye Blink Detection using Facial Landmarks"
 */
function calculateEAR(eye: Array<{ x: number; y: number }>): number {
  // Eye landmarks are 6 points
  // p1-p6 clockwise from left corner
  const p1 = eye[0];
  const p2 = eye[1];
  const p3 = eye[2];
  const p4 = eye[3];
  const p5 = eye[4];
  const p6 = eye[5];

  // Vertical distances
  const v1 = Math.sqrt((p2.x - p6.x) ** 2 + (p2.y - p6.y) ** 2);
  const v2 = Math.sqrt((p3.x - p5.x) ** 2 + (p3.y - p5.y) ** 2);

  // Horizontal distance
  const h = Math.sqrt((p1.x - p4.x) ** 2 + (p1.y - p4.y) ** 2);

  // EAR formula
  return (v1 + v2) / (2 * h);
}

/**
 * Quick face match without liveness (for simpler use cases).
 *
 * @example
 * ```ts
 * const match = await face.compareFaces(idPhoto, selfiePhoto);
 * if (match.ok && match.value.match) {
 *   console.log('Same person!');
 * }
 * ```
 */
export async function compareFaces(
  image1: HTMLImageElement | HTMLCanvasElement,
  image2: HTMLImageElement | HTMLCanvasElement,
  threshold: number = 0.6
): Promise<Result<{ match: boolean; similarity: number }>> {
  const face1 = await detectFromImage(image1);
  if (!face1.ok) return face1;

  const face2 = await detectFromImage(image2);
  if (!face2.ok) return face2;

  const similarity = calculateSimilarity(face1.value.descriptor, face2.value.descriptor);
  return ok({
    match: similarity >= threshold,
    similarity,
  });
}

/**
 * Start webcam for selfie capture.
 *
 * @example
 * ```ts
 * const video = document.getElementById('webcam');
 * await face.startCamera(video);
 * ```
 */
export async function startCamera(videoElement: HTMLVideoElement): Promise<Result<MediaStream>> {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: 'user',
        width: { ideal: 640 },
        height: { ideal: 480 },
      },
    });

    videoElement.srcObject = stream;
    await videoElement.play();

    return ok(stream);
  } catch (error) {
    return err(new OTrustError('camera_failed', `Failed to start camera: ${error}`));
  }
}

/**
 * Stop webcam stream.
 */
export function stopCamera(stream: MediaStream): void {
  stream.getTracks().forEach(track => track.stop());
}

// Export as namespace
export const face = {
  init,
  isInitialized,
  detectFromImage,
  calculateSimilarity,
  verifySelfie,
  compareFaces,
  startCamera,
  stopCamera,
};
