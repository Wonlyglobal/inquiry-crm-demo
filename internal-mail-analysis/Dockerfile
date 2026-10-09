FROM docker.m.daocloud.io/library/python:3.11-slim-bookworm
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app
COPY worker.py /app/worker.py
USER 10001:10001
ENTRYPOINT ["python3", "-I", "/app/worker.py"]
