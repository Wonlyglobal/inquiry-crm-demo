FROM docker.m.daocloud.io/library/python:3.11-slim-bookworm
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app
COPY proxy.py /app/proxy.py
USER 10003:10003
ENTRYPOINT ["python3", "-I", "/app/proxy.py"]
