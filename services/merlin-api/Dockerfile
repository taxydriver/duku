# services/merlin-api/Dockerfile
FROM python:3.11-slim

# Needed by faiss-cpu wheel
RUN apt-get update && apt-get install -y --no-install-recommends libgomp1 \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy requirements FIRST (better cache)
COPY requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Copy your FastAPI app
COPY app ./app

# Make sure Python can import "app"
ENV PYTHONPATH=/app

EXPOSE 8080
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8080"]