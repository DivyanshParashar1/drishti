import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { Services } from '../core/services';
import { deleteFiles } from '../identity/clipFiles';
import { FacesAdmin, type AdminResult } from '../identity/facesAdmin';
import { photoDeps, pickFacePhoto } from '../identity/photoDeps';
import { embedPhoto } from '../identity/photoEnroll';
import type { Person } from '../identity/store';
import { Action, m, Section, Sheet, Toggle } from './sheet';
import { colors, fonts, shape } from './tokens';

/** Pick a photo and turn it into one face embedding, or a message saying why not. */
async function photoEmbedding(): Promise<{ embedding: number[] } | { message: string } | null> {
  let uri: string | null;
  try {
    uri = await pickFacePhoto();
  } catch (e) {
    return { message: e instanceof Error ? e.message : String(e) };
  }
  if (!uri) return null; // cancelled
  const r = await embedPhoto(uri, photoDeps);
  return r.ok ? { embedding: r.embedding } : { message: r.message };
}

/**
 * P17 saved faces: list, add from a gallery photo (with the person's consent), add more photos,
 * rename and delete. Photos are turned into face embeddings and never stored.
 */
export function FacesManager({ services, onClose }: { services: Services; onClose: () => void }) {
  const { identities } = services;
  const admin = useMemo(
    () => new FacesAdmin({ store: identities, deleteFiles, syncClips: (lang) => void services.nameClips.sync(lang), lang: () => services.lang }),
    [identities, services],
  );
  const [people, setPeople] = useState(identities.people);
  useEffect(() => identities.onChange(() => setPeople(identities.people)), [identities]);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<AdminResult | null>(null);

  // New person from a photo
  const [name, setName] = useState('');
  const [consent, setConsent] = useState(false);

  const run = async (f: () => Promise<AdminResult | null>) => {
    setBusy(true);
    setNote(null);
    try {
      const r = await f();
      if (r) setNote(r);
    } finally {
      setBusy(false);
    }
  };

  const addNew = () =>
    run(async () => {
      if (!name.trim()) return { ok: false, message: 'Type a name first.' };
      if (!consent) return { ok: false, message: 'Confirm that this person agreed to be saved.' };
      const p = await photoEmbedding();
      if (!p) return null;
      if ('message' in p) return { ok: false, message: p.message };
      const r = await admin.addFromPhoto(name, p.embedding, consent);
      if (r.ok) {
        setName('');
        setConsent(false);
      }
      return r;
    });

  return (
    <Sheet title="Saved faces" onClose={onClose}>
      <Text style={[m.hint, fm.intro]}>
        Saved faces stay on this phone as face numbers only; photos are never kept. You can also save someone by voice: with them in front of the camera, say
        “Isko Rahul ke naam se save karo”.
      </Text>

      {note && <Text style={[fm.note, note.ok ? fm.noteOk : fm.noteErr]}>{note.message}</Text>}
      {busy && <ActivityIndicator color={colors.brand} style={fm.spinner} />}

      <Section title="Add from a photo">
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="Name"
          placeholderTextColor={colors.text3}
          style={fm.input}
          autoCapitalize="words"
          accessibilityLabel="Name of the person to save"
        />
        <Toggle label="They agreed to be saved" detail="Only save people who said yes" on={consent} onPress={() => setConsent((c) => !c)} />
        <View style={[m.row, fm.gap]}>
          <Action label="Choose photo…" onPress={() => void addNew()} />
        </View>
        <Text style={m.hint}>One face, front-facing, well lit. Crop the photo to the face when asked.</Text>
      </Section>

      <Section title={`Saved (${people.length})`}>
        {people.length === 0 && <Text style={m.hint}>No one saved yet.</Text>}
        {people.map((p) => (
          <PersonRow key={p.id} person={p} lang={services.lang} admin={admin} run={run} />
        ))}
      </Section>
    </Sheet>
  );
}

function PersonRow({
  person,
  lang,
  admin,
  run,
}: {
  person: Person;
  lang: Services['lang'];
  admin: FacesAdmin;
  run: (f: () => Promise<AdminResult | null>) => Promise<void>;
}) {
  const [renaming, setRenaming] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const voice = person.clips[lang] ? 'voice name ready' : 'voice name pending';
  return (
    <View style={fm.person}>
      {renaming === null ? (
        <Text style={fm.name}>{person.name}</Text>
      ) : (
        <TextInput value={renaming} onChangeText={setRenaming} style={fm.input} autoFocus accessibilityLabel={`New name for ${person.name}`} />
      )}
      <Text style={m.hint}>{`${person.embeddings.length} face sample${person.embeddings.length === 1 ? '' : 's'} · ${voice} · added ${new Date(person.createdAt).toLocaleDateString()}`}</Text>
      <View style={[m.row, fm.gap]}>
        {renaming === null ? (
          <>
            <Small label="Rename" onPress={() => setRenaming(person.name)} />
            <Small
              label="Add photo"
              onPress={() =>
                void run(async () => {
                  const p = await photoEmbedding();
                  if (!p) return null;
                  return 'message' in p ? { ok: false, message: p.message } : admin.addPhoto(person, p.embedding);
                })
              }
            />
            <Small
              label={confirmDelete ? 'Tap again to delete' : 'Delete'}
              danger
              onPress={() => {
                if (!confirmDelete) return setConfirmDelete(true);
                void run(() => admin.remove(person));
              }}
            />
          </>
        ) : (
          <>
            <Small
              label="Save"
              onPress={() =>
                void run(async () => {
                  const r = await admin.rename(person, renaming);
                  if (r.ok) setRenaming(null);
                  return r;
                })
              }
            />
            <Small label="Cancel" onPress={() => setRenaming(null)} />
          </>
        )}
      </View>
    </View>
  );
}

function Small({ label, onPress, danger }: { label: string; onPress: () => void; danger?: boolean }) {
  return (
    <Pressable onPress={onPress} style={[fm.small, danger && fm.danger]} accessibilityRole="button" accessibilityLabel={label}>
      <Text style={[fm.smallText, danger && fm.dangerText]}>{label}</Text>
    </Pressable>
  );
}

const fm = StyleSheet.create({
  intro: { marginTop: 4, fontSize: 14, lineHeight: 20 },
  note: { marginTop: 14, padding: 12, borderRadius: 10, fontSize: 14, lineHeight: 20, overflow: 'hidden' },
  noteOk: { backgroundColor: 'rgba(52,199,89,0.18)', color: colors.text },
  noteErr: { backgroundColor: 'rgba(255,59,48,0.2)', color: colors.text },
  spinner: { marginTop: 12 },
  input: { minHeight: 48, paddingHorizontal: 14, borderRadius: 10, backgroundColor: '#1c1c1e', color: colors.text, fontFamily: fonts.text, fontSize: 17 },
  gap: { marginVertical: 10 },
  person: { paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#333' },
  name: { color: colors.text, fontFamily: fonts.text, fontSize: 18, fontWeight: '700' },
  small: { minHeight: 40, paddingHorizontal: 14, borderRadius: shape.radiusChip, backgroundColor: '#2c2c2e', justifyContent: 'center' },
  smallText: { color: colors.text, fontSize: 14, fontWeight: '600' },
  danger: { backgroundColor: 'rgba(255,59,48,0.2)' },
  dangerText: { color: '#FF6961' },
});
