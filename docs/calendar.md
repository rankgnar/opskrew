# Calendar Integration

opskrew integrates with Google Calendar using a service account. Once configured, your assistant can show you today's events, your week schedule, create new events, and search for upcoming events — all through your messaging channel.

---

## What it can do

- Show today's events
- Show events for the next 7 days
- Create new calendar events
- Search events by keyword

---

## Configuration

### Step 1 — Create a Google Cloud project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Click **Select a project** → **New Project**
3. Give it a name (e.g., `opskrew-calendar`) and click **Create**

### Step 2 — Enable the Google Calendar API

1. In your project, go to **APIs & Services** → **Library**
2. Search for **Google Calendar API**
3. Click it and press **Enable**

### Step 3 — Create a Service Account

1. Go to **APIs & Services** → **Credentials**
2. Click **Create Credentials** → **Service Account**
3. Fill in a name (e.g., `opskrew`) and click **Create and Continue**
4. Skip role assignment and click **Done**

### Step 4 — Download the credentials JSON

1. On the Credentials page, click the service account you just created
2. Go to the **Keys** tab
3. Click **Add Key** → **Create new key**
4. Select **JSON** and click **Create**
5. A `.json` file will download automatically

### Step 5 — Place the credentials file

Move the downloaded JSON file to:

```bash
~/.opskrew/google-credentials.json
```

Example:

```bash
mv ~/Downloads/opskrew-calendar-xxxx.json ~/.opskrew/google-credentials.json
chmod 600 ~/.opskrew/google-credentials.json
```

### Step 6 — Share your calendar with the service account

The service account has its own email address (found in the JSON file as `client_email`, looks like `opskrew@your-project.iam.gserviceaccount.com`).

You need to share your calendar with that address:

1. Open [Google Calendar](https://calendar.google.com/)
2. Find your calendar in the left sidebar → click the three-dot menu → **Settings and sharing**
3. Scroll to **Share with specific people or groups**
4. Click **Add people**, paste the `client_email` from your JSON file
5. Set permission to **Make changes to events** (or **See all event details** for read-only)
6. Click **Send**

That's it. opskrew will detect the credentials file automatically on startup.

---

## Commands

### In Telegram or Discord

| Command | What it does |
|---|---|
| `What's on my calendar today?` | Show today's events |
| `What do I have this week?` | Show events for the next 7 days |
| `Add meeting with Alice tomorrow at 3pm for 1 hour` | Create a new event |
| `Find events about budget review` | Search events by keyword |

The assistant understands natural language — you don't need exact command syntax.

### Message tags (internal)

The assistant uses these internal tags to invoke calendar tools:

| Tag | Description |
|---|---|
| `[CALENDAR_TODAY]` | Fetch today's events |
| `[CALENDAR_WEEK]` | Fetch events for the next 7 days |
| `[CALENDAR_ADD: title|YYYY-MM-DD HH:mm|duration_minutes]` | Create an event |
| `[CALENDAR_SEARCH: query]` | Search events |

These are processed automatically — you never need to type them manually.

---

## Examples

**Today's schedule:**
```
You: What's on my calendar today?
Bot: Today's events (2):

- Team standup
  Start: 2025-03-14T09:00:00+01:00
  End: 2025-03-14T09:30:00+01:00

- Lunch with Maria
  Start: 2025-03-14T12:30:00+01:00
  End: 2025-03-14T13:30:00+01:00
  Location: Café Central
```

**Creating an event:**
```
You: Schedule a 30-minute call with the dev team on March 20 at 10am
Bot: Event created: "Call with dev team" on 3/20/2025, 10:00:00 AM for 30 minutes.
```

**Searching:**
```
You: Find my budget meetings
Bot: Events matching "budget" (1):

- Q1 Budget Review
  Start: 2025-03-18T14:00:00+01:00
  End: 2025-03-18T15:00:00+01:00
```

---

## Troubleshooting

**"Google Calendar credentials not found"**
Make sure the file is at `~/.opskrew/google-credentials.json` and is valid JSON.

**"Calendar error: The caller does not have permission"**
You haven't shared the calendar with the service account. Follow Step 6 above — make sure you used the exact `client_email` from the JSON file.

**Events not showing up**
- Verify the calendar is shared with the service account
- The service account accesses the `primary` calendar — make sure events are on the primary calendar, not a secondary one
- Times are shown in UTC by default; the event times reflect the timezone set on the event itself

**Can't create events**
Make sure you granted **Make changes to events** permission when sharing the calendar, not just read access.
