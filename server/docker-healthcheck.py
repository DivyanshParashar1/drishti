"""Container healthcheck: GET /health with the app token. Exit 0 if healthy, 1 otherwise.

Reads PORT (default 8080) and APP_TOKEN (default "dev-token", the server's own default) from the
environment. Prints nothing, so the token never reaches `docker inspect` output.
"""

import os
import sys
import urllib.request

port = os.environ.get("PORT", "8080")
token = os.environ.get("APP_TOKEN") or "dev-token"
req = urllib.request.Request(
    f"http://127.0.0.1:{port}/health", headers={"Authorization": f"Bearer {token}"}
)
try:
    with urllib.request.urlopen(req, timeout=2) as r:
        sys.exit(0 if r.status == 200 else 1)
except Exception:
    sys.exit(1)
