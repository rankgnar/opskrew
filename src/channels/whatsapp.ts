import { join } from "node:path";
import { homedir } from "node:os";
import { processMessage } from "./shared.js";

// Dynamic import to avoid issues if baileys is not installed
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type WASocket = any;

/**
 * Normalize a WhatsApp JID to a plain phone number for allowlist checks.
 * JIDs look like: "34612345678@s.whatsapp.net" or "34612345678@c.us"
 */
function normalizeJid(jid: string | undefined | null): string {
  if (!jid) return "";
  return jid.replace(/@.+$/, "").replace(/[^0-9]/g, "");
}

function isAllowedNumber(jid: string | null | undefined, allowedNumbers: string[]): boolean {
  if (allowedNumbers.length === 0) return true;
  const normalized = normalizeJid(jid);
  return allowedNumbers.some((n) => n.replace(/[^0-9]/g, "") === normalized);
}

export async function startWhatsApp(allowedNumbers: string[]): Promise<WASocket> {
  // Dynamic import — baileys is optional dependency
  const baileys = await import("@whiskeysockets/baileys");
  const makeWASocket = baileys.default ?? baileys.makeWASocket;
  const { useMultiFileAuthState, DisconnectReason } = baileys;

  const authDir = join(homedir(), ".opskrew", "whatsapp-auth");
  const { state, saveCreds } = await useMultiFileAuthState(authDir);

  const sock: WASocket = makeWASocket({
    auth: state,
    printQRInTerminal: true,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    logger: ({
      // Suppress default verbose logging
      level: "silent",
      trace: () => {},
      debug: () => {},
      info: (msg: unknown) => {
        // Only log important info
        if (typeof msg === "object" && msg !== null && "msg" in msg) {
          const m = (msg as { msg: string }).msg;
          if (m.includes("open") || m.includes("close") || m.includes("qr")) {
            console.log(`[whatsapp] ${m}`);
          }
        }
      },
      warn: (msg: unknown) => console.warn("[whatsapp] warn:", msg),
      error: (msg: unknown) => console.error("[whatsapp] error:", msg),
      fatal: (msg: unknown) => console.error("[whatsapp] fatal:", msg),
      child: () => ({
        level: "silent",
        trace: () => {},
        debug: () => {},
        info: () => {},
        warn: () => {},
        error: () => {},
        fatal: () => {},
        child: () => ({}),
      }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any),
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", (update: { connection?: string; lastDisconnect?: { error?: unknown } }) => {
    const { connection, lastDisconnect } = update;

    if (connection === "open") {
      console.log("[whatsapp] Connected!");
    }

    if (connection === "close") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

      console.log(`[whatsapp] Connection closed (code: ${statusCode}). Reconnect: ${shouldReconnect}`);

      if (shouldReconnect) {
        console.log("[whatsapp] Reconnecting in 5 seconds...");
        setTimeout(() => {
          startWhatsApp(allowedNumbers).catch((err: unknown) => {
            console.error("[whatsapp] Reconnection failed:", err);
          });
        }, 5000);
      } else {
        console.log("[whatsapp] Logged out. Delete ~/.opskrew/whatsapp-auth and restart to re-authenticate.");
      }
    }
  });

  sock.ev.on(
    "messages.upsert",
    async ({ messages, type }: { messages: Array<{ key: { fromMe?: boolean; remoteJid?: string }; message?: { conversation?: string; extendedTextMessage?: { text?: string } } }>; type: string }) => {
      if (type !== "notify") return;

      for (const msg of messages) {
        if (msg.key.fromMe) continue;

        const sender = msg.key.remoteJid;
        if (!isAllowedNumber(sender, allowedNumbers)) continue;

        const text =
          msg.message?.conversation ??
          msg.message?.extendedTextMessage?.text;

        if (!text) continue;

        const chatId = `whatsapp:${normalizeJid(sender)}`;

        try {
          await processMessage({
            chatId,
            text,
            sendReply: async (reply: string) => {
              await sock.sendMessage(sender!, { text: reply });
            },
          });
        } catch (err) {
          console.error("[whatsapp] Error processing message:", err);
          try {
            await sock.sendMessage(sender!, { text: "❌ Error processing your message. Please try again." });
          } catch {
            // ignore send error
          }
        }
      }
    },
  );

  console.log("[whatsapp] Starting... scan QR code if prompted.");
  return sock;
}
