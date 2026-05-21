# Code-Update: Cursor → Live-Server

Anleitung, wenn am PC in Cursor etwas geändert wurde und es auf **https://app-swiderski.com** live gehen soll.

## Ablauf

```
Cursor (PC)  →  git commit + push  →  GitHub (PatrickSPM/immobiliencheck)
                                            ↓
Hetzner       →  git pull  →  ggf. npm install / migrate  →  Dienst neu starten
```

**Wichtig:** `.env` und Passwörter **nie** committen. Nur auf dem Server: `/opt/immobiliencheck/.env`.

---

## 1. Am PC: Änderungen prüfen

PowerShell im Projektordner:

```powershell
cd "C:\Users\chris\Documents\Codex\2026-04-24\erstelle-mir-eine-webapp-f-r-2"
git status
```

`.env` darf **nicht** in der Liste der zu committenden Dateien stehen.

---

## 2. Am PC: Commit & Push

```powershell
git add .
git commit -m "Kurz beschreiben was geändert wurde"
git push origin main
```

Repository: `https://github.com/PatrickSPM/immobiliencheck`

---

## 3. SSH zum Server

```powershell
ssh -i "$env:USERPROFILE\.ssh\id_ed25519_hetzner" root@178.105.199.248
```

(IP ggf. in der Hetzner-Konsole prüfen.)

---

## 4. Neuen Code holen

```bash
cd /opt/immobiliencheck
git pull
```

Falls `git pull` ohne Deploy-Key-Konfiguration scheitert:

```bash
GIT_SSH_COMMAND='ssh -i ~/.ssh/github_immobiliencheck -o IdentitiesOnly=yes' git pull
```

(Nach einmaligem `git config core.sshCommand "ssh -i ~/.ssh/github_immobiliencheck -o IdentitiesOnly=yes"` im Repo reicht `git pull`.)

---

## 5. Nur bei Bedarf

| Geändert | Zusätzlich |
|----------|------------|
| `backend/package.json` | `cd /opt/immobiliencheck/backend && npm install --omit=dev` |
| `backend/db/schema.sql` | `cd /opt/immobiliencheck/backend && npm run migrate` |
| Nur Frontend (`app.js`, `index.html`, `i18n.js`, `styles.css`, `js/`) | meist nichts |

`npm run seed` nur bei bewusstem Anlegen/Aktualisieren der Demo-Nutzer — nicht bei jedem Update.

---

## 6. App neu starten (fast immer)

```bash
systemctl restart immobiliencheck
systemctl status immobiliencheck --no-pager
curl -s http://127.0.0.1:3847/api/v1/health
```

Erwartung: `active (running)` und `"ok":true`.

---

## 7. Im Browser testen

- https://app-swiderski.com
- **Strg+F5** (Cache leeren)
- Geänderte Funktion prüfen

---

## `.env` ändern (SMTP, S3, Secrets)

Nicht pushen. Nur auf dem Server:

```bash
nano /opt/immobiliencheck/.env
systemctl restart immobiliencheck
```

---

## Fehler suchen

```bash
journalctl -u immobiliencheck -n 50 --no-pager
```

---

## Kurz-Checkliste

1. PC: `git add` → `commit` → `push`
2. SSH zum Server
3. `cd /opt/immobiliencheck && git pull`
4. ggf. `npm install` / `npm run migrate`
5. `systemctl restart immobiliencheck`
6. Browser: https://app-swiderski.com + Strg+F5

---

## Nicht bei jedem Update nötig

- Certbot (einmal eingerichtet, verlängert automatisch)
- PostgreSQL neu anlegen
- DNS bei IONOS ändern
- Deploy-Key neu anlegen

Erstinstallation: siehe [DEPLOY-HETZNER.md](DEPLOY-HETZNER.md).
