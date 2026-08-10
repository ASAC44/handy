#!/bin/sh
set -eu

export DEBIAN_FRONTEND=noninteractive

apt-get update
apt-get install -y --no-install-recommends \
  ca-certificates \
  caddy \
  curl \
  docker-compose-v2 \
  docker.io \
  jq \
  unzip
apt-get clean

# DataHub's documented quickstart baseline includes swap. Four GiB keeps the
# single-host demo resilient while its Kafka, MySQL, OpenSearch, and GMS
# containers start together.
if [ ! -f /swapfile ]; then
  fallocate -l 4G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

install -d -o ubuntu -g ubuntu /opt/datahub

cat >/etc/docker/daemon.json <<'JSON'
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "20m",
    "max-file": "3"
  }
}
JSON

systemctl enable --now docker caddy
usermod -aG docker ubuntu

if [ ! -x /home/ubuntu/.local/bin/uvx ]; then
  sudo -u ubuntu env HOME=/home/ubuntu sh -c 'curl -LsSf https://astral.sh/uv/install.sh | sh'
fi

if [ ! -x /home/ubuntu/.local/bin/datahub ]; then
  sudo -u ubuntu env HOME=/home/ubuntu \
    /home/ubuntu/.local/bin/uv tool install --python 3.11 acryl-datahub
fi

cat >/etc/systemd/system/datahub-mcp.service <<'UNIT'
[Unit]
Description=DataHub MCP companion for Handy
After=network-online.target docker.service
Wants=network-online.target
Requires=docker.service

[Service]
Type=simple
User=ubuntu
Group=ubuntu
EnvironmentFile=/opt/datahub-mcp.env
ExecStart=/home/ubuntu/.local/bin/uvx mcp-server-datahub@0.6.0 --transport http
Restart=always
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full

[Install]
WantedBy=multi-user.target
UNIT

systemctl daemon-reload
systemctl enable datahub-mcp

touch /var/lib/cloud/instance/datahub-bootstrap-complete
