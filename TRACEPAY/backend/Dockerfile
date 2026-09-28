FROM python:3.12-slim

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY app ./app
COPY pdf_processor ./pdf_processor
COPY categorisation ./categorisation
COPY leak_intelligence ./leak_intelligence
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
