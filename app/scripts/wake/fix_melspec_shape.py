"""Pin openWakeWord's melspectrogram.tflite to a fixed [1, N] input (P17 wake word).

The released model has a dynamic input ([-1, -1]); openWakeWord resizes it at run time, which
react-native-fast-tflite can't do. This resizes the model in LiteRT, reads every tensor's real
shape, writes those shapes into the flatbuffer in place, and checks the patched model gives the
same output with no resize. The app feeds 1760 samples (80 ms chunk + 480 history) → 8 mel frames.

  uv run --no-project --with ai-edge-litert --with numpy --with tflite python -I \
    fix_melspec_shape.py melspectrogram.tflite melspectrogram_1760.tflite 1760

melspectrogram.tflite: https://github.com/dscripka/openWakeWord/releases/tag/v0.5.1
"""
import struct, sys
import numpy as np
import tflite
from ai_edge_litert.interpreter import Interpreter

src, dst, n = sys.argv[1], sys.argv[2], int(sys.argv[3])
ref = Interpreter(model_path=src); ref.resize_tensor_input(0, [1, n], strict=True); ref.allocate_tensors()
real = {d['index']: list(d['shape']) for d in ref.get_tensor_details()}

buf = bytearray(open(src, 'rb').read())
sg = tflite.Model.GetRootAsModel(buf, 0).Subgraphs(0)
changed = skipped = 0
for i in range(sg.TensorsLength()):
    t = sg.Tensors(i)
    want = real.get(i)
    for slot in (4, 18):  # Tensor.shape (field 0), Tensor.shape_signature (field 7)
        o = t._tab.Offset(slot)
        if o == 0: continue
        start, ln = t._tab.Vector(o), t._tab.VectorLen(o)
        old = [struct.unpack_from('<i', buf, start + 4*k)[0] for k in range(ln)]
        if want is None or len(want) != ln:
            if old != want: skipped += 1
            continue
        if old != want:
            for k, v in enumerate(want): struct.pack_into('<i', buf, start + 4*k, int(v))
            changed += 1
open(dst, 'wb').write(buf)
print('changed', changed, 'rank-mismatch skipped', skipped)

rng = np.random.default_rng(0)
x = (rng.uniform(-1, 1, (1, n)) * 8000).astype(np.int16).astype(np.float32)
ref.set_tensor(ref.get_input_details()[0]['index'], x); ref.invoke(); ya = ref.get_tensor(ref.get_output_details()[0]['index'])
b = Interpreter(model_path=dst); b.allocate_tensors()
print('patched in', b.get_input_details()[0]['shape'], 'out', b.get_output_details()[0]['shape'])
b.set_tensor(b.get_input_details()[0]['index'], x); b.invoke(); yb = b.get_tensor(b.get_output_details()[0]['index'])
print('max diff', float(np.abs(ya - yb).max()), 'range', float(ya.min()), float(ya.max()))
