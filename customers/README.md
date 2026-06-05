# Kunden-Instanzen

Jeder Ordner `customers/<slug>/` steht für **eine eigene App-Instanz** (eigene DB, S3-Bucket, Domain).

| Datei | Beschreibung |
|-------|--------------|
| `metadata.json` | Kunden-Metadaten (Domain, Port, Status) |
| `instance.env.example` | Vorlage für Produktions-Konfiguration |
| `instance.env` | Echte Secrets — **nicht committen** |
| `nginx-site.conf.example` | Nginx-VHost |
| `systemd.service.example` | systemd-Unit |

## Befehle

```bash
# Neuen Kunden anlegen
node scripts/create-customer.js --slug kunde-b --name "Kunde B"

# Env validieren
node scripts/validate-instance-env.js --slug kunde-a

# Checkliste ausgeben
node scripts/print-onboarding-checklist.js kunde-a
```

## Registry

Alle Kunden: [`registry.json`](registry.json)
