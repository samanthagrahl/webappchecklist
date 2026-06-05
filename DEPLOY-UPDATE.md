# Code-Update: Cursor → Live-Server

Anleitung, wenn am PC in Cursor etwas geändert wurde und es auf dem Hetzner-Server live gehen soll.

## Ablauf

```
Cursor (PC)  →  git commit + push  →  GitHub (samanthagrahl/webappchecklist)
                                            ↓
Hetzner       →  git pull  →  ggf. npm install / migrate  →  Dienst neu starten
```

**Wichtig:** Secrets **nie** committen. Auf dem Server nur `customers/<slug>/instance.env` (nicht ins Git).

---

## 1. Am PC: Änderungen prüfen

```powershell
cd "C:\Users\chris\OneDrive\Desktop\Handwerkerapp - Rohbau vor serveranpassung"
git status
```

`instance.env` und `platform.config.json` dürfen **nicht** committed werden.

---

## 2. Am PC: Commit & Push

```powershell
git add .
git commit -m "Kurz beschreiben was geändert wurde"
git push origin main
```

Repository: `https://github.com/samanthagrahl/webappchecklist`

---

## 3. SSH zum Server

```powershell
ssh -i "$env:USERPROFILE\.ssh\id_ed25519_hetzner" root@<deine-server-ip>
```

---

## 4. Neuen Code holen

```bash
cd /opt/immobiliencheck
git pull
```

---

## 5. Nur bei Bedarf

| Geändert | Zusätzlich |
|----------|------------|
| `backend/package.json` | `cd backend && npm install --omit=dev` |
| `backend/db/schema.sql` | `CUSTOMER_SLUG=kunde-a npm run migrate` (pro Instanz) |
| Nur Frontend (`app.js`, `index.html`, `i18n.js`, …) | meist nichts |

`npm run seed` nur für lokale Entwicklung — Produktion: `upsert-boss-user`.

---

## 6. App neu starten

```bash
systemctl restart immobiliencheck-kunde-a
systemctl status immobiliencheck-kunde-a --no-pager
curl -s http://127.0.0.1:3847/api/v1/health
```

Weitere Kunden: `immobiliencheck-kunde-b`, …

---

## 7. Im Browser testen

- `https://kunde-a.deine-domain.de` (Strg+F5)
- Geänderte Funktion prüfen

---

## Secrets ändern (SMTP, S3, JWT)

Nur auf dem Server:

```bash
nano /opt/immobiliencheck/customers/kunde-a/instance.env
systemctl restart immobiliencheck-kunde-a
```

---

## Fehler suchen

```bash
journalctl -u immobiliencheck-kunde-a -n 50 --no-pager
```

---

## Kurz-Checkliste

1. PC: `git add` → `commit` → `push`
2. SSH zum Server
3. `cd /opt/immobiliencheck && git pull`
4. ggf. `npm install` / `CUSTOMER_SLUG=... npm run migrate`
5. `systemctl restart immobiliencheck-<slug>`
6. Browser testen

Erstinstallation: [`INFRASTRUKTUR.md`](INFRASTRUKTUR.md) und [`ONBOARDING-KUNDE.md`](ONBOARDING-KUNDE.md).
