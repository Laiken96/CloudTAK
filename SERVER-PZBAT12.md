# CloudTAK-Server für PzBat 12

Betrieb der eigenen CloudTAK-Version (deutsche Oberfläche, ATAK-Funktionen)
auf einem Linux-Server. Installiert wird ein Debian-Paket, die Anwendung
selbst läuft in fertigen Container-Images.

## Ablauf: vom Code zum Server

```
Änderung am Mac ──git push──▶ GitHub Actions (Pipeline "PzBat12 Build")
  (Branch pzbat12)               1. baut die Container-Images → ghcr.io/laiken96/cloudtak-*
                                 2. baut das Paket cloudtak-pzbat12_<version>_all.deb
                                 3. veröffentlicht es als GitHub-Release
                                          │
Server ◀──── sudo apt install ./cloudtak-pzbat12_<version>_all.deb  (von Hand)
```

- Pipeline: `.github/workflows/pzbat12-build.yml`, läuft bei jedem Push auf
  `pzbat12` (Dauer etwa 10 Minuten). Status: GitHub → Actions.
- Jede Paketversion ist fest an die Images ihres Commits gebunden. Ein
  Paket-Update ist damit das Update der ganzen Anwendung, ein älteres Paket
  installieren ist der Weg zurück.
- Auf den Server kommt nichts automatisch: neue Version = neues Paket installieren.
- Releases: https://github.com/Laiken96/CloudTAK/releases

### Eigene Änderungen

1. Am Mac ändern und lokal prüfen (Dev-Container `cloudtak-dev`:
   `npx vitest run`, `npm run lint`, `npm run check`, `npm run build`;
   Web-App unter `http://localhost:5080`).
2. Committen und auf `pzbat12` pushen.
3. Warten, bis die Pipeline grün ist; das neue Release erscheint unter
   Releases.
4. Auf dem Server das neue Paket installieren (siehe Update).

Texte der Oberfläche: `app/src/i18n/de.json` (englischer Text → deutsch).

## Voraussetzungen

- **Server:** Ubuntu 24.04 LTS, x86-64 (kein ARM), Richtwert 4 vCPU, 8 GB RAM, 50 GB Disk
- **DNS:** zwei A-Records auf die Server-IP, z. B. `cloudtak.example.ch` und `tiles.cloudtak.example.ch`
- **Firewall Server, eingehend:** 22 (SSH, wenn möglich nur eigene IP), 80 und 443 (HTTPS), 9997 (Video)
- **TAK-Server:** Port 8089 (Streaming), 8443 (API) und 8446 (Login) müssen vom CloudTAK-Server
  erreichbar sein. In der Azure-NSG des TAK-Servers 8443 für die IP des CloudTAK-Servers öffnen.
- **Admin-Zertifikat** (`.p12`, ROLE_ADMIN) des TAK-Servers für die Ersteinrichtung

## Installation

```bash
curl -LO https://github.com/Laiken96/CloudTAK/releases/latest/download/cloudtak-pzbat12.deb
sudo apt install ./cloudtak-pzbat12.deb          # bringt Docker, Compose und Caddy mit
sudo cloudtak-pzbat12 setup cloudtak.example.ch  # Domain anpassen
```

`setup` erzeugt `/opt/cloudtak/.env` mit zufälligen Geheimnissen, richtet HTTPS
über Caddy für die Domain und `tiles.<domain>` ein, lädt die Images und startet
alles. Danach `https://cloudtak.example.ch` öffnen: Die Ersteinrichtung fragt
nach dem TAK-Server (Streaming `ssl://…:8089`, API `https://…:8443`,
WebTAK `https://…:8446`) und dem Admin-Zertifikat. Anschliessend melden sich
alle mit ihrem TAK-Konto an.

### Login mit Bat-Wappen

Logo und Texte der Login-Seite sind Einstellungen der Instanz, nicht Teil des
Pakets. Nach der Ersteinrichtung einmal setzen: im Admin-Bereich unter
Konfiguration > Login-Einstellungen das Wappen als Logo hochladen (PNG mit
durchsichtigem Hintergrund oder SVG; freigestellte Fassung auf dem Mac:
`~/Claude_Projekte/PzBat12/Testdaten/wappen-pzbat12.png`, 274 × 368 Pixel).
Die Login-Seite zeigt es 150 Pixel hoch. Daraus entstehen auch die App-Symbole:
für Android/Chrome über das Manifest, für das iPhone (Home-Bildschirm) als
180 Pixel auf weissem Grund. Das iPhone übernimmt ein neues Symbol erst, wenn
die App vom Home-Bildschirm entfernt und neu hinzugefügt wird.

### Iconsets für alle (z. B. Signaturen)

Ein Iconset aus einem Datenpaket gehört nach dem Import nur der Person, die
es importiert hat. Damit alle es sehen:

1. Ein Admin importiert das Datenpaket (Menü > Datenpakete > Paket > Import
   Package, oder Menü > Iconsets > Import).
2. Menü > Iconsets > Iconset > Bearbeiten: «Public» einschalten.

Eine neue Version (gleiche UID, höhere Version im `iconset.xml`) ersetzt beim
Import die alte: neue Icons kommen dazu, geänderte werden ersetzt, entfernte
bleiben stehen, damit gesetzte Marker ihr Icon behalten. Ein öffentliches
Iconset kann nur ein Admin aktualisieren. Wer ein schon installiertes Iconset
nochmals importiert, bekommt einfach den Verweis darauf. Hat jemand anderes es
privat importiert, bricht der Import mit einer Meldung ab.

## Betrieb

```bash
sudo cloudtak-pzbat12 status            # Zustand der Container
sudo cloudtak-pzbat12 logs api          # Logs verfolgen (api, tiles, events, media, …)
sudo cloudtak-pzbat12 restart           # Anwendung neu starten
sudo cloudtak-pzbat12 stop | start
cloudtak-pzbat12 version                # installierte Paket- und Image-Version
```

Die Container starten nach einem Neustart des Servers von selbst.

## Update

Neues Paket aus den Releases installieren, das Paket lädt die passenden Images
und startet neu:

```bash
curl -LO https://github.com/Laiken96/CloudTAK/releases/latest/download/cloudtak-pzbat12.deb
sudo apt install ./cloudtak-pzbat12.deb
```

Eine bestimmte (auch ältere) Version: die versionierte Datei aus dem jeweiligen
Release installieren (`sudo apt install --allow-downgrades ./cloudtak-pzbat12_<version>_all.deb`).

## Backup und Wiederherstellung

```bash
sudo cloudtak-pzbat12 backup                    # → /var/backups/cloudtak-pzbat12/cloudtak-<datum>.tar.gz
sudo cloudtak-pzbat12 restore <archiv.tar.gz>   # überschreibt alle Daten, fragt nach
```

Das Archiv enthält Datenbank, `.env` (Geheimnisse) und Dateispeicher. Es
gehört nicht auf den Server allein: regelmässig an einen zweiten Ort kopieren.
Beim Wiederherstellen auf einem anderen Server bleiben dessen Adressen
(`API_URL`, `PMTILES_URL`) erhalten.

## Dateien auf dem Server

| Pfad | Inhalt |
|---|---|
| `/opt/cloudtak/docker-compose*.yml`, `garage.toml` | vom Paket, bei Updates ersetzt |
| `/opt/cloudtak/.env` | Konfiguration und Geheimnisse (von `setup`, bleibt bei Updates) |
| `/opt/cloudtak/.docker-garage/` | Dateispeicher (Uploads, Datenpakete) |
| Docker-Volume `cloudtak_postgis-data` | Datenbank |
| `/etc/caddy/Caddyfile` | HTTPS (von `setup`) |
| `/var/backups/cloudtak-pzbat12/` | Backups |

Eigene Anpassungen an der Compose-Konfiguration (z. B. Video-Ports) nicht in
die Dateien des Pakets schreiben, sondern in `/opt/cloudtak/docker-compose.local.yml`
und in der `.env` an `COMPOSE_FILE` anhängen:
`COMPOSE_FILE=docker-compose.yml:docker-compose.pzbat12.yml:docker-compose.local.yml`.

Entfernen: `sudo apt remove cloudtak-pzbat12` hält die Container an, Daten
bleiben erhalten.

## Sicherheit

- Nur 22, 80, 443 und 9997 (Video, siehe unten) offen. API, Kacheln, Datenbank
  und Video-Server sind nur lokal gebunden (`docker-compose.pzbat12.yml`).
- Die Instanz hält das Admin-Zertifikat des TAK-Servers: Server aktuell halten
  (`sudo apt install unattended-upgrades`), SSH nur mit Schlüssel.
- **Variante ohne öffentlichen Zugang:** `setup <domain> --no-caddy`, dann
  Tailscale auf dem Server installieren und `tailscale serve` für 5000 und 5002
  einrichten (wie auf dem Mac), für Video zusätzlich
  `tailscale serve --bg --https=9997 http://127.0.0.1:9997`;
  `API_URL`/`PMTILES_URL`/`CLOUDTAK_Config_media_external` in der `.env` auf
  die ts.net-Adressen setzen. Jedes Gerät braucht dann die Tailscale-App, dafür ist
  keine Firewall-Öffnung nötig.

## Video-Streaming

Die Clients (Browser, iPhone) spielen Videos als HLS über Port 9997 ab:
`https://<domain>:9997/stream/<lease>/index.m3u8`. Die Adresse kommt aus der
Einstellung `media::external` (`.env`: `CLOUDTAK_Config_media_external`,
von `setup` auf `https://<domain>` gesetzt). Ohne sie gibt CloudTAK
`http://localhost` heraus, und Video läuft nur auf dem Server selbst.
Caddy leitet `<domain>:9997` mit HTTPS an den Video-Server weiter, Port 9997
muss dafür in der Firewall offen sein. Streams vom TAK-Server (z. B. Drohne)
holt der Video-Server selbst ab, dafür braucht es keine weiteren Ports.

Die übrigen Video-Ports (RTSP 8554, RTMP 1935, HLS 8888, SRT 8890) sind nur lokal
gebunden. Für Video in `docker-compose.local.yml` beim Dienst `media` mit
`ports: !override` alle Ports neu angeben, die benötigten ohne `127.0.0.1:`
(siehe oben), und diese in der Firewall öffnen.

## Lizenz

CloudTAK steht unter AGPL-3.0. Wer die geänderte Version als Dienst anbietet,
muss den Quellcode zugänglich machen. Das erfüllt der öffentliche Fork
`github.com/Laiken96/CloudTAK` (Branch `pzbat12`).
