import { memoryDb } from '../../core/__fixtures__/memoryDb';
import { IdentityStore } from '../store';
import { BASIS } from '../__fixtures__/embeddings';

async function newStore() {
  let t = 1000;
  const s = new IdentityStore(memoryDb(), () => t++);
  await s.init();
  return s;
}

test('add stores embeddings losslessly (float32) and caches the person', async () => {
  const s = await newStore();
  const p = await s.add('  Rahul ', [BASIS[0], BASIS[1]]);
  expect(p.name).toBe('Rahul');
  expect(p.createdAt).toBe(1000);
  expect(s.people).toHaveLength(1);
  expect(p.embeddings).toHaveLength(2);
  expect(p.embeddings[0]).toBeInstanceOf(Float32Array);
  expect(Array.from(p.embeddings[1])).toEqual(Array.from(Float32Array.from(BASIS[1])));
});

test('names are unique case-insensitively; empty name or no embeddings is rejected', async () => {
  const s = await newStore();
  await s.add('Rahul', [BASIS[0]]);
  await expect(s.add('rahul', [BASIS[1]])).rejects.toThrow('name exists');
  await expect(s.add('  ', [BASIS[1]])).rejects.toThrow('empty name');
  await expect(s.add('Priya', [])).rejects.toThrow('no embeddings');
  expect(s.find('RAHUL')?.name).toBe('Rahul');
  expect(s.find('nobody')).toBeUndefined();
});

test('setClip keeps one clip per language, replacing on update', async () => {
  const s = await newStore();
  const p = await s.add('Priya', [BASIS[2]]);
  await s.setClip(p.id, 'hi-en', 'file:///a.mp3');
  await s.setClip(p.id, 'en', 'file:///b.mp3');
  await s.setClip(p.id, 'hi-en', 'file:///c.mp3');
  expect(s.find('priya')!.clips).toEqual({ 'hi-en': 'file:///c.mp3', en: 'file:///b.mp3' });
});

test('remove deletes the person, embeddings and clips, and returns them for file cleanup', async () => {
  const db = memoryDb();
  const s = new IdentityStore(db);
  await s.init();
  const a = await s.add('Amit', [BASIS[3], BASIS[4]]);
  await s.setClip(a.id, 'hi-en', 'file:///amit.mp3');
  await s.add('Neha', [BASIS[5]]);
  const removed = await s.remove('amit');
  expect(removed?.clips).toEqual({ 'hi-en': 'file:///amit.mp3' });
  expect(s.people.map((p) => p.name)).toEqual(['Neha']);
  expect(await db.getAllAsync('SELECT * FROM embeddings WHERE person_id = ?', [a.id])).toEqual([]);
  expect(await db.getAllAsync('SELECT * FROM name_clips', [])).toEqual([]);
  expect(await s.remove('amit')).toBeNull();
});

test('data survives a reopen (init reloads the cache); listeners fire on change', async () => {
  const db = memoryDb();
  const s1 = new IdentityStore(db);
  await s1.init();
  const seen = jest.fn();
  const off = s1.onChange(seen);
  await s1.add('Rahul', [BASIS[0]]);
  expect(seen).toHaveBeenCalled();
  off();
  const s2 = new IdentityStore(db);
  await s2.init(); // CREATE IF NOT EXISTS is idempotent
  expect(s2.people.map((p) => p.name)).toEqual(['Rahul']);
});

test('addEmbeddings appends to an existing person', async () => {
  const s = await newStore();
  const p = await s.add('Rahul', [BASIS[0]]);
  await s.addEmbeddings(p.id, [BASIS[1], BASIS[2]]);
  expect(s.find('rahul')!.embeddings).toHaveLength(3);
});

test('rename changes the name, drops the old name clips, and refuses a taken or empty name', async () => {
  const s = new IdentityStore(memoryDb(), () => 1);
  await s.init();
  const rahul = await s.add('Rahul', [[1, 0]]);
  await s.add('Priya', [[0, 1]]);
  await s.setClip(rahul.id, 'hi-en', 'file:///names/1-hi-en.mp3');
  const { person, oldClips } = await s.rename(rahul.id, '  Rahul Kumar ');
  expect(person).toMatchObject({ id: rahul.id, name: 'Rahul Kumar', clips: {} });
  expect(person.embeddings).toHaveLength(1);
  expect(oldClips).toEqual(['file:///names/1-hi-en.mp3']);
  expect(s.find('rahul kumar')?.id).toBe(rahul.id);
  await expect(s.rename(rahul.id, 'priya')).rejects.toThrow('name exists');
  await expect(s.rename(rahul.id, ' ')).rejects.toThrow('empty name');
  await expect(s.rename(rahul.id, 'RAHUL KUMAR')).resolves.toBeTruthy(); // its own name in other case is fine
});
