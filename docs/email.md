# Email Integration

opskrew can read, search, and send emails through your existing email account using IMAP (for reading) and SMTP (for sending). Once configured, your assistant can check your inbox, find messages, and compose emails — all through your messaging channel.

---

## What it can do

- Read your latest emails (subject, sender, date, preview)
- Search emails by subject or sender
- Send emails to any address

---

## Configuration

Run the setup wizard and select the email section:

```bash
opskrew setup --section email
```

You will be asked for:

| Setting | Description | Example |
|---|---|---|
| IMAP host | Incoming mail server | `imap.gmail.com` |
| IMAP port | Usually 993 (SSL) | `993` |
| SMTP host | Outgoing mail server | `smtp.gmail.com` |
| SMTP port | Usually 587 (TLS) or 465 (SSL) | `587` |
| Username | Your email address | `you@gmail.com` |
| Password | Your email password or app password | see below |

All credentials are stored in the encrypted vault (`~/.opskrew/vault.enc`). They are never written in plain text.

### Gmail setup

Gmail requires an **App Password** — your regular Google account password will not work if 2FA is enabled (which is strongly recommended).

1. Go to your Google Account → [Security](https://myaccount.google.com/security)
2. Enable 2-Step Verification if not already active
3. Go to [App passwords](https://myaccount.google.com/apppasswords)
4. Select app: **Mail** — Select device: **Other** → enter `opskrew`
5. Copy the 16-character password that appears
6. Use this password in the opskrew setup wizard

Settings for Gmail:

```
IMAP host: imap.gmail.com     port: 993
SMTP host: smtp.gmail.com     port: 587
```

### Other providers

| Provider | IMAP host | IMAP port | SMTP host | SMTP port |
|---|---|---|---|---|
| Outlook / Hotmail | `imap-mail.outlook.com` | 993 | `smtp-mail.outlook.com` | 587 |
| Yahoo Mail | `imap.mail.yahoo.com` | 993 | `smtp.mail.yahoo.com` | 465 |
| Fastmail | `imap.fastmail.com` | 993 | `smtp.fastmail.com` | 465 |
| ProtonMail | Requires [Proton Bridge](https://proton.me/mail/bridge) | — | — | — |
| Generic | Check your provider's docs | — | — | — |

---

## Commands

### In Telegram or Discord

| Command | What it does |
|---|---|
| `check my email` | Show the 5 most recent emails |
| `read my last 10 emails` | Show the 10 most recent emails |
| `search emails from Alice` | Search emails by sender or subject |
| `send email to bob@example.com` | Start composing an email |

The assistant understands natural language — you don't need exact command syntax.

### Message tags (internal)

The assistant uses these internal tags to invoke email tools:

| Tag | Description |
|---|---|
| `[EMAIL_READ: N]` | Read the last N emails |
| `[EMAIL_SEARCH: query]` | Search emails matching a query |
| `[EMAIL_SEND: to|subject|body]` | Send an email |

These are processed automatically — you never need to type them manually.

---

## Examples

**Reading email:**
```
You: Check my email
Bot: Last 5 email(s):

[1] From: Alice <alice@example.com>
    Subject: Project update
    Date: 2025-03-14T10:30:00.000Z
    Preview: Hi, just wanted to share the latest progress on...
```

**Searching:**
```
You: Find emails from my boss
Bot: Search results for "boss@company.com":

[1] From: Jane Smith <jane@company.com>
    Subject: Q1 review meeting
    Date: 2025-03-13T09:00:00.000Z
    Preview: Let's schedule our quarterly review for...
```

**Sending:**
```
You: Send an email to team@company.com with subject "Weekly update" saying we shipped the new feature
Bot: Email sent to team@company.com with subject "Weekly update"
```

---

## Troubleshooting

**"Email (IMAP) is not configured"**
Run `opskrew setup --section email` to add your credentials.

**Authentication failed**
- For Gmail: make sure you're using an App Password, not your regular Google password
- For Outlook: ensure IMAP access is enabled in account settings
- Check that your username and password are correct

**Connection timeout**
- Verify the host and port settings for your provider
- Check that your VPS firewall allows outbound connections on port 993/587/465

**Emails not found**
- The search looks in your INBOX only
- Search matches subject and sender fields
- Try broader search terms

**SMTP send fails**
- Ensure SMTP host/port/credentials are configured (separate from IMAP)
- Some providers require "less secure app access" or specific SMTP auth settings
