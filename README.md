# Immobiliencheck

Eine Webapp für Immobilienprüfungen und Handwerksbetriebe:

- Mitarbeiter erfassen Checklisten, Kommentare und Bilder.
- Checklisten werden als Entwurf gespeichert oder zur Prüfung eingereicht.
- Der Chef prüft Einreichungen, hinterlegt einen Freigabekommentar und gibt den Bericht frei.
- Bei Freigabe wird der **Kundenbericht automatisch per SMTP** versendet (wenn `MAIL_ENABLED=true` und SMTP in `.env` gesetzt sind).
- Ohne SMTP: E-Mail-Entwurf (`mailto:`) oder PDF-Download als Fallback.
- Jeder Prüfpunkt kann einen eigenen Kurzkommentar enthalten.

## Demo-Login (Cloud-Seed)

- `chef` / `123` (Passwort in Produktion ändern)
- Weitere Nutzer siehe Seed im Backend

## Lokal / Cloud starten

```bash
cp .env.example .env
# SMTP_* und DATABASE_URL anpassen
npm run docker:up
docker compose exec api npm run seed
```

App: http://localhost:3847

Ohne Docker nur API testen (Entwicklung):

```bash
cp .env.example .env
# NODE_ENV=development, DATABASE_URL auf lokale Postgres-Instanz
npm run migrate
npm run seed
npm start
```

Alle Einstellungen liegen in **`.env`** (Vorlage: **`.env.example`**).

## Produktion (Hetzner)

Siehe [`DEPLOY-HETZNER.md`](DEPLOY-HETZNER.md) — CX33, PostgreSQL, Object Storage, Domain, TLS.

Wichtig für automatischen Kundenbericht:

- `MAIL_ENABLED=true`
- `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`
- App nur über HTTPS-Domain öffnen (gleiche Origin wie API)

## GitHub Pages (nur Demo, ohne Cloud)

Statisches Hosting ohne Server — **kein** automatischer SMTP-Versand, nur `localStorage` und `mailto:`.

## Hinweis zur Datenspeicherung

Mit Cloud-Backend sind alle Nutzer synchron (PostgreSQL + Object Storage). Ohne Server: Daten nur im Browser (`localStorage`). Alte `werkstattcheck-*`-Schlüssel werden beim ersten Start migriert.
