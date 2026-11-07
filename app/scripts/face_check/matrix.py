"""Cosine matrix of the 4 photos' embeddings; see landmarks.py for usage."""
import sys, numpy as np
from ai_edge_litert.interpreter import Interpreter
d, model = sys.argv[1], sys.argv[2]
it = Interpreter(model_path=model); it.allocate_tensors()
ins = it.get_input_details(); out = it.get_output_details()[0]["index"]
L = lambda n: np.fromfile(f"{d}/{n}.f32", np.float32).reshape(3, 112, 112)
names = ["p1", "p2", "p3", "p4"]
for v in ["aligned", "box"]:  # "bgr" is a channel-order control
    E = []
    for i in range(4):
        t = L(f"{v}_{i}")
        it.set_tensor(ins[0]["index"], t[None]); it.set_tensor(ins[1]["index"], t[None]); it.invoke()
        e = it.get_tensor(out)[0]; E.append(e / np.linalg.norm(e))
    E = np.array(E); S = E @ E.T
    print(v); print("        " + "".join(f"{n:>8s}" for n in names))
    for i, n in enumerate(names): print(f"{n:>8s}" + "".join(f"{S[i,j]:8.3f}" for j in range(4)))
