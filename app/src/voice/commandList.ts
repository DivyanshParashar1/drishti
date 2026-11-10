import type { Lang } from '../core/lang';
import type { Command } from './router';

/**
 * P17 voice-commands screen: what to say for each action, per app language.
 *
 * `say` is shown on screen in that language's script. `heard` is what Gnani's speech-to-text
 * returns for it when that differs (Hindi comes back romanised, P2); the commandList test runs
 * every `heard ?? say` through the router and checks it reaches `kind`, so the screen never
 * shows a phrase the app doesn't understand.
 */
export interface CommandExample {
  kind: Command['kind'];
  /** What it does, in English (the screen shows it under the phrase). */
  does: string;
  say: Partial<Record<Lang, string>>;
  heard?: Partial<Record<Lang, string>>;
}

export const COMMANDS: CommandExample[] = [
  {
    kind: 'describe',
    does: 'Describe what is in front of the camera',
    say: { 'hi-en': 'Saamne kya hai?', hi: 'सामने क्या है?', en: "What's in front of me?", ta: 'முன்னால் என்ன இருக்கிறது?' },
    heard: { hi: 'saamne kya hai' },
  },
  {
    kind: 'question',
    does: 'Ask anything about the scene',
    say: { 'hi-en': 'Kya ye bus 42 hai?', hi: 'क्या ये बस बयालीस है?', en: 'Is this bus number 42?', ta: 'இது 42 பேருந்தா?' },
    heard: { hi: 'kya ye bas 42 hai' },
  },
  {
    kind: 'read',
    does: 'Read printed text aloud',
    say: { 'hi-en': 'Ye padho', hi: 'ये पढ़ो', en: 'Read this', ta: 'இதைப் படி' },
    heard: { hi: 'ye padho' },
  },
  {
    kind: 'next',
    does: 'While reading: skip to the next paragraph',
    say: { 'hi-en': 'Aage', hi: 'आगे', en: 'Next', ta: 'அடுத்து' },
    heard: { hi: 'aage' },
  },
  {
    kind: 'stop',
    does: 'Stop speaking',
    say: { 'hi-en': 'Ruko', hi: 'रुको', en: 'Stop', ta: 'நிறுத்து' },
    heard: { hi: 'ruko' },
  },
  {
    kind: 'repeat',
    does: 'Repeat the last answer',
    say: { 'hi-en': 'Phir se bolo', hi: 'फिर से बोलो', en: 'Say that again', ta: 'மீண்டும் சொல்' },
    heard: { hi: 'phir se bolo' },
  },
  {
    kind: 'save',
    does: 'Remember the person in front (asks their consent)',
    say: { 'hi-en': 'Isko Rahul ke naam se save karo', hi: 'इसको राहुल के नाम से सेव करो', en: 'Save this as Rahul', ta: 'இவரை ராகுல் என்று சேமி' },
    heard: { hi: 'isko rahul ke naam se save karo' },
  },
  {
    kind: 'who',
    does: 'Say who is in front of you',
    say: { 'hi-en': 'Kaun hai?', hi: 'कौन है?', en: 'Who is here?', ta: 'இது யார்?' },
    heard: { hi: 'kaun hai' },
  },
  {
    kind: 'list',
    does: 'List everyone saved',
    say: { 'hi-en': 'Kaun kaun saved hai?', hi: 'कौन कौन सेव है?', en: 'Who is saved?', ta: 'சேமித்தவர்கள் பட்டியல்' },
    heard: { hi: 'kaun kaun saved hai' },
  },
  {
    kind: 'delete',
    does: 'Forget a saved person',
    say: { 'hi-en': 'Rahul ko delete karo', hi: 'राहुल को डिलीट करो', en: 'Delete Rahul', ta: 'ராகுல் பெயரை நீக்கு' },
    heard: { hi: 'rahul ko delete karo' },
  },
  {
    kind: 'quiet',
    does: 'Quiet mode: announce vehicles only (say "band karo" / "off" to end it)',
    say: { 'hi-en': 'Quiet mode chalu karo', hi: 'शांत मोड चालू करो', en: 'Quiet mode on', ta: 'அமைதி முறை' },
    heard: { hi: 'quiet mode chalu karo' },
  },
  {
    kind: 'language',
    does: 'Change the language',
    say: { 'hi-en': 'English mein bolo', hi: 'इंग्लिश में बोलो', en: 'Speak in Hindi', ta: 'ஆங்கிலத்தில் பேசு' },
    heard: { hi: 'english mein bolo' },
  },
  {
    kind: 'help',
    does: 'Play the spoken tutorial',
    say: { 'hi-en': 'Madad', hi: 'मदद', en: 'Help', ta: 'உதவி' },
    heard: { hi: 'madad' },
  },
  {
    kind: 'demo',
    does: 'Switch the demo screen off or on',
    say: { 'hi-en': 'Demo mode band karo', hi: 'डेमो मोड बंद करो', en: 'Demo mode off', ta: 'டெமோ நிறுத்து' },
    heard: { hi: 'demo mode band karo' },
  },
];

/** The examples for one language, falling back to English where a language has no phrase yet. */
export function commandsFor(lang: Lang): { kind: Command['kind']; does: string; say: string; heard: string }[] {
  return COMMANDS.map((c) => {
    const say = c.say[lang] ?? c.say.en!;
    return { kind: c.kind, does: c.does, say, heard: c.heard?.[lang] ?? (c.say[lang] ? say : c.say.en!) };
  });
}
