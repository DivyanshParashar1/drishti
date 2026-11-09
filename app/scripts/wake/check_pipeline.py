"""Run the app's wake-word pipeline (same buffering as src/voice/oww.ts) on WAV files.

  uv run --no-project --with ai-edge-litert --with numpy python -I check_pipeline.py <dir>

<dir> holds oww/{melspectrogram_1760,embedding_model,hey_jarvis_v0.1}.tflite and jarvis.wav /
other.wav (16 kHz mono, e.g. `say -o x.aiff ...; afconvert -f WAVE -d LEI16@16000 -c 1 x.aiff x.wav`).
Measured 2026-11-10: "Hey Jarvis…" peak 0.999; "Drishti… weather…" peak 0.000.
"""
import sys, wave
import numpy as np
from ai_edge_litert.interpreter import Interpreter

D = sys.argv[1]
def load(p):
    it = Interpreter(model_path=p); it.allocate_tensors(); return it
def run(it, x):
    it.set_tensor(it.get_input_details()[0]['index'], x.astype(np.float32)); it.invoke()
    return it.get_tensor(it.get_output_details()[0]['index'])
mel, emb, ww = load(f'{D}/oww/melspectrogram_1760.tflite'), load(f'{D}/oww/embedding_model.tflite'), load(f'{D}/oww/hey_jarvis_v0.1.tflite')
print('ww in', ww.get_input_details()[0]['shape'], 'out', ww.get_output_details()[0]['shape'])

def scores(pcm):
    pcm = np.concatenate([np.zeros(16000, np.int16), pcm, np.zeros(16000, np.int16)])
    raw = np.zeros(480, np.float32)       # history before the first chunk
    melbuf = np.ones((76, 32), np.float32)
    feats = []
    out = []
    for i in range(0, len(pcm) - 1279, 1280):
        chunk = pcm[i:i+1280].astype(np.float32)
        window = np.concatenate([raw, chunk])[-1760:]
        raw = window
        m = run(mel, window[None])[0, 0] / 10 + 2   # (8, 32)
        melbuf = np.vstack([melbuf, m])[-76:]
        feats.append(run(emb, melbuf[None, :, :, None])[0, 0, 0])
        feats = feats[-16:]
        out.append(float(run(ww, np.array(feats)[None])[0, 0]) if len(feats) == 16 else 0.0)
    return np.array(out)

for name in ('jarvis', 'other'):
    w = wave.open(f'{D}/{name}.wav'); pcm = np.frombuffer(w.readframes(w.getnframes()), np.int16)
    s = scores(pcm)
    print(name, 'peak %.3f' % s.max(), 'frames>0.5:', int((s > 0.5).sum()))
