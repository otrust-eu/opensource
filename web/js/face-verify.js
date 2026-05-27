/**
 * OTRUST Face Verification
 * 
 * Three-layer identity verification:
 * 1. Selfie matching - Compare face on ID with live selfie
 * 2. Liveness detection - Ensure it's a real person (blink detection)
 * 3. NFC chip reading - Read cryptographic data from passport/ID (where supported)
 * 
 * Uses face-api.js for face detection and recognition.
 * All processing happens locally in the browser.
 */

const FACE_API_CDN = 'https://cdn.jsdelivr.net/npm/face-api.js@0.22.2/dist/face-api.min.js';
const FACE_API_MODELS = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.12/model';

let faceApiLoaded = false;
let modelsLoaded = false;

// ========================================
// Face API Loading
// ========================================

async function loadFaceApi() {
  if (faceApiLoaded && window.faceapi) return window.faceapi;
  
  return new Promise((resolve, reject) => {
    if (window.faceapi) {
      faceApiLoaded = true;
      resolve(window.faceapi);
      return;
    }
    
    const script = document.createElement('script');
    script.src = FACE_API_CDN;
    script.onload = () => {
      faceApiLoaded = true;
      console.log('✅ face-api.js loaded');
      resolve(window.faceapi);
    };
    script.onerror = () => reject(new Error('Failed to load face-api.js'));
    document.head.appendChild(script);
  });
}

async function loadModels(onProgress) {
  if (modelsLoaded) return;
  
  const faceapi = await loadFaceApi();
  
  const models = [
    { name: 'TinyFaceDetector', load: () => faceapi.nets.tinyFaceDetector.loadFromUri(FACE_API_MODELS) },
    { name: 'SsdMobilenetv1', load: () => faceapi.nets.ssdMobilenetv1.loadFromUri(FACE_API_MODELS) },
    { name: 'FaceLandmark68', load: () => faceapi.nets.faceLandmark68Net.loadFromUri(FACE_API_MODELS) },
    { name: 'FaceRecognition', load: () => faceapi.nets.faceRecognitionNet.loadFromUri(FACE_API_MODELS) },
  ];
  
  for (let i = 0; i < models.length; i++) {
    if (onProgress) onProgress({ stage: 'loading', model: models[i].name, progress: Math.round((i / models.length) * 100) });
    await models[i].load();
  }
  
  modelsLoaded = true;
  console.log('✅ Face recognition models loaded');
}

// ========================================
// Face Detection & Extraction
// ========================================

/**
 * Detect face in an image and extract face descriptor
 * @param {HTMLImageElement|HTMLCanvasElement|HTMLVideoElement} input 
 * @param {string} source - 'id' for ID photos, 'webcam' for live camera
 * @returns {Object} Face detection result with descriptor
 */
async function detectFace(input, source = 'webcam') {
  const faceapi = await loadFaceApi();
  await loadModels();
  
  let detection = null;
  
  // For ID photos, try SSD MobileNet first (better for formal photos)
  if (source === 'id') {
    const ssdOptions = [
      new faceapi.SsdMobilenetv1Options({ minConfidence: 0.3 }),
      new faceapi.SsdMobilenetv1Options({ minConfidence: 0.2 }),
      new faceapi.SsdMobilenetv1Options({ minConfidence: 0.1 }),
    ];
    
    for (const opt of ssdOptions) {
      detection = await faceapi
        .detectSingleFace(input, opt)
        .withFaceLandmarks()
        .withFaceDescriptor();
      
      if (detection) {
        console.log('✅ Face detected with SSD MobileNet:', opt);
        break;
      }
    }
  }
  
  // Fallback to TinyFaceDetector (faster, good for webcam)
  if (!detection) {
    const tinyOptions = [
      new faceapi.TinyFaceDetectorOptions({ inputSize: 512, scoreThreshold: 0.3 }),
      new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.2 }),
      new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.15 }),
    ];
    
    for (const opt of tinyOptions) {
      detection = await faceapi
        .detectSingleFace(input, opt)
        .withFaceLandmarks()
        .withFaceDescriptor();
      
      if (detection) {
        console.log('✅ Face detected with TinyFaceDetector:', opt);
        break;
      }
    }
  }
  
  if (!detection) {
    console.log('❌ No face detected after trying all options');
    return { success: false, error: 'No face detected' };
  }
  
  return {
    success: true,
    detection,
    descriptor: detection.descriptor,
    box: detection.detection.box,
    landmarks: detection.landmarks,
    score: detection.detection.score
  };
}

/**
 * Preprocess image to improve face detection
 * @param {HTMLImageElement} img
 * @returns {HTMLCanvasElement} Preprocessed image
 */
function preprocessImageForFace(img) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  
  // Scale to optimal size for face-api (not too small, not too large)
  const maxDim = 1024;
  const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
  canvas.width = img.width * scale;
  canvas.height = img.height * scale;
  
  // Draw image
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  
  // Apply mild contrast enhancement for better face detection
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  
  // Find min/max luminance for contrast stretching
  let minL = 255, maxL = 0;
  for (let i = 0; i < data.length; i += 4) {
    const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    if (lum < minL) minL = lum;
    if (lum > maxL) maxL = lum;
  }
  
  // Apply contrast stretching if image is too flat
  const range = maxL - minL;
  if (range < 200 && range > 10) {
    const factor = 220 / range;
    for (let i = 0; i < data.length; i += 4) {
      data[i] = Math.min(255, Math.max(0, (data[i] - minL) * factor + 20));
      data[i + 1] = Math.min(255, Math.max(0, (data[i + 1] - minL) * factor + 20));
      data[i + 2] = Math.min(255, Math.max(0, (data[i + 2] - minL) * factor + 20));
    }
    ctx.putImageData(imageData, 0, 0);
    console.log('📷 Applied contrast enhancement to ID image');
  }
  
  return canvas;
}

/**
 * Extract face from ID document image
 * @param {File|Blob} imageFile 
 * @returns {Object} Face data from ID
 */
async function extractFaceFromID(imageFile) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = async () => {
      try {
        // Preprocess image for better detection
        const preprocessed = preprocessImageForFace(img);
        
        // Try with preprocessed image first
        let result = await detectFace(preprocessed, 'id');
        
        // If that fails, try original image
        if (!result.success) {
          console.log('🔄 Retrying with original image...');
          result = await detectFace(img, 'id');
        }
        
        if (result.success) {
          result.source = 'id_document';
        }
        resolve(result);
      } catch (err) {
        reject(err);
      }
    };
    img.onerror = () => reject(new Error('Failed to load ID image'));
    img.src = URL.createObjectURL(imageFile);
  });
}

// ========================================
// Face Comparison
// ========================================

/**
 * Compare two face descriptors using multiple distance metrics
 * @param {Float32Array} descriptor1 
 * @param {Float32Array} descriptor2 
 * @returns {Object} Match result with similarity score
 */
async function compareFaces(descriptor1, descriptor2) {
  const faceapi = await loadFaceApi();
  
  // Primary: Euclidean distance (standard for face-api.js)
  const euclideanDist = faceapi.euclideanDistance(descriptor1, descriptor2);
  
  // Secondary: Cosine similarity (more robust to lighting variations)
  let dotProduct = 0;
  let norm1 = 0;
  let norm2 = 0;
  for (let i = 0; i < descriptor1.length; i++) {
    dotProduct += descriptor1[i] * descriptor2[i];
    norm1 += descriptor1[i] * descriptor1[i];
    norm2 += descriptor2[i] * descriptor2[i];
  }
  const cosineSimilarity = dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2));
  const cosineDist = 1 - cosineSimilarity;
  
  // Weighted combination: Euclidean is primary, cosine helps with edge cases
  const combinedDist = euclideanDist * 0.7 + cosineDist * 0.3;
  
  // Convert to similarity percentage
  // Distance of 0 = perfect match, distance of 0.6 = threshold
  const similarity = Math.max(0, Math.min(100, (1 - combinedDist / 0.6) * 100));
  
  // Thresholds - 70% minimum for identity verification
  // This is security-critical - must prevent fraud while allowing legitimate matches
  const MATCH_THRESHOLD = 0.45;     // ~70% similarity - security minimum
  const HIGH_CONFIDENCE = 0.35;     // ~80%+ similarity - high confidence
  const VERY_HIGH_CONFIDENCE = 0.25; // ~90%+ similarity - very high confidence
  
  let confidence = 'low';
  if (combinedDist < VERY_HIGH_CONFIDENCE) confidence = 'very_high';
  else if (combinedDist < HIGH_CONFIDENCE) confidence = 'high';
  else if (combinedDist < MATCH_THRESHOLD) confidence = 'medium';
  
  console.log(`🔍 Face comparison: euclidean=${euclideanDist.toFixed(3)}, cosine=${cosineDist.toFixed(3)}, combined=${combinedDist.toFixed(3)}, similarity=${Math.round(similarity)}%`);
  
  return {
    match: combinedDist < MATCH_THRESHOLD,
    distance: combinedDist,
    euclideanDistance: euclideanDist,
    cosineDistance: cosineDist,
    similarity: Math.round(similarity),
    confidence,
    threshold: MATCH_THRESHOLD
  };
}

// ========================================
// Webcam & Selfie Capture
// ========================================

let videoStream = null;

/**
 * Start webcam for selfie capture
 * @param {HTMLVideoElement} videoElement 
 */
async function startCamera(videoElement) {
  try {
    // Request higher resolution for better face detection accuracy
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: 1280, min: 640 },
        height: { ideal: 720, min: 480 },
        facingMode: 'user',
        frameRate: { ideal: 30, min: 15 }
      }
    });
    
    videoElement.srcObject = stream;
    videoStream = stream;
    
    return new Promise((resolve) => {
      videoElement.onloadedmetadata = () => {
        videoElement.play();
        resolve({ success: true });
      };
    });
  } catch (err) {
    console.error('Camera error:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Stop webcam
 */
function stopCamera() {
  if (videoStream) {
    videoStream.getTracks().forEach(track => track.stop());
    videoStream = null;
  }
}

/**
 * Capture frame from video as canvas
 * @param {HTMLVideoElement} videoElement 
 * @returns {HTMLCanvasElement}
 */
function captureFrame(videoElement) {
  const canvas = document.createElement('canvas');
  canvas.width = videoElement.videoWidth;
  canvas.height = videoElement.videoHeight;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(videoElement, 0, 0);
  return canvas;
}

// ========================================
// Liveness Detection
// ========================================

/**
 * Eye Aspect Ratio (EAR) for blink detection
 * Based on paper: "Real-Time Eye Blink Detection using Facial Landmarks"
 */
function calculateEAR(eye) {
  // eye is array of 6 points
  const A = distance(eye[1], eye[5]);
  const B = distance(eye[2], eye[4]);
  const C = distance(eye[0], eye[3]);
  return (A + B) / (2.0 * C);
}

function distance(p1, p2) {
  return Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2));
}

/**
 * Detect blink from face landmarks
 * @param {Object} landmarks - Face landmarks from face-api.js
 * @returns {Object} Blink detection result
 */
function detectBlink(landmarks) {
  const leftEye = landmarks.getLeftEye();
  const rightEye = landmarks.getRightEye();
  
  const leftEAR = calculateEAR(leftEye);
  const rightEAR = calculateEAR(rightEye);
  const avgEAR = (leftEAR + rightEAR) / 2;
  
  // EAR threshold for blink (eyes closed)
  const BLINK_THRESHOLD = 0.25;
  
  return {
    leftEAR,
    rightEAR,
    avgEAR,
    isBlinking: avgEAR < BLINK_THRESHOLD
  };
}

/**
 * Liveness check - requires user to blink
 * Collects multiple face descriptors and returns the best quality one
 * @param {HTMLVideoElement} videoElement 
 * @param {Function} onProgress - Progress callback
 * @param {number} timeout - Timeout in ms (default 15 seconds)
 * @returns {Promise<Object>} Liveness result
 */
async function performLivenessCheck(videoElement, onProgress, timeout = 15000) {
  const faceapi = await loadFaceApi();
  await loadModels();
  
  return new Promise((resolve) => {
    let blinkCount = 0;
    let wasBlinking = false;
    let framesWithFace = 0;
    let frameCount = 0;
    const startTime = Date.now();
    
    // Collect multiple descriptors for better quality selection
    const descriptorSamples = [];
    const MAX_SAMPLES = 10;
    
    const REQUIRED_BLINKS = 2;
    const MIN_FRAMES_WITH_FACE = 30;
    
    const checkFrame = async () => {
      if (Date.now() - startTime > timeout) {
        resolve({ 
          success: false, 
          error: 'Timeout - please try again',
          blinkCount,
          framesWithFace
        });
        return;
      }
      
      frameCount++;
      
      // Use higher input size for better accuracy during liveness
      const detection = await faceapi
        .detectSingleFace(videoElement, new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.4 }))
        .withFaceLandmarks()
        .withFaceDescriptor();
      
      if (detection) {
        framesWithFace++;
        
        // Collect high-quality samples (when eyes are open and face is well-centered)
        const blinkResult = detectBlink(detection.landmarks);
        if (!blinkResult.isBlinking && detection.detection.score > 0.8) {
          // Good quality frame - face detected with high confidence, eyes open
          if (descriptorSamples.length < MAX_SAMPLES) {
            descriptorSamples.push({
              descriptor: detection.descriptor,
              score: detection.detection.score,
              ear: blinkResult.avgEAR
            });
          }
        }
        
        // Detect blink transition (was open, now closed, then open again)
        if (blinkResult.isBlinking && !wasBlinking) {
          // Eyes just closed
        } else if (!blinkResult.isBlinking && wasBlinking) {
          // Eyes just opened = completed blink
          blinkCount++;
          console.log(` Blink detected! Count: ${blinkCount}`);
        }
        wasBlinking = blinkResult.isBlinking;
        
        if (onProgress) {
          onProgress({
            stage: 'liveness',
            faceDetected: true,
            blinkCount,
            requiredBlinks: REQUIRED_BLINKS,
            isBlinking: blinkResult.isBlinking,
            ear: blinkResult.avgEAR
          });
        }
        
        // Success condition
        if (blinkCount >= REQUIRED_BLINKS && framesWithFace >= MIN_FRAMES_WITH_FACE && descriptorSamples.length >= 3) {
          // Select best descriptor (highest detection score with open eyes)
          descriptorSamples.sort((a, b) => b.score - a.score);
          const bestSample = descriptorSamples[0];
          
          console.log(`\ud83c\udfaf Selected best descriptor from ${descriptorSamples.length} samples (score: ${bestSample.score.toFixed(3)})`);
          
          resolve({
            success: true,
            blinkCount,
            framesWithFace,
            descriptor: bestSample.descriptor,
            detectionScore: bestSample.score,
            samplesCollected: descriptorSamples.length,
            confidence: 'high'
          });
          return;
        }
      } else {
        if (onProgress) {
          onProgress({
            stage: 'liveness',
            faceDetected: false,
            blinkCount,
            requiredBlinks: REQUIRED_BLINKS
          });
        }
      }
      
      // Continue checking
      requestAnimationFrame(checkFrame);
    };
    
    checkFrame();
  });
}

// ========================================
// NFC Passport Reading (Web NFC API)
// ========================================

/**
 * Check if NFC is supported
 */
function isNFCSupported() {
  return 'NDEFReader' in window;
}

/**
 * Read NFC passport chip (ICAO 9303)
 * Note: Full passport reading requires BAC/PACE authentication
 * This is a simplified version that reads basic NFC data
 * 
 * @returns {Promise<Object>} NFC data
 */
async function readNFCChip() {
  if (!isNFCSupported()) {
    return { 
      success: false, 
      error: 'NFC not supported on this device/browser',
      hint: 'NFC reading requires Chrome on Android with NFC hardware'
    };
  }
  
  try {
    const ndef = new NDEFReader();
    
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        resolve({ 
          success: false, 
          error: 'NFC read timeout - hold your passport closer',
          hint: 'Place the NFC chip area of your passport against the phone'
        });
      }, 30000);
      
      ndef.scan().then(() => {
        console.log(' NFC scan started');
        
        ndef.addEventListener('reading', ({ message, serialNumber }) => {
          clearTimeout(timeout);
          
          console.log('✅ NFC tag read:', serialNumber);
          
          // Parse NDEF records
          const records = [];
          for (const record of message.records) {
            records.push({
              recordType: record.recordType,
              mediaType: record.mediaType,
              data: record.data ? new TextDecoder().decode(record.data) : null
            });
          }
          
          resolve({
            success: true,
            serialNumber,
            records,
            timestamp: Date.now(),
            // Note: Real passport data requires BAC authentication
            // which needs MRZ data from OCR to generate keys
            note: 'Basic NFC data read. Full passport authentication requires MRZ data.'
          });
        });
        
        ndef.addEventListener('readingerror', () => {
          clearTimeout(timeout);
          resolve({ 
            success: false, 
            error: 'Could not read NFC tag',
            hint: 'Try repositioning the passport'
          });
        });
      }).catch(err => {
        clearTimeout(timeout);
        resolve({ 
          success: false, 
          error: err.message,
          hint: 'Make sure NFC is enabled in your device settings'
        });
      });
    });
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ========================================
// Full Verification Flow
// ========================================

/**
 * Complete identity verification
 * @param {File} idDocument - ID document image file
 * @param {HTMLVideoElement} videoElement - Video element for webcam
 * @param {Function} onProgress - Progress callback
 * @param {Object} options - Options
 * @returns {Promise<Object>} Verification result
 */
async function verifyIdentity(idDocument, videoElement, onProgress, options = {}) {
  const {
    requireLiveness = true,
    requireNFC = false,
    minSimilarity = 60
  } = options;
  
  const result = {
    steps: {},
    success: false,
    verificationLevel: 0
  };
  
  try {
    // Step 1: Extract face from ID document
    if (onProgress) onProgress({ stage: 'id_extraction', status: 'starting' });
    
    const idFaceResult = await extractFaceFromID(idDocument);
    result.steps.idExtraction = idFaceResult;
    
    if (!idFaceResult.success) {
      result.error = 'Could not detect face on ID document';
      return result;
    }
    
    if (onProgress) onProgress({ stage: 'id_extraction', status: 'complete', score: idFaceResult.score });
    result.verificationLevel = 1;
    
    // Step 2: Liveness detection (if required)
    if (requireLiveness) {
      if (onProgress) onProgress({ stage: 'liveness', status: 'starting', message: 'Please blink twice' });
      
      const livenessResult = await performLivenessCheck(videoElement, onProgress);
      result.steps.liveness = livenessResult;
      
      if (!livenessResult.success) {
        result.error = livenessResult.error || 'Liveness check failed';
        return result;
      }
      
      if (onProgress) onProgress({ stage: 'liveness', status: 'complete', blinkCount: livenessResult.blinkCount });
      result.verificationLevel = 2;
      
      // Step 3: Face comparison
      if (onProgress) onProgress({ stage: 'face_match', status: 'starting' });
      
      const matchResult = await compareFaces(idFaceResult.descriptor, livenessResult.descriptor);
      result.steps.faceMatch = matchResult;
      
      if (!matchResult.match || matchResult.similarity < minSimilarity) {
        result.error = `Face match failed (${matchResult.similarity}% similarity, need ${minSimilarity}%)`;
        return result;
      }
      
      if (onProgress) onProgress({ stage: 'face_match', status: 'complete', similarity: matchResult.similarity });
      result.verificationLevel = 3;
    }
    
    // Step 4: NFC verification (if required and supported)
    if (requireNFC) {
      if (!isNFCSupported()) {
        result.steps.nfc = { success: false, error: 'NFC not supported', skipped: true };
      } else {
        if (onProgress) onProgress({ stage: 'nfc', status: 'starting', message: 'Hold passport to phone' });
        
        const nfcResult = await readNFCChip();
        result.steps.nfc = nfcResult;
        
        if (nfcResult.success) {
          result.verificationLevel = 4;
          if (onProgress) onProgress({ stage: 'nfc', status: 'complete' });
        }
      }
    }
    
    result.success = true;
    result.timestamp = Date.now();
    
    return result;
    
  } catch (err) {
    result.error = err.message;
    return result;
  }
}

// ========================================
// Export
// ========================================

window.FaceVerify = {
  // Loading
  loadFaceApi,
  loadModels,
  
  // Face detection
  detectFace,
  extractFaceFromID,
  compareFaces,
  
  // Camera
  startCamera,
  stopCamera,
  captureFrame,
  
  // Liveness
  performLivenessCheck,
  detectBlink,
  
  // NFC
  isNFCSupported,
  readNFCChip,
  
  // Full flow
  verifyIdentity
};

console.log('✅ FaceVerify module loaded');
