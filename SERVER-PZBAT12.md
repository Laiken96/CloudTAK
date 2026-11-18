# CloudTAK-Server für PzBat 12

Betrieb der eigenen CloudTAK-Version (deutsche Oberfläche, ATAK-Funktionen)
auf einem Linux-Server mit fertigen Container-Images.

## Wie die Images entstehen

Bei jedem Push auf den Branch `atak-symbole` baut GitHub Actions
(`.github/workflows/pzbat12-images.yml`) vier Images und legt sie in der
GitHub Container Registry ab:

| Image | Aufgabe |
|---|---|
| `ghcr.io/laiken96/cloudtak-api` | Web-App und API |
| `ghcr.io/laiken96/cloudtak-pmtiles` | Kachel-Server |
| `ghcr.io/laiken96/cloudtak-events` | Importe (Datenpakete, Dateien) |
| `ghcr.io/laiken96/cloudtak-retention` | Aufräumen alter Daten |

Tags: `atak-symbole` (neuester Stand) und der volle Commit-SHA (feste Version).
Datenbank, Dateispeicher und Video-Server kommen als öffentliche Standard-Images.
Auf dem Server wird nichts gebaut.

## Voraussetzungen

- **Server:** Ubuntu 24.04 LTS, x86-64 (kein ARM), Richtwert 4 vCPU, 8 GB RAM, 50 GB Disk
- **DNS:** zwei A-Records auf die Server-IP, z. B. `cloudtak.example.ch` und `tiles.cloudtak.example.ch`
- **Firewall Server, eingehend:** 22 (SSH, wenn möglich nur eigene IP), 80 und 443 (HTTPS)
- **TAK-Server:** Port 8089 (Streaming), 8443 (API) und 8446 (Login) müssen vom CloudTAK-Server
  erreichbar sein. In der Azure-NSG des TAK-Servers 8443 für die IP des CloudTAK-Servers öffnen.
- **Admin-Zertifikat** (`.p12`, ROLE_ADMIN) des TAK-Servers für die Ersteinrichtung

## Installation

```bash
# 1. Docker und Caddy (Webserver mit automatischem HTTPS)
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker "$USER"          # danach ab- und wieder anmelden
sudo apt-get install -y caddy git

# 2. Code holen (nur für Compose-Dateien und Skripte)
sudo mkdir -p /opt/cloudtak && sudo chown "$USER" /opt/cloudtak
git clone -b atak-symbole https://github.com/Laiken96/CloudTAK.git /opt/cloudtak
cd /opt/cloudtak

# 3. Konfiguration mit zufälligen Geheimnissen
DOMAIN=cloudtak.example.ch               # anpassen
cat > .env <<EOF
COMPOSE_FILE=docker-compose.yml:docker-compose.pzbat12.yml
CLOUDTAK_IMAGE_TAG=atak-symbole
CLOUDTAK_Mode=docker-compose
CLOUDTAK_Config_media_url=http://media
SigningSecret=$(openssl rand -hex 32)
ASSET_BUCKET=cloudtak
AWS_S3_Endpoint=http://store:3900
AWS_S3_AccessKeyId=GK$(openssl rand -hex 12)
AWS_S3_SecretAccessKey=$(openssl rand -hex 32)
GARAGE_RPC_SECRET=$(openssl rand -hex 32)
POSTGRES=postgres://docker:docker@postgis:5432/gis
API_URL=https://$DOMAIN
PMTILES_URL=https://tiles.$DOMAIN
WEB_PLUGINS=
EOF
chmod 600 .env

# 4. HTTPS über Caddy
sudo tee /etc/caddy/Caddyfile > /dev/null <<EOF
$DOMAIN {
    reverse_proxy localhost:5000
}

tiles.$DOMAIN {
    reverse_proxy localhost:5002
}
EOF
sudo systemctl reload caddy

# 5. Images laden und starten
docker compose pull
docker compose up -d
```

Danach `https://cloudtak.example.ch` öffnen. Die Ersteinrichtung fragt nach
dem TAK-Server (Streaming `ssl://…:8089`, API `https://…:8443`,
WebTAK `https://…:8446`) und dem Admin-Zertifikat. Danach melden sich alle mit
ihrem TAK-Konto an.

Die `.env` enthält die Geheimnisse des Servers: nicht ins Git, sicher aufbewahren.

## Update

```bash
cd /opt/cloudtak
git pull
docker compose pull
docker compose up -d
```

Eine geprüfte Version festhalten: in der `.env` `CLOUDTAK_IMAGE_TAG=<commit-sha>`
setzen (SHA aus `git log` oder aus der Registry), dann `docker compose up -d`.

## Backup

```bash
./cloudtak.sh backup        # Datenbank nach ~/cloudtak-backups/cloudtak-<datum>.sql
```

Zusätzlich sichern: `.env` und den Dateispeicher `.docker-garage/`
(hochgeladene Dateien, Datenpakete). Ohne beide lässt sich ein Datenbank-Backup
nicht vollständig wiederherstellen.

## Sicherheit

- Nur 22, 80 und 443 offen. API, Kacheln, Datenbank und Video-Server sind nur
  lokal gebunden (`docker-compose.pzbat12.yml`).
- Die Instanz hält das Admin-Zertifikat des TAK-Servers: Server aktuell halten
  (`sudo apt-get install unattended-upgrades`), SSH nur mit Schlüssel.
- **Variante ohne öffentlichen Zugang:** Statt DNS und Caddy Tailscale auf dem
  Server installieren und `tailscale serve` für 5000 und 5002 einrichten (wie auf
  dem Mac). Dann braucht jedes Gerät die Tailscale-App, dafür ist keine
  Firewall-Öffnung nötig.

## Video-Streaming

Die Video-Ports (RTSP 8554, RTMP 1935, HLS 8888, SRT 8890) sind nur lokal
gebunden. Für Video in `docker-compose.pzbat12.yml` die benötigten Ports ohne
`127.0.0.1:` eintragen und in der Firewall öffnen.

## Lizenz

CloudTAK steht unter AGPL-3.0. Wer die geänderte Version als Dienst anbietet,
muss den Quellcode zugänglich machen. Das erfüllt der öffentliche Fork
`github.com/Laiken96/CloudTAK` (Branch `atak-symbole`).
