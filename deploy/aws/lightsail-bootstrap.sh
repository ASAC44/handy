#!/bin/sh
set -eu

export DEBIAN_FRONTEND=noninteractive

apt-get update
apt-get install -y --no-install-recommends caddy curl unzip ca-certificates
apt-get clean

# Give the 512 MB instance enough headroom for dependency installation and deploys.
if [ ! -f /swapfile ]; then
  fallocate -l 1G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

install -d -o ubuntu -g ubuntu /opt/handy /opt/handy/exports

if [ ! -x /home/ubuntu/.bun/bin/bun ]; then
  sudo -u ubuntu env HOME=/home/ubuntu bash -c 'curl -fsSL https://bun.com/install | bash'
fi

cat >/etc/systemd/system/handy.service <<'UNIT'
[Unit]
Description=Handy Bun application
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=ubuntu
Group=ubuntu
WorkingDirectory=/opt/handy
EnvironmentFile=/opt/handy/.env
ExecStart=/home/ubuntu/.bun/bin/bun apps/server/src/index.ts
Restart=always
RestartSec=3
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full
ReadWritePaths=/opt/handy/exports

[Install]
WantedBy=multi-user.target
UNIT

systemctl daemon-reload
systemctl enable caddy handy

touch /var/lib/cloud/instance/handy-bootstrap-complete
