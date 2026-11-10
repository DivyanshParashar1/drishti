# Drishti relay image.
#   docker build -t drishti-relay server          -> runtime stage (what Cloud Run builds)
#   docker compose up / docker compose run test   -> dev stage (adds pytest, ruff and tests/)

FROM python:3.11-slim AS base
COPY --from=ghcr.io/astral-sh/uv:0.13.5 /uv /usr/local/bin/uv
# The venv lives outside /srv so bind-mounting server code in dev never hides it.
ENV UV_PROJECT_ENVIRONMENT=/opt/venv \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    PYTHONUNBUFFERED=1 \
    PATH="/opt/venv/bin:$PATH"
WORKDIR /srv
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev
COPY docker-healthcheck.py /usr/local/bin/docker-healthcheck.py

FROM base AS dev
RUN uv sync --frozen
COPY app ./app
COPY tests ./tests
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload", "--ws", "websockets"]

FROM base AS runtime
COPY app ./app
RUN useradd --system --uid 10001 --no-create-home relay && chown -R relay /srv
USER relay
ENV PORT=8080
EXPOSE 8080
# Cloud Run ignores HEALTHCHECK; plain docker and compose use it. /health needs the app token
# (by design, tests/test_auth.py), so the check sends APP_TOKEN from the container's env.
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD ["python", "/usr/local/bin/docker-healthcheck.py"]
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT} --no-access-log --ws websockets"]
