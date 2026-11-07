# Deploy: Cloud Run relay and the preview APK (P13)

Everything here spends money or credits, so none of it runs automatically. Run the steps in order.

## 1. Relay on Cloud Run

Prerequisites: `gcloud auth login`, a GCP project with billing, and these three secrets in your shell (they go into Secret Manager and are never written to disk):

```sh
export PROJECT=<gcp-project-id>
export APP_TOKEN="$(openssl rand -hex 24)"   # the app ships this; it only unlocks the rate-limited relay
export GNANI_API_KEY=…
export OPENROUTER_API_KEY=…
./server/deploy.sh
```

What the script does (idempotent; re-run it to update):

| Setting | Value | Why |
| --- | --- | --- |
| Service, region | `drishti-relay`, `asia-south1` | Closest region to the users and to Gnani |
| min / max instances | 1 / 1 | min 1: no cold start (DT-13.2). max 1: the rate limit lives in memory (L1.1) |
| CPU, memory, concurrency | 1 vCPU, 512 MiB, 20 | The relay only waits on I/O; images are capped at 300 KB |
| Timeout | 300 s | Covers /stt WebSocket sessions and slow /ask streams |
| Service account | `drishti-relay@…` with `roles/aiplatform.user` and `roles/secretmanager.secretAccessor` | Vertex AI without a key file |
| Secrets | `APP_TOKEN`, `GNANI_API_KEY`, `OPENROUTER_API_KEY` from Secret Manager | The server refuses to start on Cloud Run with the dev token |
| Auth | `--allow-unauthenticated` | Cloud Run IAM is open; every route checks `APP_TOKEN`, `/health` included |

Variables: `VLM_PROVIDER` (default `openrouter`), `VLM_MODEL` (default `google/gemini-3.5-flash-lite`), `MIN_INSTANCES` (default 1), `ROTATE=1` to add new secret versions from the env.

### Smoke test (spends one /tts call)

```sh
cd server
DEPLOYED_URL=https://drishti-relay-….run.app APP_TOKEN=$APP_TOKEN uv run pytest -m live tests/test_live_deployed.py
SERVER_URL=https://drishti-relay-….run.app APP_TOKEN=$APP_TOKEN uv run python scripts/ask_probe.py --case stairs   # one /ask; compare timings with local
```

## 2. Idle cost of min-instances 1

Request-based billing charges a minimum instance's idle time at a reduced rate. Third-party summaries of Google's pricing page give an idle rate of about $0.0000025 per vCPU-second and $0.0000025 per GiB-second. For 1 vCPU and 0.5 GiB that is about $0.00000375 per second, or **about $10 a month** before the free tier. Confirm against the official pricing page for asia-south1 before relying on it.

Fallback if that's too much: deploy with `MIN_INSTANCES=0` (no idle cost) and warm the service before filming with a few `/health` calls:

```sh
for i in 1 2 3; do curl -s -o /dev/null -w '%{http_code} %{time_total}s\n' -H "Authorization: Bearer $APP_TOKEN" "$URL/health"; sleep 2; done
```

## 3. Spending caps

- **GCP:** a budget alert on the billing account (console → Billing → Budgets & alerts), for example ₹1,000 a month with alerts at 50%, 90% and 100%. A budget alerts; it doesn't stop spending. To hard-stop, set `MIN_INSTANCES=0` and delete the service when done.
- **OpenRouter:** set a credit limit on the API key (openrouter.ai → Keys → the key → Credit limit).
- **Gnani:** credits are prepaid; check the dashboard before and after filming (X-4.4).

## 4. Preview APK (no dev menu)

The app reads `SERVER_URL` and `APP_TOKEN` from the environment at build time (`app/app.config.ts`). For EAS builds they come from the `preview` environment:

```sh
cd app
eas env:create --environment preview --name SERVER_URL --value https://drishti-relay-….run.app --visibility plaintext
eas env:create --environment preview --name APP_TOKEN --value "$APP_TOKEN" --visibility sensitive
eas build --profile preview --platform android
```

The `preview` profile (`app/eas.json`) builds an installable release APK, which needs no Metro and has no dev menu. Install it from the EAS link, then run DT-13.1–13.3.

Notes:
- The APK carries `APP_TOKEN` by design (spec §10). Rotate it with `ROTATE=1 ./server/deploy.sh` and rebuild if it leaks.
- `@react-native-ml-kit/text-recognition` bundles the Chinese, Japanese and Korean OCR models, which we don't use (L10.2). Check the APK size; excluding them would need a gradle `exclude` in a config plugin.
