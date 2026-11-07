/**
 * Person identification tunables (F3). Calibrate on device: DT-8.1 (threshold), DT-8.2/8.4.
 *
 * Threshold: the spec starts at cosine 0.65, but that number isn't tied to a model. The shipped
 * MobileFaceNet's LFW verification threshold is 74.18° (cosine ≈ 0.27, Qualcomm AI Hub). A laptop
 * check through our alignment gave 0.82 for the same person and 0.06–0.14 between different
 * people (P8, 4 photos), so 0.5 sits well clear of both and still leans toward "unknown". DT-8.1
 * picks the real value from on-device similarity distributions.
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
  // F4 enrollment capture: 5–10 frames over about 3 s with exactly one face ≥ 100 px.
  enrollMinPx: 100,
  enrollMaxFrames: 10,
  enrollMinFrames: 5,
  enrollCaptureMs: 4000, // starts with the "face the camera" prompt, so a bit over 3 s
  enrollGapMs: 300, // ≥ 300 ms between captured frames (10 frames span ~3 s)
  dialogTimeoutMs: 30_000, // waiting for a name or a yes/no
};
export type IdentityConfig = typeof IDENTITY;
