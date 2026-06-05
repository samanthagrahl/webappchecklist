# Kunden-Onboarding (Instanz pro Kunde)

Diese Anleitung beschreibt, wie du einen neuen Kunden (z. B. **Kunde A**) von der leeren Instanz bis zum produktiven Betrieb bringst.

## Übersicht

```
1. Instanz vorbereiten (DNS, DB, S3, .env)
2. Technisch deployen (migrate, Admin, nginx, TLS)
3. Kunden-Daten einrichten (Mitarbeiter, Kundendatenbank)
4. Test & Übergabe
5. Registry auf „active“ setzen
```

Schnell-Checkliste ausgeben:

```bash
node scripts/print-onboarding-checklist.js kunde-a
```

---

## Phase 1: Technische Vorbereitung

### 1.1 Kunde in der Registry

**Kunde A** ist bereits angelegt unter `customers/kunde-a/`.  
Für weitere Kunden:

```bash
node scripts/create-customer.js --slug kunde-c --name "Kunde C"
```

### 1.2 DNS

A-Record anlegen:

| Typ | Name | Ziel |
|-----|------|------|
| A | `kunde-a` | IP deines Hetzner-Servers |

Ergebnis: `https://kunde-a.deine-domain.de` zeigt auf deinen Server.

### 1.3 PostgreSQL-Datenbank

In Hetzner Managed PostgreSQL (oder lokalem Postgres):

```sql
CREATE DATABASE immobiliencheck_kunde_a;
```

Einen dedizierten DB-User anlegen und `DATABASE_URL` notieren:

```
postgres://kunde_a_app:PASSWORT@db-host.hetzner.cloud:5432/immobiliencheck_kunde_a?sslmode=require
```

### 1.4 S3-Bucket

In Hetzner Object Storage:

1. Bucket `immobiliencheck-kunde-a` anlegen
2. Access Key / Secret Key in `instance.env` eintragen

Jeder Kunde hat einen **eigenen Bucket** — keine Datenvermischung.

### 1.5 Instanz-Konfiguration ausfüllen

```bash
cp customers/kunde-a/instance.env.example customers/kunde-a/instance.env
```

Pflichtwerte eintragen:

| Variable | Beispiel / Hinweis |
|----------|-------------------|
| `JWT_SECRET` | `openssl rand -base64 48` — **neu pro Kunde** |
| `DATABASE_URL` | Connection-String aus 1.3 |
| `S3_*` | Bucket + Keys aus 1.4 |
| `APP_PUBLIC_URL` | `https://kunde-a.deine-domain.de` |
| `SMTP_*` | Dein Mail-Relay |

Validieren:

```bash
node scripts/validate-instance-env.js --slug kunde-a
```

`instance.env` auf den Server kopieren:

```bash
scp customers/kunde-a/instance.env root@<server-ip>:/opt/immobiliencheck/customers/kunde-a/instance.env
```

---

## Phase 2: Deploy auf dem Server

SSH auf den Hetzner-Server:

```bash
ssh -i ~/.ssh/id_ed25519_hetzner root@<server-ip>
cd /opt/immobiliencheck
```

### 2.1 Schema migrieren

```bash
CUSTOMER_SLUG=kunde-a npm run migrate
```

### 2.2 Erst-Admin anlegen

**Nicht** `npm run seed` verwenden — das legt Demo-Nutzer (patrick, kristina, …) an.  
Stattdessen nur den Kunden-Chef:

```bash
cd backend
CUSTOMER_SLUG=kunde-a \
  ADMIN_USERNAME=chef \
  ADMIN_PASSWORD='SicheresPasswort123!' \
  ADMIN_LABEL='Chef (Kunde A)' \
  npm run upsert-boss-user
```

Zugangsdaten sicher an den Kunden übergeben (nicht per E-Mail im Klartext, wenn möglich).

### 2.3 systemd-Dienst

```bash
cp /opt/immobiliencheck/customers/kunde-a/systemd.service.example \
   /etc/systemd/system/immobiliencheck-kunde-a.service

systemctl daemon-reload
systemctl enable --now immobiliencheck-kunde-a
systemctl status immobiliencheck-kunde-a --no-pager
```

### 2.4 Nginx + HTTPS

Domain in `nginx-site.conf.example` anpassen (falls noch Platzhalter), dann:

```bash
cp customers/kunde-a/nginx-site.conf.example /etc/nginx/sites-available/immobiliencheck-kunde-a
ln -sf /etc/nginx/sites-available/immobiliencheck-kunde-a /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
certbot --nginx -d kunde-a.deine-domain.de
```

### 2.5 Technischer Test

```bash
curl -s https://kunde-a.deine-domain.de/api/v1/health
# {"ok":true}
```

Im Browser: `https://kunde-a.deine-domain.de` → Login-Maske erscheint.

---

## Phase 3: Kunden-Daten einrichten

Mit dem Chef-Zugang (`chef`) einloggen.

### 3.1 Mitarbeiter anlegen

Menü **Mitarbeiter** (nur voller Chef):

- Benutzername, Anzeigename, Rolle (`employee` oder `boss`)
- Passwort vergeben
- Optional: eingeschränkte Chef-Rechte (nur bestimmte Mitarbeiter / Vorlagen)

### 3.2 Kundendatenbank (Geschäftskunden)

Das sind die **Immobilien-/Servicekunden** des Betriebs — nicht die SaaS-Mandanten.

**Option A — CSV/XLSX-Import**

1. Vorlage: `templates/Kundenimport-Vorlage.csv`
2. In der App: Kundendatenbank → Import

**Option B — Manuell**

Kundendatenbank → Neuer Kunde (Name, Adresse, E-Mail, Vertrag, Prüfpunkte)

### 3.3 Checklisten-Vorlagen

Standard-Vorlagen sind beim ersten Start leer oder minimal. Prüfen unter **Vorlagen** / Checklisten-Konfiguration:

- Putzplan, Hausbegehung o. ä. anlegen
- Prüfpunkte-Katalog ggf. erweitern

### 3.4 Arbeitszeiten / Kalender

Falls benötigt: Dienstplan und wiederkehrende Regeln in der App konfigurieren.

### 3.5 Bestehende Daten migrieren (optional)

Wenn der Kunde vorher die localStorage-Version nutzte:

1. Im alten Browser Export-Skript aus [`DEPLOY-HETZNER.md`](DEPLOY-HETZNER.md) (Schritt 5) ausführen
2. JSON als `data/localstorage-export.json` speichern
3. Auf dem Server importieren:

```bash
CUSTOMER_SLUG=kunde-a npm run import:local
```

---

## Phase 4: Funktionstest vor Go-Live

| Test | Erwartung |
|------|-----------|
| Login Chef + Mitarbeiter | Beide Rollen funktionieren |
| Checkliste als Entwurf | Speichern OK |
| Checkliste einreichen | Chef sieht Einreichung |
| Freigabe + PDF | PDF wird erzeugt |
| E-Mail-Versand | Kunde erhält Bericht (wenn SMTP aktiv) |
| Bild-Upload | Datei erscheint im S3-Bucket unter `uploads/` |
| Mehrere Nutzer gleichzeitig | Keine Fehler (409-Konflikt = selten, in Konsole sichtbar) |

SMTP testen: Checkliste freigeben und Posteingang prüfen.  
Bei Fehlern: `journalctl -u immobiliencheck-kunde-a -n 50 --no-pager`

---

## Phase 5: Branding (optional)

Pro Kunden-Instanz kannst du anpassen:

| Datei | Inhalt |
|-------|--------|
| `logo-swiderski.png` | Durch Kunden-Logo ersetzen (gleicher Dateiname oder `index.html` anpassen) |
| `index.html` | Logo-Pfad, Alt-Text |
| `i18n.js` | Firmenname in PDF/E-Mail-Texten |

Nach Änderung: `git pull` auf dem Server + `systemctl restart immobiliencheck-kunde-a`.

Für vollständig getrenntes Branding pro Kunde ohne gemeinsamen Code-Pull wäre später ein Konfigurations-Endpoint denkbar — aktuell: **ein Deployment, gleicher Code, kundenspezifische Assets**.

---

## Phase 6: Übergabe an den Kunden

Dem Kunden übergeben:

1. **URL:** `https://kunde-a.deine-domain.de`
2. **Chef-Zugang:** Benutzername + Passwort (einmalig, Passwort-Änderung empfohlen)
3. **Kurzanleitung:** Mitarbeiter anlegen, Checkliste ausfüllen, Freigabe
4. **Support-Kontakt:** deine E-Mail/Telefon

Empfehlung: Chef-Passwort nach erstem Login über Mitarbeiter-Verwaltung ändern lassen.

---

## Phase 7: Abschluss (intern)

In `customers/registry.json` Status aktualisieren:

```json
"status": "active"
```

In `customers/kunde-a/metadata.json` ebenfalls `"status": "active"` und `"initialPasswordSet": true`.

---

## Zweiten Kunden onboarden

1. `node scripts/create-customer.js --slug kunde-b --name "Kunde B"`
2. DNS: `kunde-b.deine-domain.de`
3. Neue DB + neuer S3-Bucket
4. `instance.env` ausfüllen — **neues JWT_SECRET**, neue `DATABASE_URL`, neuer Bucket
5. **Neuer Port** (z. B. `3848`) — wird vom create-customer-Skript automatisch vergeben
6. Gleiche Deploy-Schritte wie oben
7. `systemctl restart` nur die neue Instanz

**Wichtig:** Niemals `JWT_SECRET`, Datenbank oder Bucket zwischen Kunden teilen.

---

## Fehlerbehebung

| Problem | Lösung |
|---------|--------|
| `Env-Datei nicht gefunden` | `CUSTOMER_SLUG` setzen oder Pfad prüfen |
| `Produktions-Konfiguration unvollständig` | `validate-instance-env.js` ausführen |
| Upload schlägt fehl | S3-Keys, Bucket-Name, `S3_FORCE_PATH_STYLE=true` |
| E-Mail kommt nicht an | SMTP Port 587, `SMTP_REQUIRE_TLS=true`, Logs prüfen |
| 502 Bad Gateway | `systemctl status immobiliencheck-<slug>`, Port in nginx vs. `APP_PORT` |
| Login funktioniert nicht | `upsert-boss-user` erneut mit `CUSTOMER_SLUG` |

Logs:

```bash
journalctl -u immobiliencheck-kunde-a -f
```
