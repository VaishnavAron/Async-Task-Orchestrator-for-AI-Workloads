import os
import sys
import time
import logging
from celery import Celery
from textblob import TextBlob

# ---------------------------------------------------------
# Celery Worker Configuration (Clean Predictable Naming)
# ---------------------------------------------------------
# Dynamic Redis URL: prioritize REDIS_URL for Render cloud, fallback to CELERY_BROKER_URL or localhost
REDIS_URL = os.environ.get('REDIS_URL', os.environ.get('CELERY_BROKER_URL', 'redis://localhost:6379/0'))

celery = Celery(
    'worker',
    broker=REDIS_URL,
    backend=os.environ.get('CELERY_RESULT_BACKEND', REDIS_URL)
)

celery.conf.update(
    task_serializer='json',
    accept_content=['json'],
    result_serializer='json',
    timezone='Asia/Kolkata',
    enable_utc=True,
    task_acks_late=True,                 # Late acknowledgment ensures zero task loss if worker dies
    task_reject_on_worker_lost=True,     # Re-queue task if worker drops unexpectedly
    task_retry_backoff=True,             # Exponential backoff on retries (1s, 2s, 4s...)
    task_retry_backoff_max=60,
    task_retry_jitter=True,
    worker_send_task_events=True,        # Real-time event streaming for telemetry & monitoring
    task_send_sent_event=True,
)

# Auto-configure solo pool on Windows to bypass billiard prefork IPC limitations
if os.name == "nt" or sys.platform == "win32":
    celery.conf.worker_pool = "solo"

# ---------------------------------------------------------
# Distributed AI Task: Real-Time Sentiment Analysis
# ---------------------------------------------------------
@celery.task(bind=True, max_retries=3, name="analyze_sentiment")
def analyze_sentiment(self, text: str):
    """
    Asynchronous NLP inference task.
    Offloads compute from API thread to Celery background worker pool.
    """
    try:
        # Chaos Simulation trigger for demonstrating retry & dead-letter behavior
        if text == "CRASH_SIMULATION":
            logging.warning("Chaos Injection: Simulating worker computational crash!")
            raise ValueError("Simulated worker crash! Testing retry & fault-tolerance logic.")

        if not text or len(text.strip()) == 0:
            raise ValueError("Empty text provided for NLP inference")

        # Simulate compute workload (like transformer inference / embeddings)
        time.sleep(5.0)

        blob = TextBlob(text)
        polarity = blob.sentiment.polarity  # Range: -1.0 to +1.0

        if polarity > 0.1:
            sentiment = "POSITIVE 😊"
            sentiment_tag = "POSITIVE"
            confidence = round(min(0.5 + abs(polarity) * 0.5, 0.99), 2)
        elif polarity < -0.1:
            sentiment = "NEGATIVE 😞"
            sentiment_tag = "NEGATIVE"
            confidence = round(min(0.5 + abs(polarity) * 0.5, 0.99), 2)
        else:
            sentiment = "NEUTRAL 😐"
            sentiment_tag = "NEUTRAL"
            confidence = round(1 - abs(polarity), 2)

        raw_hostname = self.request.hostname or "worker-01@local"
        clean_worker_id = raw_hostname.split('@')[0]

        return {
            "input_text": text,
            "sentiment": sentiment,
            "sentiment_tag": sentiment_tag,
            "confidence": confidence,
            "polarity_score": round(polarity, 3),
            "worker_id": clean_worker_id,
            "retry_count": self.request.retries,
            "timestamp": time.strftime("%H:%M:%S")
        }

    except Exception as exc:
        logging.error(f"Task failed: {exc}. Retrying in {2 ** self.request.retries}s...")
        raise self.retry(exc=exc, countdown=2 ** self.request.retries)
