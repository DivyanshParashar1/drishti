import { NativeModules } from 'react-native';
import { loadImage } from 'react-native-nitro-image';
import { FACE_EMBEDDER_ASSET } from '../models/detectorAssets';
import { loadWithFallback } from '../models/loadModel';
import type { Embedder } from '../vision/faceWorklet';
import type { PhotoDeps, PhotoFace } from './photoEnroll';

/** Native modules added in P17: present only in an APK built after them. */
const REBUILD = 'This needs the new APK (rebuild the app)';

let embedder: Promise<Embedder> | null = null;

/** The real photo pipeline: ML Kit still-image faces, nitro-image pixels, MobileFaceNet on CPU. */
export const photoDeps: PhotoDeps = {
  detect: async (uri) => {
    if (!NativeModules.FaceDetection) throw new Error(REBUILD);
    let FaceDetection: { detect(uri: string, o: object): Promise<PhotoFace[]> };
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      FaceDetection = require('@react-native-ml-kit/face-detection').default;
    } catch {
      throw new Error(REBUILD);
    }
    if (!FaceDetection?.detect) throw new Error(REBUILD);
    return FaceDetection.detect(uri, { performanceMode: 'accurate', landmarkMode: 'all', minFaceSize: 0.05 });
  },
  load: async (uri) => loadImage({ filePath: uri }),
  embedder: () => {
    embedder ??= loadWithFallback(FACE_EMBEDDER_ASSET, undefined, 'cpu').then((m) => m.model);
    return embedder;
  },
};

/**
 * Pick one photo from the gallery, cropped by the user to a square around the face. Cropping
 * re-encodes the image upright, so ML Kit and nitro-image see the same pixels (no EXIF
 * rotation mismatch). Null if cancelled.
 */
export async function pickFacePhoto(): Promise<string | null> {
  let ImagePicker: typeof import('expo-image-picker');
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    ImagePicker = require('expo-image-picker');
  } catch {
    throw new Error(REBUILD);
  }
  const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.9 });
  return r.canceled ? null : (r.assets[0]?.uri ?? null);
}
