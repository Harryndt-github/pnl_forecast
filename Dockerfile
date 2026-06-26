# ─────────────────────────────────────────────────────────────
#  PNL Forecast — Production image
#  Flask app served by Waitress (WSGI), matching `run.sh prod`.
# ─────────────────────────────────────────────────────────────
FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    FLASK_PORT=5050 \
    FLASK_DEBUG=false

WORKDIR /app

# System deps: FreeTDS for pymssql (MSSQL driver), gcc for any source builds.
RUN apt-get update \
    && apt-get install -y --no-install-recommends freetds-dev gcc \
    && rm -rf /var/lib/apt/lists/*

# Install Python deps first (better layer caching).
COPY requirements.txt .
RUN pip install --upgrade pip && pip install -r requirements.txt

# App source.
COPY . .

# Run as non-root.
RUN useradd --create-home --uid 10001 appuser \
    && mkdir -p /app/data \
    && chown -R appuser:appuser /app
USER appuser

EXPOSE 5050

HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
    CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:5050/api/health').status==200 else 1)" || exit 1

# Production WSGI server (Waitress). Reads FLASK_PORT at runtime.
CMD ["python", "-c", "from waitress import serve; from app import app; import os; port=int(os.getenv('FLASK_PORT','5050')); print(f'Waitress serving on http://0.0.0.0:{port}'); serve(app, host='0.0.0.0', port=port, threads=8)"]
