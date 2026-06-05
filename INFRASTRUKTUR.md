# Eigene Infrastruktur (Hetzner + S3 + getrennte Kunden-Instanzen)

Diese Anleitung beschreibt den Betrieb **auf deinem eigenen Hetzner-Server**. Jeder Kunde erhält eine **eigene Instanz** mit separater Datenbank, separatem S3-Bucket und eigener Subdomain.

## Architektur

```
                    ┌─────────────────────────────────────────┐
                    │  Hetzner CX33 (dein Server)             │
                    │                                         │
  kunde-a.domain.de │  Nginx → :3847 → immobiliencheck-kunde-a│
  kunde-b.domain.de │  Nginx → :3848 → immobiliencheck-kunde-b│
                    │                                         │
                    └──────────┬──────────────┬───────────────┘
                               │              │
                    ┌──────────▼──┐    ┌──────▼──────────────┐
                    │ PostgreSQL   │    │ Hetzner Object      │
                    │ (pro Kunde   │    │ Storage (pro Kunde  │
                    │  eigene DB)  │    │  eigener Bucket)    │
                    └──────────────┘    └─────────────────────┘
```

**Wichtig:** Die App ist bewusst **Single-Tenant** (eine Instanz = ein Betrieb). Mandantentrennung erfolgt über **separate Deployments**, nicht über eine gemeinsame Datenbank mit `tenant_id`.

## Was du brauchst

| Komponente | Empfehlung | Zweck |
|------------|------------|-------|
| Server | Hetzner **CX33** (Ubuntu 24.04) | API + Webapp für alle Kunden-Instanzen |
| Datenbank | Hetzner **Managed PostgreSQL** | Pro Kunde eine eigene Datenbank |
| Dateien | Hetzner **Object Storage** | Pro Kunde ein eigener S3-Bucket |
| Domain | Eigene Domain (z. B. `deine-domain.de`) | Subdomains pro Kunde |
| SMTP | Dein Mail-Provider (Port **587**) | Automatischer Kundenbericht |

## Schritt 1: Plattform-Konfiguration anlegen

```bash
cp infrastructure/platform.config.example.json infrastructure/platform.config.json
```

Trage ein:

- `hetzner.serverIp` — öffentliche IP deines CX33
- `objectStorage.*` — Endpoint, Region, Access Keys (Hetzner Console → Object Storage)
- `dns.baseDomain` — deine Domain
- `smtp.*` — dein Mail-Relay
- `database.*` — Host der Managed DB (falls verwendet)

`platform.config.json` **nicht committen** (steht in `.gitignore`).

## Schritt 2: Server einrichten (einmalig)

Auf dem CX33:

```bash
apt update && apt upgrade -y
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs git nginx certbot python3-certbot-nginx

git clone <dein-repo> /opt/immobiliencheck
cd /opt/immobiliencheck/backend && npm install --omit=dev
```

Firewall: nur Ports **22**, **80**, **443** öffnen.

Details zum Basis-Setup: [`DEPLOY-HETZNER.md`](DEPLOY-HETZNER.md).

## Schritt 3: Kunden-Registry

Alle Kunden-Instanzen sind in [`customers/registry.json`](customers/registry.json) eingetragen.

Der erste Kunde **Kunde A** ist bereits vorbereitet:

| Eigenschaft | Wert |
|-------------|------|
| Slug | `kunde-a` |
| Domain | `kunde-a.deine-domain.de` |
| Port | `3847` |
| Datenbank | `immobiliencheck_kunde_a` |
| S3-Bucket | `immobiliencheck-kunde-a` |
| systemd | `immobiliencheck-kunde-a` |

Konfigurationsdateien liegen unter [`customers/kunde-a/`](customers/kunde-a/).

### Weitere Kunden anlegen

```bash
node scripts/create-customer.js --slug kunde-b --name "Kunde B" --fqdn kunde-b.deine-domain.de
```

Das Skript erzeugt den Ordner `customers/kunde-b/` und trägt den Kunden in die Registry ein.

## Schritt 4: Instanz-Konfiguration pro Kunde

Jeder Kunde hat eine eigene Env-Datei:

```
customers/<slug>/instance.env          ← echte Secrets (nicht committen)
customers/<slug>/instance.env.example ← Vorlage im Git
```

Pflichtfelder pro Instanz:

- `JWT_SECRET` — **eigenes** Secret pro Kunde (`openssl rand -base64 48`)
- `DATABASE_URL` — eigene PostgreSQL-Datenbank
- `S3_BUCKET` — eigener Bucket
- `APP_PUBLIC_URL` — `https://<subdomain>.<deine-domain.de>`
- `SMTP_*` — für E-Mail-Versand

Validierung vor Deploy:

```bash
node scripts/validate-instance-env.js --slug kunde-a
```

## Schritt 5: Datenbank und S3 pro Kunde

### PostgreSQL (Managed DB)

In der Hetzner-Konsole pro Kunde:

```sql
CREATE DATABASE immobiliencheck_kunde_a;
CREATE USER kunde_a_app WITH PASSWORD '...';
GRANT ALL PRIVILEGES ON DATABASE immobiliencheck_kunde_a TO kunde_a_app;
```

`DATABASE_URL` in `customers/kunde-a/instance.env` eintragen.

### Object Storage

In der Hetzner-Konsole pro Kunde einen Bucket anlegen, z. B. `immobiliencheck-kunde-a`.  
Access Keys aus der Plattform-Konfiguration können wiederverwendet werden — die **Trennung** erfolgt über **separate Buckets**.

## Schritt 6: Instanz starten (pro Kunde)

Auf dem Server, mit der Kunden-Env:

```bash
cd /opt/immobiliencheck

# Migration (Schema anlegen)
CUSTOMER_SLUG=kunde-a npm run migrate

# Erst-Admin anlegen (kein Demo-Seed nötig)
cd backend
CUSTOMER_SLUG=kunde-a ADMIN_USERNAME=chef ADMIN_PASSWORD='SicheresPasswort!' ADMIN_LABEL='Chef (Kunde A)' npm run upsert-boss-user
```

### systemd

```bash
cp customers/kunde-a/systemd.service.example /etc/systemd/system/immobiliencheck-kunde-a.service
systemctl daemon-reload
systemctl enable --now immobiliencheck-kunde-a
```

### Nginx + TLS

```bash
cp customers/kunde-a/nginx-site.conf.example /etc/nginx/sites-available/immobiliencheck-kunde-a
ln -s /etc/nginx/sites-available/immobiliencheck-kunde-a /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
certbot --nginx -d kunde-a.deine-domain.de
```

### Health-Check

```bash
curl -s https://kunde-a.deine-domain.de/api/v1/health
# → {"ok":true}
```

## Schritt 7: Code-Updates (alle Instanzen)

```bash
cd /opt/immobiliencheck
git pull
cd backend && npm install --omit=dev   # nur bei package.json-Änderung
npm run migrate                         # nur bei Schema-Änderung, pro Instanz:
CUSTOMER_SLUG=kunde-a npm run migrate

systemctl restart immobiliencheck-kunde-a
# Weitere Kunden: immobiliencheck-kunde-b, ...
```

## Umgebungsvariablen: Welche Datei wann?

| Datei | Zweck |
|-------|-------|
| `.env` | Lokale Entwicklung / Docker |
| `infrastructure/platform.config.json` | Deine Plattform-Daten (Hetzner, S3-Account, DNS) |
| `customers/<slug>/instance.env` | Produktion pro Kunde |

Backend-Befehle mit Kunden-Instanz:

```bash
CUSTOMER_SLUG=kunde-a npm run migrate
CUSTOMER_SLUG=kunde-a npm run upsert-boss-user
```

Alternativ:

```bash
INSTANCE_ENV_FILE=customers/kunde-a/instance.env npm run migrate
```

## Checkliste: Plattform bereit?

- [ ] Hetzner CX33 läuft, SSH funktioniert
- [ ] `infrastructure/platform.config.json` ausgefüllt
- [ ] Object Storage angelegt, Keys eingetragen
- [ ] Managed PostgreSQL erreichbar
- [ ] Domain + DNS für `*.deine-domain.de` konfiguriert
- [ ] SMTP getestet (Port 587)
- [ ] `customers/kunde-a/instance.env` ausgefüllt und validiert
- [ ] Kunde A deployed und Health-Check OK

## Nächster Schritt

Kunden-Onboarding (Mitarbeiter, Datenimport, Go-Live): [`ONBOARDING-KUNDE.md`](ONBOARDING-KUNDE.md)
