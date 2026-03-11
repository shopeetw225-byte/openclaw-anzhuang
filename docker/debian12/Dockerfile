FROM debian:12-slim

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y --no-install-recommends \
  bash \
  ca-certificates \
  curl \
  python3 \
  netcat-openbsd \
  lsof \
  iproute2 \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /opt/openclaw
COPY scripts/ ./scripts/
RUN chmod +x ./scripts/*.sh

CMD ["bash"]

