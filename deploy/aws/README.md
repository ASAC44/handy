# AWS Lightsail deployment

The production deployment uses one Lightsail Nano instance in `ap-south-1`.

- Instance: `handy-prod`
- Static IP: `handy-prod-ip`
- Bundle: `nano_3_1` ($5/month)
- Public URL: `https://handy.15.207.6.59.sslip.io`
- Services: `handy.service` (Bun) and `caddy.service` (HTTPS)

There are no snapshots, databases, load balancers, or paid monitoring add-ons.
The static IP is attached to the instance. Keep it attached to avoid an idle-IP
charge.

The host passcode is stored only in `/opt/handy/.env` on the instance with mode
`0600`. To retrieve it without copying it into a local file, use the Lightsail
console's browser SSH connection and run:

```sh
sudo sed -n 's/^HOST_PASSCODE=//p' /opt/handy/.env
```

The checked-in `lightsail-bootstrap.sh` installs Caddy and Bun, creates swap for
the 512 MB instance, and registers the systemd service used by the deployment.

## DataHub demo host

DataHub Core and its MCP companion run on a separate Lightsail instance so the
catalog workload cannot exhaust the Handy Nano instance.

- Instance: `handy-datahub-prod`
- Static IP: `handy-datahub-prod-ip` (`13.205.208.105`)
- Private IP: `172.26.6.51`
- Bundle: `large_3_1` ($44/month)
- Public UI: `https://datahub.13.205.208.105.sslip.io`
- DataHub Core: v1.6.0 quickstart containers
- MCP: `datahub-mcp.service` (`mcp-server-datahub` v0.6.0)

Only ports 22, 80, and 443 are open in the Lightsail firewall. DataHub GMS
(8080), the container frontend (9002), and MCP (8000) are not publicly exposed.
Handy reaches MCP over the Lightsail private network at
`http://172.26.6.51:8000/mcp`.

The checked-in `datahub-bootstrap.sh` installs Docker, Caddy, the DataHub CLI,
swap, log rotation, and the MCP systemd unit. The MCP token is stored only in
`/opt/datahub-mcp.env` on the DataHub host with mode `0600` and expires after
three months. There are no snapshots, load balancers, managed databases, or
paid monitoring add-ons on this host.

After running the bootstrap script, initialize the pinned demo release and
catalog as the `ubuntu` user:

```sh
datahub docker quickstart --version v1.6.0
datahub init --username datahub --password datahub --token-duration THREE_MONTHS
datahub datapack load showcase-ecommerce
```

Create `/opt/datahub-mcp.env` with the GMS URL, generated token, mutation flag,
private bind address, and port shown below, then start the MCP unit:

```dotenv
DATAHUB_GMS_URL=http://127.0.0.1:8080
DATAHUB_GMS_TOKEN=<generated token>
TOOLS_IS_MUTATION_ENABLED=true
SAVE_DOCUMENT_PARENT_TITLE=Handy Memory
FASTMCP_HOST=0.0.0.0
FASTMCP_PORT=8000
```

```sh
sudo chmod 0600 /opt/datahub-mcp.env
sudo systemctl restart datahub-mcp
sudo install -m 0644 deploy/aws/Caddyfile.datahub /etc/caddy/Caddyfile
sudo systemctl reload caddy
docker update --restart unless-stopped \
  datahub-mysql-1 datahub-kafka-broker-1 datahub-opensearch-1 \
  datahub-datahub-gms-quickstart-1 datahub-frontend-quickstart-1 \
  datahub-datahub-actions-quickstart-1
```
