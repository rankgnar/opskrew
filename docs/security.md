# Security

opskrew is designed to run on a personal VPS with security as a first-class concern. This document covers the security measures built into opskrew and how they protect your data and credentials.

---

## Encrypted vault

All secrets — API keys, tokens, email passwords — are stored in an AES-256-GCM encrypted file at `~/.opskrew/vault.enc`.

- The encryption key is derived from your machine's unique ID (`/etc/machine-id`) using `scrypt`
- The vault uses authenticated encryption (GCM mode) — tampering is detected
- File permissions are automatically enforced to `600` (owner read/write only) on every vault access
- Plain-text credentials are never written to disk anywhere

If someone steals the vault file, it is useless without access to the same machine.

---

## Token detection — secrets never reach the LLM

opskrew actively prevents API keys and tokens from being sent to the language model.

Before any message is sent to the AI provider, opskrew scans the content for common secret patterns (API keys, tokens, passwords). Detected secrets are redacted from the payload. This means even if a user accidentally pastes an API key into the chat, it will not be forwarded to OpenAI, Anthropic, or any other provider.

---

## Input sanitization

All inputs that are stored or used in structured contexts (skill IDs, agent IDs, field values) are sanitized before use:

- IDs are stripped of special characters and length-limited
- String fields are truncated to safe maximums
- File paths are never constructed from raw user input

---

## Skill scanner

Every skill — whether installed from a local file, a URL, or the dashboard — is scanned before it is activated. The scanner checks for:

| Threat class | Examples |
|---|---|
| Prompt injection | `ignore previous instructions`, `you are now`, `jailbreak` |
| Data exfiltration | `webhook.site`, `ngrok.io`, `curl ... \| bash` |
| Credential access | `cat ~/.ssh`, `cat ~/.env`, `OPENAI_API_KEY` |
| Destructive commands | `rm -rf /`, fork bombs, `dd if=... of=/dev/...` |
| Hidden instructions | HTML comments containing `secret`, `override`, `ignore` |
| Obfuscated code | `eval()`, `atob()`, `Buffer.from()` in skill content |

If any issue is detected, the skill is blocked and not installed. See [docs/skills.md](skills.md) for details.

---

## Dashboard bound to localhost

The web dashboard listens exclusively on `127.0.0.1:3000`. It is never reachable from the internet.

Access requires an SSH tunnel:

```bash
ssh -L 3000:127.0.0.1:3000 user@your-vps
```

This means:
- No TLS certificate required (traffic stays inside the SSH tunnel)
- No authentication layer needed on the dashboard itself (you're already authenticated via SSH)
- The dashboard surface is not exposed to port scanners or web bots

---

## Rate limiting on the dashboard

The dashboard API applies per-IP rate limiting on all endpoints. This prevents abuse if the dashboard were ever accidentally exposed, and limits the impact of any local network access.

---

## WhatsApp phone allowlist

If you use WhatsApp, you can restrict bot access to specific phone numbers. Messages from any number not on the allowlist are silently ignored. This is configured in the setup wizard.

---

## Server hardening via setup wizard

During `opskrew setup`, you can choose to harden your VPS:

**UFW firewall**
- Denies all incoming connections by default
- Opens only the ports you need (SSH and optionally others)
- Configured automatically — no manual `iptables` editing required

**fail2ban**
- Monitors SSH login attempts
- Automatically bans IPs with too many failed attempts
- Protects against brute-force attacks on your server

**Swap file**
- Adds a swap file if none exists
- Prevents OOM crashes on low-memory VPS instances (1GB RAM)

These are opt-in and applied only if you confirm during setup. You can rerun this section at any time:

```bash
opskrew setup --section security
```

---

## Retry and resilience

opskrew is designed to stay running reliably:

- **PM2 process manager** — if the process crashes, PM2 restarts it automatically
- **Retry on API failures** — transient errors from AI providers are retried with backoff before surfacing an error to the user
- **WhatsApp auto-reconnect** — if the WhatsApp connection drops, the bot reconnects automatically
- **Database WAL mode** — SQLite runs in Write-Ahead Logging mode, which is more resilient to crash-interrupted writes
- **Auto-update** — opskrew checks for updates hourly and restarts cleanly after rebuilding (opt-in)

---

## Summary

| Layer | Mechanism |
|---|---|
| Secrets at rest | AES-256-GCM encrypted vault, 600 permissions |
| Secrets in transit to LLM | Token detection and redaction before API calls |
| Skill safety | Pre-install scanner with blocklist of threat patterns |
| Dashboard access | Localhost-only binding + SSH tunnel |
| Server exposure | UFW firewall + fail2ban (setup wizard) |
| Process stability | PM2 auto-restart + WAL SQLite + API retry |
