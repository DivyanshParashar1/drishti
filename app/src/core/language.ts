import type { Lang } from './lang';

/** Everything that holds or depends on the current language (F8). */
export interface LanguageTargets {
  holder: { lang: Lang }; // services.lang, read by every per-call lang() getter
  reflex: { lang: Lang };
  player: { preloadPack(lang: Lang): Promise<unknown> };
  settings: { setLang(lang: Lang): Promise<void> };
  nameClips: { sync(lang: Lang): Promise<void> };
  phrases?: { load(lang: Lang): Promise<void>; sync(lang: Lang): Promise<void> };
}

/**
 * Switch language: from here on the clip pack, Timbre voice (/tts lang), Prisma hint (/stt lang),
 * VLM prompt (/ask lang), alerts and name clips all use `lang`. Persisted for the next start.
 * The new pack is preloaded before returning, so the confirmation plays from it.
 */
export async function applyLanguage(t: LanguageTargets, lang: Lang): Promise<void> {
  t.holder.lang = lang;
  t.reflex.lang = lang;
  await t.phrases?.load(lang).catch(() => undefined); // this language's saved Timbre phrases
  await Promise.all([t.player.preloadPack(lang).catch(() => undefined), t.settings.setLang(lang).catch(() => undefined)]);
  void t.nameClips.sync(lang); // fetch this language's name clips in the background
  void t.phrases?.sync(lang); // and its fixed phrases, if not saved yet
}
