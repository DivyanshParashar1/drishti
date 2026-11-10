import { memoryDb } from '../../core/__fixtures__/memoryDb';
import { FacesAdmin } from '../facesAdmin';
import { IdentityStore } from '../store';

async function setup() {
  const store = new IdentityStore(memoryDb(), () => 1);
  await store.init();
  const deleted: string[] = [];
  const synced: string[] = [];
  const admin = new FacesAdmin({
    store,
    deleteFiles: async (uris) => void deleted.push(...uris),
    syncClips: (lang) => void synced.push(lang),
    lang: () => 'hi-en',
  });
  return { store, admin, deleted, synced };
}

const emb = (k: number) => Array.from({ length: 4 }, (_, i) => (i === k ? 1 : 0));

test('create from a photo needs a name and consent; then name clips are made', async () => {
  const t = await setup();
  expect(await t.admin.addFromPhoto('  ', emb(0), true)).toMatchObject({ ok: false });
  expect(await t.admin.addFromPhoto('Priya', emb(0), false)).toMatchObject({ ok: false, message: expect.stringContaining('agreed') });
  expect(t.store.people).toHaveLength(0);
  const r = await t.admin.addFromPhoto(' Priya   Sharma ', emb(0), true);
  expect(r).toMatchObject({ ok: true, person: { name: 'Priya Sharma' } });
  expect(t.synced).toEqual(['hi-en']);
});

test('a photo under a saved name adds to that person instead of failing', async () => {
  const t = await setup();
  await t.admin.addFromPhoto('Priya', emb(0), true);
  const r = await t.admin.addFromPhoto('priya', emb(1), true);
  expect(r.ok).toBe(true);
  expect(t.store.people).toHaveLength(1);
  expect(t.store.people[0].embeddings).toHaveLength(2);
  await t.admin.addPhoto(t.store.people[0], emb(2));
  expect(t.store.people[0].embeddings).toHaveLength(3);
});

test('rename deletes the old name clips and makes new ones; a taken name is refused kindly', async () => {
  const t = await setup();
  await t.admin.addFromPhoto('Rahul', emb(0), true);
  await t.admin.addFromPhoto('Anil', emb(1), true);
  await t.store.setClip(t.store.find('Rahul')!.id, 'hi-en', 'file:///names/1-hi-en.mp3');
  expect(await t.admin.rename(t.store.find('Rahul')!, 'Anil')).toEqual({ ok: false, message: 'Someone is already saved with that name.' });
  const r = await t.admin.rename(t.store.find('Rahul')!, 'Rahul  Kumar');
  expect(r).toMatchObject({ ok: true, person: { name: 'Rahul Kumar' } });
  expect(t.deleted).toEqual(['file:///names/1-hi-en.mp3']);
});

test('delete removes the person and their clip files', async () => {
  const t = await setup();
  await t.admin.addFromPhoto('Rahul', emb(0), true);
  const rahul = t.store.find('Rahul')!;
  await t.store.setClip(rahul.id, 'en', 'file:///names/1-en.mp3');
  expect(await t.admin.remove(t.store.find('Rahul')!)).toMatchObject({ ok: true });
  expect(t.store.people).toHaveLength(0);
  expect(t.deleted).toEqual(['file:///names/1-en.mp3']);
});
