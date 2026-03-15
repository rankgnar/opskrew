const MAX_CHARS = 4000;

function stripHtml(html: string): string {
  // Remove <script> blocks
  let text = html.replace(/<script[\s\S]*?<\/script>/gi, " ");
  // Remove <style> blocks
  text = text.replace(/<style[\s\S]*?<\/style>/gi, " ");
  // Remove HTML comments
  text = text.replace(/<!--[\s\S]*?-->/g, " ");
  // Replace block-level elements with newlines
  text = text.replace(/<\/(p|div|section|article|header|footer|h[1-6]|li|tr|blockquote)>/gi, "\n");
  text = text.replace(/<br\s*\/?>/gi, "\n");
  // Remove remaining tags
  text = text.replace(/<[^>]+>/g, " ");
  // Decode common HTML entities
  text = text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&mdash;/g, "—")
    .replace(/&ndash;/g, "–");
  // Collapse whitespace
  text = text.replace(/[ \t]+/g, " ");
  text = text.replace(/\n{3,}/g, "\n\n");
  return text.trim();
}

export async function readUrl(url: string): Promise<string> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "opskrew/1.0.0",
        Accept: "text/html,application/xhtml+xml,text/plain",
      },
      redirect: "follow",
    });

    if (!res.ok) {
      return `Failed to fetch URL: HTTP ${res.status} ${res.statusText}`;
    }

    const contentType = res.headers.get("content-type") ?? "";
    let text: string;

    if (contentType.includes("text/html") || contentType.includes("application/xhtml")) {
      const html = await res.text();
      text = stripHtml(html);
    } else {
      // Plain text, JSON, etc.
      text = await res.text();
    }

    if (text.length > MAX_CHARS) {
      text = text.slice(0, MAX_CHARS) + `\n\n[Content truncated at ${MAX_CHARS} characters]`;
    }

    return `Content from ${url}:\n\n${text}`;
  } catch (err) {
    return `Error reading URL: ${err instanceof Error ? err.message : String(err)}`;
  }
}
