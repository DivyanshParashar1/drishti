import type { FaceLandmarks } from '../vision/faceAlign';
import { embedFaces, type CropImage, type Embedder, type MlFace } from '../vision/faceWorklet';
import { IDENTITY } from './config';

/** A face from ML Kit's still-image detector (@react-native-ml-kit/face-detection). */
export interface PhotoFace {
  frame: { left: number; top: number; width: number; height: number };
  landmarks?: Partial<Record<'leftEye' | 'rightEye' | 'mouthLeft' | 'mouthRight' | 'noseBase', { position: { x: number; y: number } }>>;
}

export interface PhotoDeps {
  /** ML Kit faces in the photo (accurate mode, with landmarks). */
  detect(uri: string): Promise<PhotoFace[]>;
  /** The same photo as pixels (nitro-image). */
  load(uri: string): Promise<CropImage>;
  /** MobileFaceNet, loaded on demand. */
  embedder(): Promise<Embedder>;
}

export type PhotoResult =
  | { ok: true; embedding: number[] }
  | { ok: false; reason: 'no_face' | 'many_faces' | 'too_small' | 'failed'; message: string };

const LANDMARK_KEYS = { leftEye: 'LEFT_EYE', rightEye: 'RIGHT_EYE', mouthLeft: 'MOUTH_LEFT', mouthRight: 'MOUTH_RIGHT', noseBase: 'NOSE_BASE' } as const;

/**
 * P17: one face embedding from a gallery photo, for the saved-faces screen. The same alignment
 * and embedder as live enrollment (F4), but one photo gives one embedding (live capture gives
 * 5–10), so add a few photos for better recognition. The photo itself is never stored.
 *
 * Exactly one face is required (a group photo would be ambiguous), at least `enrollMinPx` wide.
 */
export async function embedPhoto(uri: string, d: PhotoDeps): Promise<PhotoResult> {
  let faces: PhotoFace[];
  let image: CropImage;
  try {
    [faces, image] = await Promise.all([d.detect(uri), d.load(uri)]);
  } catch (e) {
    return { ok: false, reason: 'failed', message: `Couldn't read the photo (${e instanceof Error ? e.message : String(e)})` };
  }
  if (faces.length === 0) return { ok: false, reason: 'no_face', message: 'No face found. Use a clear, front-facing photo.' };
  if (faces.length > 1) return { ok: false, reason: 'many_faces', message: `${faces.length} faces found. Crop the photo to just this person.` };
  const f = faces[0];
  if (f.frame.width < IDENTITY.enrollMinPx) {
    return { ok: false, reason: 'too_small', message: 'The face is too small. Crop closer to the face, or use a bigger photo.' };
  }
  const landmarks: FaceLandmarks = {};
  for (const [from, to] of Object.entries(LANDMARK_KEYS) as [keyof typeof LANDMARK_KEYS, keyof FaceLandmarks][]) {
    const p = f.landmarks?.[from]?.position;
    if (p) landmarks[to] = { x: p.x, y: p.y };
  }
  const ml: MlFace = {
    bounds: { x: f.frame.left, y: f.frame.top, width: f.frame.width, height: f.frame.height },
    landmarks,
    frameWidth: image.width, // ML Kit read the same (upright, cropped) file: no rescaling
    frameHeight: image.height,
  };
  try {
    const [obs] = embedFaces([ml], image, await d.embedder(), {
      minFacePx: IDENTITY.enrollMinPx,
      maxFacesPerFrame: 1,
      cropScale: IDENTITY.cropScale,
    });
    if (!obs?.embedding) return { ok: false, reason: 'too_small', message: 'The face is too small. Crop closer to the face.' };
    return { ok: true, embedding: obs.embedding };
  } catch (e) {
    return { ok: false, reason: 'failed', message: `Couldn't process the face (${e instanceof Error ? e.message : String(e)})` };
  }
}
