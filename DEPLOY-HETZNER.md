# Deployment auf Hetzner (CX33 + Object Storage + Domain)

Diese Anleitung beschreibt den Betrieb der **Cloud-Version** mit:

- **CX33** (API + Webapp)
- **PostgreSQL** (empfohlen: Hetzner Managed Database oder Postgres auf dem CX33)
- **Object Storage** (Bilder, PDFs)
- **Domain** + TLS (Nginx + Certbot)

## Architektur

```
Browser  →  HTTPS (deine-domain.de)  →  CX33 (Node, Port 3847)
                                            ├── PostgreSQL
                                            └── Object Storage S3 (Dateien)
```

Die Webapp erkennt den Cloud-Modus automatisch über `GET /api/v1/health` und synchronisiert alle bisherigen `localStorage`-Daten über die REST-API.

## Was du von Hetzner brauchst

| Komponente | Hetzner-Produkt | Notizen |
|------------|-----------------|--------|
| Server | **CX33** | Ubuntu 24.04, SSH-Zugang |
| Datenbank | **Managed PostgreSQL** oder Postgres auf CX33 | Connection-String → `DATABASE_URL` |
| Dateien | **Object Storage** + Bucket | S3-Keys → `S3_*` in `.env` |
| Domain | **Pflicht für Produktion** | DNS A-Record → Server-IP, dann Certbot |

## Schritt 0: Domain vorbereiten

1. Domain bei deinem Registrar verwalten.
2. **A-Record** `app` (oder `@`) → öffentliche IPv4 des CX33.
3. In `.env`: `APP_PUBLIC_URL=https://app.deine-domain.de` (exakt wie im Browser).

Ohne Domain kannst du nur per IP testen; für HTTPS und E-Mail-Links ist die Domain Pflicht.

## Schritt 1: `.env` anlegen

```bash
cp .env.example .env
```

Alle Pflichtfelder ausfüllen (siehe Kommentare in `.env.example`), besonders:

- `JWT_SECRET` (lang, zufällig)
- `DATABASE_URL`
- `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`
- `APP_PUBLIC_URL` (deine Domain, mit `https://`)
- SMTP für **automatischen Kundenbericht** bei Freigabe (`MAIL_ENABLED=true`, `SMTP_*`)
- `TRUST_PROXY=true` (hinter Nginx)

## Schritt 2: Server vorbereiten (CX33)

```bash
# Auf dem Server (als root oder mit sudo)
apt update && apt upgrade -y
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs git nginx certbot python3-certbot-nginx
```

Projekt nach `/opt/immobiliencheck` klonen:

```bash
git clone https://github.com/PatrickSPM/immobiliencheck.git /opt/immobiliencheck
cd /opt/immobiliencheck
cp .env.example .env
nano .env
```

Backend installieren:

```bash
cd backend && npm install --omit=dev
npm run migrate
npm run seed
```

## Schritt 3: systemd-Dienst

Datei `/etc/systemd/system/immobiliencheck.service`:

```ini
[Unit]
Description=Immobiliencheck API
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/immobiliencheck/backend
EnvironmentFile=/opt/immobiliencheck/.env
ExecStart=/usr/bin/node src/index.js
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
systemctl daemon-reload
systemctl enable --now immobiliencheck
```

## Schritt 4: Nginx + Let's Encrypt

`/etc/nginx/sites-available/immobiliencheck`:

```nginx
server {
    listen 80;
    server_name app.deine-domain.de;

    client_max_body_size 30M;

    location / {
        proxy_pass http://127.0.0.1:3847;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

```bash
ln -s /etc/nginx/sites-available/immobiliencheck /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
certbot --nginx -d app.deine-domain.de
```

Danach: `https://app.deine-domain.de/api/v1/health` → `{ "ok": true }`.

## Schritt 5: Bestehende Browser-Daten importieren (einmalig)

1. Alte App im Browser öffnen (localStorage-Version).
2. DevTools → Konsole:

```javascript
const dump = {};
[
  "immobiliencheck-submissions-v1",
  "immobiliencheck-daily-attendance-v1",
  "immobiliencheck-staff-schedule-v1",
  "immobiliencheck-recurring-schedule-rules-v1",
  "immobiliencheck-work-orders-v1",
  "immobiliencheck-customer-db-v1",
  "immobiliencheck-guide-db-v1",
  "immobiliencheck-checklist-templates-v2",
  "immobiliencheck-checkpoint-catalog-v1"
].forEach((k) => {
  let v = localStorage.getItem(k);
  if (!v) {
    const legacy = k.replace(/^immobiliencheck-/, "werkstattcheck-");
    v = localStorage.getItem(legacy);
  }
  if (v) dump[k] = JSON.parse(v);
});
copy(JSON.stringify(dump));
```

3. JSON in `data/localstorage-export.json` speichern.
4. Auf dem Server: `node scripts/import-localstorage-export.js` (nach Login/DB-Setup).

Das Import-Skript akzeptiert sowohl neue als auch alte `werkstattcheck-*`-Schlüssel im JSON.

## Schritt 6: Test

- `https://app.deine-domain.de/api/v1/health` → `{ "ok": true }`
- Login mit `chef` / Passwort aus Seed
- Checkliste anlegen → in Object Storage sollten Dateien unter `uploads/` erscheinen

## Lokaler Test mit Docker

```bash
cp .env.example .env
# DATABASE_URL auf docker-compose anpassen:
# DATABASE_URL=postgres://immobiliencheck:immobiliencheck_dev_password@db:5432/immobiliencheck
# JWT_SECRET und S3_* setzen (oder S3 leer lassen → Uploads schlagen fehl)

docker compose up -d --build
docker compose exec api npm run seed
```

App: http://localhost:3847

## Weiterentwicklung

Du kannst weiter lokal am Code arbeiten (`app.js`, `i18n.js`, …), per Git pushen und auf dem Server `git pull` + `systemctl restart immobiliencheck` ausführen.

**Hinweis:** Bei gleichzeitiger Bearbeitung durch mehrere Nutzer kann es zu **Versionskonflikten** kommen (409), wenn zwei Personen dieselbe Datenbank-Sammlung gleichzeitig speichern. Die UI zeigt das derzeit in der Konsole an; bei Bedarf kann später ein Live-Sync (WebSocket) ergänzt werden.

## Checkliste vor Go-Live

- [ ] Domain + A-Record zeigt auf CX33
- [ ] `APP_PUBLIC_URL` mit `https://` gesetzt
- [ ] `JWT_SECRET` gesetzt
- [ ] `DATABASE_URL` (Backups aktivieren!)
- [ ] Object Storage Bucket + Keys
- [ ] SMTP getestet
- [ ] Passwörter der Seed-User geändert (`SEED_PASSWORD_*` + `npm run seed`)
- [ ] Firewall: nur 22, 80, 443 offen
- [ ] `TRUST_PROXY=true` hinter Nginx
- [ ] HTTPS mit Certbot aktiv
