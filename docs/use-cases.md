# Use Cases: Capability Map + Test Prompts

This doc provides copy-paste prompts you can run to validate each flow end-to-end.

## Use Case Coverage (High Level)

Use cases:
- Stay on top of messages (reply drafting + send-on-confirmation)
- Monitor things (newsletters, transactions)
- Household logistics (capture tasks, keep you on track)
- Booking + forms (find availability, fill forms, stop before final submit)
- Visibility for others (daily digest to family)

Cowork OS supports these via:
- Channels: Slack, iMessage, WhatsApp, Telegram, Email, etc.
- Scheduling: `/schedule ...` and `schedule_task`
- Integrations: Notion, Gmail/Google Calendar (if configured), Apple Calendar/Reminders (macOS)
- Web automation: browser tools (plus MCP puppeteer fallback for some sites)

## Test Prompts (Copy/Paste)

Notes:
- If you don't know a chat ID, the prompt below instructs the agent to use `channel_list_chats` first and ask you to pick a `chat_id`.
- For “stop before sending/booking”, the prompts explicitly force a confirmation gate.

### 1) Stay On Top Of Messages (Draft Reply, Ask Before Sending)

Prompt:
```
Use channel_list_chats for channel "imessage" (since "7d", limit 20). Show me the list and ask me which chat_id corresponds to the person I mean.
After I pick a chat_id, use channel_history (limit 40) to pull the recent conversation, summarize it, and draft 2 reply options.
STOP before sending. Ask me whether to send A, send B, or edit.
```

Variant (Slack):
```
Use channel_list_chats for channel "slack" (since "24h", limit 20). Ask me to pick the chat_id for the thread/channel I care about.
Then pull channel_history (limit 80) and draft a crisp reply (2 variants).
STOP before sending and ask me to confirm.
```

### 2) Monitor Things (Newsletter Digest)

Prompt:
```
Use channel_list_chats for channel "slack" (since "24h", limit 20). Ask me to pick the chat_id where newsletters arrive (Substack/email feed).
Then pull channel_history (limit 150, since "24h") and produce a digest: title/link (if present) + 1-2 sentence summary each.
Propose follow-ups, but do not take external actions unless I confirm.
```

Scheduled version (daily 8am):
```
/schedule daily 8am Summarize new newsletter items from the last 24h in this chat: {{chat_messages}}. Output a digest with links and 1-2 sentence summaries.
```

### 3) Monitor Things (Transaction Scan / Fraud Triage)

Prompt (email channel):
```
Use channel_list_chats for channel "email" (since "14d", limit 20). Ask me to pick the chat_id for my card/bank notifications.
Then pull channel_history (limit 200, since "14d") and extract transactions (date, merchant, amount, currency).
Flag anything suspicious (new merchant, rapid repeats, or unusually large amounts) and recommend next steps.
Do not contact anyone or send messages unless I confirm.
```

Prompt (Gmail integration, if configured):
```
Search my Gmail for transaction notifications from the last 14 days (Amex/bank keywords). Extract transactions into a table and flag suspicious charges.
Do not send emails or contact anyone unless I confirm.
```

### 4) Household Logistics (Capture To Notion + Reminders)

Prompt:
```
Turn this into tasks in my Notion database (ask me for the database_id if you don't already have it):

- Buy storage bins for garage
- Return Amazon package
- Book dentist appointment

For each task, create one Notion page (title = task). If a due date is implied, ask me to confirm it.
If Apple Reminders is available, also create reminders for any due tasks.
Return the created Notion page IDs/URLs and reminder IDs.
```

### 5) Booking + Forms (Find Availability, Cross-check Calendar, Stop Before Submit)

Prompt (OpenTable-style):
```
Open this URL and verify the venue name is correct:
https://www.opentable.com/r/amorim-luxury-group-lisboa

Find openings for 2 people in the next 14 days between 6:30pm and 8:30pm.
Cross-check my calendar for conflicts.
Propose the 3 best conflict-free options.
Persist the compiled options to reservation_options.json.
STOP before final booking and ask me to confirm.
```

### 6) Visibility For Others (Daily Digest Draft, Ask Before Sending)

Prompt:
```
Create a daily digest for "tomorrow" with:
- Calendar events (times + titles)
- Any reminders or scheduled tasks I should remember

Draft it as a short message I can send to my family.
STOP before sending and ask me to confirm the final message and where to send it.
```
