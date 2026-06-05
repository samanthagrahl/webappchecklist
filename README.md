# Immobiliencheck

Eine Webapp für Immobilienprüfungen und Handwerksbetriebe:

- Mitarbeiter erfassen Checklisten, Kommentare und Bilder.
- Checklisten werden als Entwurf gespeichert oder zur Prüfung eingereicht.
- Der Chef prüft Einreichungen, hinterlegt einen Freigabekommentar und gibt den Bericht frei.
- Bei Freigabe wird der **Kundenbericht automatisch per SMTP** versendet (wenn `MAIL_ENABLED=true` und SMTP in `.env` gesetzt sind).
- Ohne SMTP: E-Mail-Entwurf (`mailto:`) oder PDF-Download als Fallback.
- Jeder Prüfpunkt kann einen eigenen Kurzkommentar enthalten.

## Benutzer

Zugänge werden im Backend bzw. unter **Mitarbeiter** (voller Chef) verwaltet. Die Anmeldemaske zeigt keine Demo-Zugänge.

## Lokal testen (optional)

Für Produktion brauchst du **keine** lokale `.env` — Konfiguration liegt pro Kunde in `customers/<slug>/instance.env` auf dem Server.

Nur wenn du lokal mit Docker entwickeln willst:

```bash
cp .env.example .env
# DATABASE_URL auf docker-compose anpassen (siehe Kommentar in .env.example)
npm run docker:up
docker compose exec api npm run seed
```

App: http://localhost:3847

## Produktion (eigener Hetzner-Server)

**Multi-Instanz (empfohlen):** Jeder Kunde erhält eine eigene Instanz (eigene DB, eigener S3-Bucket, eigene Subdomain).

| Dokument | Inhalt |
|----------|--------|
| [`INFRASTRUKTUR.md`](INFRASTRUKTUR.md) | Plattform-Setup (Hetzner, S3, DNS) |
| [`ONBOARDING-KUNDE.md`](ONBOARDING-KUNDE.md) | Kunden anlegen und live bringen |
| [`DEPLOY-HETZNER.md`](DEPLOY-HETZNER.md) | Basis-Server-Installation |
| [`DEPLOY-UPDATE.md`](DEPLOY-UPDATE.md) | Code-Updates auf dem Server |

Erster Kunde vorbereitet: **`customers/kunde-a/`**

```bash
# Plattform-Konfiguration
cp infrastructure/platform.config.example.json infrastructure/platform.config.json

# Instanz prüfen
npm run customer:validate -- --slug kunde-a

# Onboarding-Checkliste
npm run customer:checklist -- kunde-a

# Weiteren Kunden anlegen
npm run customer:create -- --slug kunde-b --name "Kunde B"
```

Wichtig für automatischen Kundenbericht:

- `MAIL_ENABLED=true`
- `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`
- App nur über HTTPS-Domain öffnen (gleiche Origin wie API)

## GitHub Pages (nur Demo, ohne Cloud)

Statisches Hosting ohne Server — **kein** automatischer SMTP-Versand, nur `localStorage` und `mailto:`.

## Hinweis zur Datenspeicherung

Mit Cloud-Backend sind alle Nutzer synchron (PostgreSQL + Object Storage). Ohne Server: Daten nur im Browser (`localStorage`). Alte `werkstattcheck-*`-Schlüssel werden beim ersten Start migriert.
