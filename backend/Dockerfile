# backend/Dockerfile
FROM python:3.11-slim

# Prevent interactive prompts during package installs
ENV DEBIAN_FRONTEND=noninteractive
ENV PYTHONUNBUFFERED=1
WORKDIR /app

# Install system deps (robust: retries, IPv4, fix-missing)
# - apt-transport-https and ca-certificates help HTTPS repos
# - Acquire options increase retries/timeouts for flaky mirrors
RUN apt-get update \
 && apt-get install -y --no-install-recommends apt-transport-https ca-certificates gnupg \
 && apt-get update \
 && apt-get -o Acquire::Retries=5 -o Acquire::http::Timeout=60 -o Acquire::ForceIPv4=true install -y --no-install-recommends \
    build-essential \
    git \
    curl \
    libsndfile1 \
 || (apt-get update && apt-get install -y --no-install-recommends --fix-missing \
    build-essential \
    git \
    curl \
    libsndfile1) \
 && rm -rf /var/lib/apt/lists/*

# Copy only requirements first so Docker layer caching helps
COPY requirements.txt /app/requirements.txt

# Upgrade pip + install Python deps (use PyTorch CPU wheel index)
# --no-cache-dir avoids caching large wheels in the image build context
# --prefer-binary helps prefer wheels over building from source
RUN pip install --upgrade pip setuptools wheel \
 && pip install --no-cache-dir --prefer-binary -r /app/requirements.txt --extra-index-url https://download.pytorch.org/whl/cpu

# Copy application source
COPY . /app

# Expose runtime port (Render provides $PORT at runtime)
ENV PORT=8000

# Final command: use bash -lc so $PORT expands at runtime
# If your FastAPI file or app variable differs, change `main:app` accordingly.
CMD ["bash", "-lc", "uvicorn main:app --host 0.0.0.0 --port $PORT"]
