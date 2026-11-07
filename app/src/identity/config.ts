/**
 * Person identification tunables (F3). Calibrate on device: DT-8.1 (threshold), DT-8.2/8.4.
 *
 * Threshold: the spec starts at cosine 0.65, but that number isn't tied to a model. The shipped
 * MobileFaceNet's LFW verification threshold is 74.18° (cosine ≈ 0.27, Qualcomm AI Hub), so 0.65
 * would reject most genuine matches. 0.5 is a start that still leans hard toward "unknown"; DT-8.1
 * picks the real value from logged similarity distributions.
 */
export const IDENTITY = {
  threshold: 0.5,
  ambiguityMargin: 0.08, // best person must beat the runner-up by this much, else unknown
  minFacePx: 80, // face box width in frame pixels; smaller faces are not embedded
  voteWindow: 5, // last N embedded face frames per person track
  votesToName: 3, // the same name must win in ≥ 3 of the last 5
  unknownAfter: 5, // 5 embedded frames with no match → "unknown person"
  reannounceMs: 5 * 60_000, // a name is announced again only after 5 min absent
  unknownCooldownMs: 30_000, // at most one "unknown person" per 30 s
  maxFacesPerFrame: 2, // the embedder takes two faces per call
  mlkitMinFaceSize: 0.08, // ML Kit minFaceSize (head width / image width)
  cropScale: 2.2, // crop side / face box side (holds the aligned window)
  seedFrames: 5, // dev seed: embeddings captured per seeded person
};
export type IdentityConfig = typeof IDENTITY;
