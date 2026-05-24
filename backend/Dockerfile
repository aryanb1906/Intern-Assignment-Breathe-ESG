FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

COPY backend/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

COPY backend /app/backend
WORKDIR /app/backend

RUN python manage.py collectstatic --noinput || true

CMD ["gunicorn", "breathe_esg.wsgi:application", "--bind", "0.0.0.0:8000"]
