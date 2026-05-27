/**
 * Type definitions for face-api.js
 *
 * These types provide better IDE support for the dynamically loaded face-api.js library.
 * The library is loaded from CDN at runtime for browser-only face recognition.
 */

/** Bounding box for detected face */
export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Point coordinates */
export interface Point {
  x: number;
  y: number;
}

/** Face detection result */
export interface FaceDetectionResult {
  box: Box;
  score: number;
}

/** Face landmarks (68 points) */
export interface FaceLandmarks68 {
  positions: Point[];
  shift: Point;
  getLeftEye(): Point[];
  getRightEye(): Point[];
  getNose(): Point[];
  getMouth(): Point[];
  getJawOutline(): Point[];
  getLeftEyeBrow(): Point[];
  getRightEyeBrow(): Point[];
}

/** Face descriptor (128-dimensional embedding) */
export type FaceDescriptor = Float32Array;

/** Face detection with landmarks */
export interface WithFaceLandmarks<T> {
  detection: T;
  landmarks: FaceLandmarks68;
  unshiftedLandmarks: FaceLandmarks68;
  alignedRect: FaceDetectionResult;
}

/** Face detection with descriptor */
export interface WithFaceDescriptor<T> extends WithFaceLandmarks<T> {
  descriptor: FaceDescriptor;
}

/** Full face detection result */
export interface FullFaceDetection {
  detection: FaceDetectionResult;
  landmarks: FaceLandmarks68;
  descriptor: FaceDescriptor;
}

/** Options for TinyFaceDetector */
export interface TinyFaceDetectorOptions {
  inputSize?: number;
  scoreThreshold?: number;
}

/** Options for SsdMobilenetv1 */
export interface SsdMobilenetv1Options {
  minConfidence?: number;
  maxResults?: number;
}

/** Neural network model */
export interface NeuralNetwork<T> {
  loadFromUri(uri: string): Promise<void>;
  loadFromDisk(path: string): Promise<void>;
  load(url: string): Promise<void>;
  isLoaded: boolean;
}

/** Face detection task chain */
export interface FaceDetectionTask {
  withFaceLandmarks(useTinyModel?: boolean): FaceLandmarksTask;
}

/** Face landmarks task chain */
export interface FaceLandmarksTask {
  withFaceDescriptor(): Promise<FullFaceDetection | undefined>;
  withFaceDescriptors(): Promise<FullFaceDetection[]>;
}

/** Face-api.js main interface */
export interface FaceAPI {
  /** Neural network models */
  nets: {
    tinyFaceDetector: NeuralNetwork<unknown>;
    ssdMobilenetv1: NeuralNetwork<unknown>;
    faceLandmark68Net: NeuralNetwork<unknown>;
    faceLandmark68TinyNet: NeuralNetwork<unknown>;
    faceRecognitionNet: NeuralNetwork<unknown>;
    faceExpressionNet: NeuralNetwork<unknown>;
    ageGenderNet: NeuralNetwork<unknown>;
  };

  /** Detector options constructors */
  TinyFaceDetectorOptions: new (options?: TinyFaceDetectorOptions) => TinyFaceDetectorOptions;
  SsdMobilenetv1Options: new (options?: SsdMobilenetv1Options) => SsdMobilenetv1Options;

  /** Detect single face */
  detectSingleFace(
    input: HTMLImageElement | HTMLCanvasElement | HTMLVideoElement,
    options?: TinyFaceDetectorOptions | SsdMobilenetv1Options
  ): FaceDetectionTask;

  /** Detect all faces */
  detectAllFaces(
    input: HTMLImageElement | HTMLCanvasElement | HTMLVideoElement,
    options?: TinyFaceDetectorOptions | SsdMobilenetv1Options
  ): {
    withFaceLandmarks(useTinyModel?: boolean): {
      withFaceDescriptors(): Promise<FullFaceDetection[]>;
    };
  };

  /** Calculate Euclidean distance between face descriptors */
  euclideanDistance(descriptor1: FaceDescriptor, descriptor2: FaceDescriptor): number;

  /** Create canvas from media */
  createCanvasFromMedia(media: HTMLImageElement | HTMLVideoElement): HTMLCanvasElement;

  /** Match face descriptors */
  matchDimensions(canvas: HTMLCanvasElement, displaySize: { width: number; height: number }): void;

  /** Resize results to match display size */
  resizeResults<T>(results: T, displaySize: { width: number; height: number }): T;

  /** Draw detections on canvas */
  draw: {
    drawDetections(canvas: HTMLCanvasElement, detections: FaceDetectionResult[]): void;
    drawFaceLandmarks(canvas: HTMLCanvasElement, landmarks: FaceLandmarks68[]): void;
  };
}

declare global {
  interface Window {
    faceapi?: FaceAPI;
  }
}
