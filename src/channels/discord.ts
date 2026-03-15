import { Client, GatewayIntentBits, Message as DiscordMessage, Attachment, ChannelType } from "discord.js";
import { getConfig } from "../config.js";
import { processMessage } from "./shared.js";

function isAllowedUser(userId: string, allowedUsers: string[]): boolean {
  if (allowedUsers.length === 0) return true;
  return allowedUsers.includes(userId);
}

/**
 * Split a long message into chunks of at most `maxLen` characters,
 * breaking at newlines where possible.
 */
function splitMessage(text: string, maxLen = 2000): string[] {
  if (text.length <= maxLen) return [text];

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > maxLen) {
    const slice = remaining.slice(0, maxLen);
    const lastNewline = slice.lastIndexOf("\n");
    const breakAt = lastNewline > maxLen / 2 ? lastNewline : maxLen;
    chunks.push(remaining.slice(0, breakAt));
    remaining = remaining.slice(breakAt).trimStart();
  }

  if (remaining.length > 0) chunks.push(remaining);
  return chunks;
}

/**
 * Download a Discord attachment and return its buffer.
 */
async function downloadAttachment(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to download attachment: HTTP ${res.status}`);
  const ab = await res.arrayBuffer();
  return Buffer.from(ab);
}

function createDiscordClient(botToken: string, allowedUsers: string[]): Client {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.DirectMessages,
    ],
  });

  client.once("ready", () => {
    console.log(`[discord] Bot ready: ${client.user?.tag}`);
  });

  // Reconnection: re-create client on fatal disconnect
  client.on("error", (err: Error) => {
    console.error("[discord] Client error:", err);
  });

  client.on("disconnect" as Parameters<typeof client.on>[0], () => {
    console.warn("[discord] Disconnected. Attempting to reconnect...");
    setTimeout(() => {
      try {
        createDiscordClient(botToken, allowedUsers);
      } catch (reconnErr) {
        console.error("[discord] Reconnection failed:", reconnErr);
      }
    }, 5000);
  });

  client.on("messageCreate", async (msg: DiscordMessage) => {
    if (msg.author.bot) return;

    const cfg = getConfig();
    const isDM = msg.channel.type === ChannelType.DM;
    const isMentioned = msg.mentions.users.has(client.user!.id);

    // In guild channels, only respond when mentioned; in DMs always respond
    if (!isDM && !isMentioned) return;

    // Auth check
    if (!isAllowedUser(msg.author.id, allowedUsers)) {
      await msg.reply("⛔ Unauthorized.");
      return;
    }

    const chatId = `discord:${msg.channelId}`;

    // Strip bot mention from text
    let userText = msg.content
      .replace(/<@!?[0-9]+>/g, "")
      .trim();

    // Handle attachments
    const imageAttachments: Attachment[] = [];
    const docAttachments: Attachment[] = [];

    for (const [, attachment] of msg.attachments) {
      const ct = attachment.contentType ?? "";
      if (ct.startsWith("image/")) {
        imageAttachments.push(attachment);
      } else {
        docAttachments.push(attachment);
      }
    }

    // Show typing indicator
    if ("sendTyping" in msg.channel) {
      await (msg.channel as { sendTyping: () => Promise<void> }).sendTyping();
    }

    const sendReply = async (text: string): Promise<void> => {
      const chunks = splitMessage(text, 2000);
      for (let i = 0; i < chunks.length; i++) {
        if (i === 0) {
          await msg.reply(chunks[i]);
        } else {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (msg.channel as any).send(chunks[i]);
        }
      }
    };

    try {
      // Handle image attachments (vision)
      if (imageAttachments.length > 0 && cfg.features.vision) {
        const attachment = imageAttachments[0];
        const imageBuffer = await downloadAttachment(attachment.url);
        const base64Data = imageBuffer.toString("base64");

        // Detect media type from content type
        const ct = (attachment.contentType ?? "image/jpeg") as
          | "image/jpeg"
          | "image/png"
          | "image/gif"
          | "image/webp";
        const validTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"];
        const mediaType = validTypes.includes(ct) ? ct : "image/jpeg";

        await processMessage({
          chatId,
          text: userText || "What's in this image?",
          imageBase64: base64Data,
          imageMediaType: mediaType as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
          sendReply,
        });
        return;
      }

      // Handle document attachments
      if (docAttachments.length > 0) {
        const attachment = docAttachments[0];
        const filename = attachment.name ?? "document";
        const textExtensions = [".txt", ".md", ".json", ".csv", ".py", ".js", ".ts", ".html"];
        const ext = filename.includes(".") ? filename.slice(filename.lastIndexOf(".")).toLowerCase() : "";
        const isText = textExtensions.includes(ext);

        if (isText) {
          const fileBuffer = await downloadAttachment(attachment.url);
          const documentText = fileBuffer.toString("utf-8").slice(0, 8000);
          const caption = userText || "Analyze this document and summarize the key points.";
          const fullText = `Document content (${filename}):\n\n${documentText}\n\n---\n\n${caption}`;

          await processMessage({ chatId, text: fullText, sendReply });
          return;
        }
      }

      // Plain text message (or no supported attachment)
      if (!userText && msg.attachments.size === 0) return;
      if (!userText) userText = "(attachment sent)";

      await processMessage({ chatId, text: userText, sendReply });
    } catch (err) {
      console.error("[discord] Error:", err);
      await sendReply("❌ Error processing your message. Please try again.");
    }
  });

  client.login(botToken).catch((err: unknown) => {
    console.error("[discord] Failed to login:", err);
  });

  return client;
}

export function startDiscord(botToken: string, allowedUsers: string[]): Client {
  return createDiscordClient(botToken, allowedUsers);
}
