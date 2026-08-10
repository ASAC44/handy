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
