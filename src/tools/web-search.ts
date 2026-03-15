const DUCKDUCKGO_URL = "https://html.duckduckgo.com/html/";

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

function parseResults(html: string, maxResults: number): SearchResult[] {
  const results: SearchResult[] = [];

  // Match result blocks
  const resultBlockRegex = /<div class="result[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/g;
  let blockMatch;

  while ((blockMatch = resultBlockRegex.exec(html)) !== null && results.length < maxResults) {
    const block = blockMatch[1];

    const titleMatch = /class="result__a"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/i.exec(block);
    const snippetMatch = /class="result__snippet"[^>]*>([\s\S]*?)<\/a>/i.exec(block);

    if (titleMatch) {
      const rawUrl = titleMatch[1];
      const title = titleMatch[2].replace(/<[^>]+>/g, "").trim();
      const snippet = snippetMatch
        ? snippetMatch[1].replace(/<[^>]+>/g, "").trim()
        : "";

      // DuckDuckGo wraps URLs in redirect links — extract the actual URL
      let url = rawUrl;
      const uddgMatch = /uddg=([^&]+)/.exec(rawUrl);
      if (uddgMatch) {
        url = decodeURIComponent(uddgMatch[1]);
      }

      if (title && url) {
        results.push({ title, url, snippet });
      }
    }
  }

  return results;
}

export async function webSearch(query: string, maxResults = 5): Promise<string> {
  const url = `${DUCKDUCKGO_URL}?q=${encodeURIComponent(query)}`;

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "opskrew/1.0.0",
        Accept: "text/html",
      },
    });

    if (!res.ok) {
      return `Search failed: HTTP ${res.status}`;
    }

    const html = await res.text();
    const results = parseResults(html, maxResults);

    if (results.length === 0) {
      return `No results found for: "${query}"`;
    }

    const lines = [`Search results for: "${query}"\n`];
    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      lines.push(`${i + 1}. **${r.title}**`);
      lines.push(`   ${r.url}`);
      if (r.snippet) lines.push(`   ${r.snippet}`);
      lines.push("");
    }

    return lines.join("\n");
  } catch (err) {
    return `Search error: ${err instanceof Error ? err.message : String(err)}`;
  }
}
