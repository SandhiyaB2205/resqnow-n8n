# RESQNOW — Automation engine integration (n8n)

RESQNOW fires a JSON event for every meaningful action; the automation engine
(n8n) receives them and orchestrates emergency coordination, document
processing, consent, verification, notifications and audit.

## Security model (important)

- **Webhook URLs are server-side only.** The browser talks exclusively to the
  app's own gateway: `POST /api/n8n/webhook`. The upstream engine URL lives in
  `.env.local` as `N8N_FORWARD_URL` and **never** reaches client code.
- The gateway **retries failed deliveries 3×** and **queues undelivered
  events** (`queuedEvents` in `GET /api/n8n/webhook`), so nothing is lost when
  your n8n instance is briefly unreachable.
- No API secrets are exposed to the frontend (per the RESQNOW security rules).

```
Browser ──► POST /api/n8n/webhook ──► retry ×3 ──► n8n Webhook node
                    │                                   │
                    ▼                                   ▼
        GET /api/n8n/events (live stream)    POST /api/n8n/callback (results)
```

## Connect your n8n instance (2 steps)

1. **In n8n:** create (or import) a workflow with a **Webhook node**:
   - HTTP method: `POST`
   - Path: `resqnow` (or anything you choose)
   - Respond: *Immediately* or *Using 'Respond to Webhook' node*
   - Toggle the workflow **Active** (production URLs answer only when active).
2. **In the app:** put the Production URL into `resqnow-n8n/.env.local`:
   ```
   N8N_FORWARD_URL=https://rakesh00.app.n8n.cloud/webhook/resqnow
   ```
   Restart the dev server. `GET /api/n8n/webhook` now reports
   `"engineConnected": true`, and events arrive in your n8n **Executions** tab.

Use the audit-trail workflow as the single entry point: it receives every
event, writes the audit entry, and can fan out to the other workflows with
Switch/Execute-Workflow nodes (see `workflows/4-audit-trail.json`).

## Importable workflows (`/workflows`)

| # | File | Purpose |
| --- | --- | --- |
| 1 | `1-emergency-responder-packet.json` | QR scan → responder packet → contact alert |
| 2 | `2-consent-lifecycle.json` | Grants, expiries, revocations |
| 3 | `3-record-intake.json` | Record verification pipeline |
| 4 | `4-audit-trail.json` | Central audit writer (recommended entry point) |
| 5 | `5-notification-fanout.json` | Multi-channel access alerts |
| 6 | `6-patient-onboarding.json` | Wallet provisioning on sign-up |
| 7 | `7-emergency-coordination.json` | Case routing, hospital pre-alert, ambulance sync |
| 8 | `8-document-ocr.json` | OCR + AI structuring queue (attach your OCR node) |
| 9 | `9-access-requests.json` | Provider ALLOW/DENY routing, scoped grants |
| 10 | `10-notification-router.json` | Central recipient/channel router |
| 11 | `11-qr-security.json` | Scan audit, rate limiting hooks, token rotation |

## Event catalog

| Event | Source | Workflow |
| --- | --- | --- |
| `auth.signed_in` / `signed_up` / `signed_out` | Auth surfaces | Onboarding / audit |
| `document.uploaded` / `extracted` / `verified` / `rejected` | Documents page, `/api/documents/extract` | OCR & verification |
| `record.added` / `viewed` / `updated` / `verified` | Records surfaces | Record intake |
| `access.requested` / `approved` / `denied` | Doctor portal, `/api/access-requests`, Requests page | Consent & access |
| `consent.granted` / `revoked` | Consent & sharing page | Consent lifecycle |
| `emergency.started` / `hospital.accepted` / `ambulance.assigned` | Emergency Center, `/api/emergency/case` | Emergency coordination |
| `qr.generated` / `scanned` / `revoked` | QR surfaces, `/api/qr/[token]` | QR security |
| `audit.event`, `notify.access`, `settings.updated`, `health.ping` | Everywhere | Audit / router |

Every event is also recorded in the server-side stream:
`GET /api/n8n/events` — shown live on the **Automations** screens.

## App-side API contracts (workflow touchpoints)

| Endpoint | Method | Purpose |
| --- | --- | --- |
| `/api/n8n/webhook` | POST/GET/DELETE | Gateway: receive app events (+ status, queue drain) |
| `/api/n8n/callback` | POST | Workflows post outcomes back |
| `/api/n8n/events` | GET | Live gateway stream |
| `/api/documents/extract` | POST | Document → structured extraction (fields + confidence) |
| `/api/emergency/case` | POST | `start` / `accept_hospital` / `dispatch_ambulance` |
| `/api/qr/[token]` | GET | Token validation → limited emergency profile (audited) |
| `/api/access-requests` | GET/POST | Provider requests + patient ALLOW/DENY |
| `/api/notifications` | GET/POST/PATCH | Notification router + inbox |

## Product rules baked into the architecture

- AI/OCR output is **never auto-verified** — extraction always lands in a
  human review queue (patient corrections, provider verification).
- Emergency assessment is **assistive only**: priority + confidence +
  uncertainties, with "professional assessment required" surfaced.
- Hospital ranking uses **capability matching** and never invents live
  capacity ("live capacity unavailable").
- The QR contains **only a rotating reference token** — never medical data.
- Every sensitive action writes an **audit event** through the gateway.
- Patient-facing UI uses product language (Automation, Verification,
  Emergency Coordination) — "n8n" appears only on the internal admin screen.
