FROM python:3.10-slim

WORKDIR /app

# Install system dependencies for TextBlob
RUN apt-get update && apt-get install -y \
    gcc \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Default command (overridden for Worker in docker-compose)
CMD ["uvicorn", "project.main:app", "--host", "0.0.0.0", "--port", "8000"]
