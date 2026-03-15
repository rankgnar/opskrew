import { getVault } from "../vault.js";

interface EmailMessage {
  subject: string;
  from: string;
  date: string;
  snippet: string;
}

function getEmailConfig() {
  const vault = getVault();
  return {
    imap: {
      host: vault.get("IMAP_HOST") ?? "",
      port: parseInt(vault.get("IMAP_PORT") ?? "993", 10),
      user: vault.get("IMAP_USER") ?? "",
      pass: vault.get("IMAP_PASS") ?? "",
    },
    smtp: {
      host: vault.get("SMTP_HOST") ?? "",
      port: parseInt(vault.get("SMTP_PORT") ?? "587", 10),
      user: vault.get("SMTP_USER") ?? "",
      pass: vault.get("SMTP_PASS") ?? "",
    },
  };
}

export function isEmailConfigured(): boolean {
  const cfg = getEmailConfig();
  return !!(cfg.imap.host && cfg.imap.user && cfg.imap.pass);
}

async function fetchEmails(limit: number, searchQuery?: string): Promise<EmailMessage[]> {
  const { ImapFlow } = await import("imapflow");
  const cfg = getEmailConfig();

  if (!cfg.imap.host || !cfg.imap.user || !cfg.imap.pass) {
    throw new Error("Email (IMAP) is not configured. Run: opskrew setup --section email");
  }

  const client = new ImapFlow({
    host: cfg.imap.host,
    port: cfg.imap.port,
    secure: cfg.imap.port === 993,
    auth: { user: cfg.imap.user, pass: cfg.imap.pass },
    logger: false,
  });

  const messages: EmailMessage[] = [];

  try {
    await client.connect();
    const lock = await client.getMailboxLock("INBOX");

    try {
      const status = await client.status("INBOX", { messages: true });
      const total = status.messages ?? 0;

      let searchResults: number[] = [];

      if (searchQuery) {
        // Search by subject or from
        const bySubject = await client.search({ subject: searchQuery }) as number[];
        const byFrom = await client.search({ from: searchQuery }) as number[];
        const combined = [...new Set([...bySubject, ...byFrom])];
        searchResults = combined.sort((a, b) => b - a).slice(0, limit);
      } else {
        // Get latest N emails
        const start = Math.max(1, total - limit + 1);
        for (let i = total; i >= start; i--) {
          searchResults.push(i);
        }
      }

      if (searchResults.length === 0) {
        return messages;
      }

      const seqSet = searchResults.join(",");

      for await (const msg of client.fetch(seqSet, { envelope: true, bodyStructure: true, source: true })) {
        const envelope = msg.envelope;
        const from = envelope.from?.[0];
        const fromStr = from
          ? `${from.name ? from.name + " " : ""}<${from.address ?? ""}>`
          : "unknown";

        // Get text snippet from source
        let snippet = "";
        try {
          const src = msg.source?.toString("utf-8") ?? "";
          // Find body after headers (double newline)
          const bodyStart = src.indexOf("\r\n\r\n");
          if (bodyStart > -1) {
            const rawBody = src.slice(bodyStart + 4);
            // Strip HTML tags if present
            const textBody = rawBody.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
            snippet = textBody.slice(0, 200);
          }
        } catch {
          snippet = "(could not read body)";
        }

        messages.push({
          subject: envelope.subject ?? "(no subject)",
          from: fromStr,
          date: envelope.date?.toISOString() ?? "",
          snippet,
        });
      }
    } finally {
      lock.release();
    }
  } finally {
    await client.logout();
  }

  return messages;
}

function formatMessages(messages: EmailMessage[]): string {
  if (messages.length === 0) return "No emails found.";
  return messages
    .map(
      (m, i) =>
        `[${i + 1}] From: ${m.from}\n    Subject: ${m.subject}\n    Date: ${m.date}\n    Preview: ${m.snippet}`,
    )
    .join("\n\n");
}

export async function emailRead(n: number): Promise<string> {
  try {
    const messages = await fetchEmails(n);
    return `Last ${messages.length} email(s):\n\n${formatMessages(messages)}`;
  } catch (err) {
    return `Email read error: ${err instanceof Error ? err.message : String(err)}`;
  }
}

export async function emailSend(to: string, subject: string, body: string): Promise<string> {
  const nodemailer = await import("nodemailer");
  const cfg = getEmailConfig();

  if (!cfg.smtp.host || !cfg.smtp.user || !cfg.smtp.pass) {
    return "Email (SMTP) is not configured. Run: opskrew setup --section email";
  }

  try {
    const transporter = nodemailer.default.createTransport({
      host: cfg.smtp.host,
      port: cfg.smtp.port,
      secure: cfg.smtp.port === 465,
      auth: { user: cfg.smtp.user, pass: cfg.smtp.pass },
    });

    await transporter.sendMail({
      from: cfg.smtp.user,
      to,
      subject,
      text: body,
    });

    return `Email sent to ${to} with subject "${subject}"`;
  } catch (err) {
    return `Email send error: ${err instanceof Error ? err.message : String(err)}`;
  }
}

export async function emailSearch(query: string): Promise<string> {
  try {
    const messages = await fetchEmails(10, query);
    return `Search results for "${query}":\n\n${formatMessages(messages)}`;
  } catch (err) {
    return `Email search error: ${err instanceof Error ? err.message : String(err)}`;
  }
}
