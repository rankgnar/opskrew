import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const CREDENTIALS_PATH = join(homedir(), ".opskrew", "google-credentials.json");

export function isCalendarConfigured(): boolean {
  return existsSync(CREDENTIALS_PATH);
}

function getCredentials(): object | null {
  if (!existsSync(CREDENTIALS_PATH)) return null;
  try {
    return JSON.parse(readFileSync(CREDENTIALS_PATH, "utf-8"));
  } catch {
    return null;
  }
}

async function getCalendarClient() {
  const { google } = await import("googleapis");

  const credentials = getCredentials();
  if (!credentials) {
    throw new Error(
      "Google Calendar credentials not found. Place your service account JSON at ~/.opskrew/google-credentials.json",
    );
  }

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/calendar"],
  });

  return google.calendar({ version: "v3", auth });
}

interface CalendarEvent {
  title: string;
  start: string;
  end: string;
  location?: string;
  description?: string;
}

function formatEvent(e: CalendarEvent): string {
  const parts = [`- ${e.title}`];
  parts.push(`  Start: ${e.start}`);
  if (e.end && e.end !== e.start) parts.push(`  End: ${e.end}`);
  if (e.location) parts.push(`  Location: ${e.location}`);
  return parts.join("\n");
}

function formatGoogleEvent(item: {
  summary?: string | null;
  start?: { dateTime?: string | null; date?: string | null };
  end?: { dateTime?: string | null; date?: string | null };
  location?: string | null;
  description?: string | null;
}): CalendarEvent {
  return {
    title: item.summary ?? "(no title)",
    start: item.start?.dateTime ?? item.start?.date ?? "",
    end: item.end?.dateTime ?? item.end?.date ?? "",
    location: item.location ?? undefined,
    description: item.description ?? undefined,
  };
}

export async function calendarToday(): Promise<string> {
  try {
    const calendar = await getCalendarClient();
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);

    const res = await calendar.events.list({
      calendarId: "primary",
      timeMin: startOfDay.toISOString(),
      timeMax: endOfDay.toISOString(),
      singleEvents: true,
      orderBy: "startTime",
      maxResults: 20,
    });

    const items = res.data.items ?? [];
    if (items.length === 0) return "No events today.";

    const events = items.map(formatGoogleEvent).map(formatEvent).join("\n\n");
    return `Today's events (${items.length}):\n\n${events}`;
  } catch (err) {
    return `Calendar error: ${err instanceof Error ? err.message : String(err)}`;
  }
}

export async function calendarWeek(): Promise<string> {
  try {
    const calendar = await getCalendarClient();
    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setHours(0, 0, 0, 0);
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(endOfWeek.getDate() + 7);

    const res = await calendar.events.list({
      calendarId: "primary",
      timeMin: startOfWeek.toISOString(),
      timeMax: endOfWeek.toISOString(),
      singleEvents: true,
      orderBy: "startTime",
      maxResults: 50,
    });

    const items = res.data.items ?? [];
    if (items.length === 0) return "No events this week.";

    const events = items.map(formatGoogleEvent).map(formatEvent).join("\n\n");
    return `Events this week (${items.length}):\n\n${events}`;
  } catch (err) {
    return `Calendar error: ${err instanceof Error ? err.message : String(err)}`;
  }
}

export async function calendarAdd(
  title: string,
  dateStr: string,
  durationMinutes: number,
): Promise<string> {
  try {
    const calendar = await getCalendarClient();

    // Parse "YYYY-MM-DD HH:mm"
    const start = new Date(dateStr.replace(" ", "T") + ":00");
    if (isNaN(start.getTime())) {
      return `Invalid date format. Use: YYYY-MM-DD HH:mm`;
    }
    const end = new Date(start.getTime() + durationMinutes * 60 * 1000);

    const res = await calendar.events.insert({
      calendarId: "primary",
      requestBody: {
        summary: title,
        start: { dateTime: start.toISOString() },
        end: { dateTime: end.toISOString() },
      },
    });

    return `Event created: "${res.data.summary}" on ${start.toLocaleString()} for ${durationMinutes} minutes.`;
  } catch (err) {
    return `Calendar add error: ${err instanceof Error ? err.message : String(err)}`;
  }
}

export async function calendarSearch(query: string): Promise<string> {
  try {
    const calendar = await getCalendarClient();

    const res = await calendar.events.list({
      calendarId: "primary",
      q: query,
      timeMin: new Date().toISOString(),
      singleEvents: true,
      orderBy: "startTime",
      maxResults: 10,
    });

    const items = res.data.items ?? [];
    if (items.length === 0) return `No events found matching "${query}".`;

    const events = items.map(formatGoogleEvent).map(formatEvent).join("\n\n");
    return `Events matching "${query}" (${items.length}):\n\n${events}`;
  } catch (err) {
    return `Calendar search error: ${err instanceof Error ? err.message : String(err)}`;
  }
}
