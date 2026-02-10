# Self-Hosting (Linux VPS / Headless)

CoWork OS supports **Linux headless/server deployments**. This is intended for:

- VPS installs (systemd)
- Docker installs (single host)
- “No desktop UI required” operation

The key idea: on Linux you typically do **not** run a desktop app UI. Instead you use:

- **Control Plane Web UI** (built-in, served by the daemon)
- **Control Plane CLI** (`bin/coworkctl.js`)
- Optional: messaging channels (Telegram/Discord/Slack/etc) as your “chat UI”

If you need the macOS desktop app UI, that’s a separate mode.

## Choose Your Runtime

Pick one of these. They all run the same underlying agent runtime, DB, and settings:

| Option | Best For | What You Get | What You Don’t |
|---|---|---|---|
| **Node-only daemon** (recommended) | VPS/headless | No GUI deps, simplest ops | Desktop-only features (Live Canvas, clipboard, desktop screenshots, etc.) |
| **Headless Electron daemon** | Max parity with desktop runtime | More desktop parity | Heavier deps (Electron + Xvfb on Linux) |
| **Docker** (Node-only or Electron) | “Just run it” installs | Easy persistence via volumes | You still access it via Control Plane (web/CLI) |

Docs:

- Linux VPS guide: `docs/vps-linux.md`
- Node-only daemon details: `docs/node-daemon.md`
- Remote access patterns (SSH tunnel/Tailscale): `docs/remote-access.md`

## How You Use It (Interfaces)

On a VPS, users typically interact in one of these ways:

1. **Web UI (recommended first touch)**: open `http://127.0.0.1:18789/` through an SSH tunnel or Tailscale.
2. **CLI**: use `bin/coworkctl.js` to create workspaces, create tasks, watch events, and respond to approvals.
3. **Messaging channels**: configure Telegram/Discord/Slack/etc and treat that as the UI.

There is no requirement to have a macOS machine running.

## Feature Reality Check (Linux Headless)

Works well:

- Task execution engine + tool runtime (file ops, web fetch, integrations, MCP)
- Control Plane (WebSocket API + minimal Web UI)
- Cron scheduling + channel delivery (optional)
- Messaging channels (Telegram/Discord/Slack/etc) if configured

Expected limitations:

- Desktop UI features are not available in Node-only mode (Live Canvas, visual annotator UI, clipboard integration, “open in Finder”, etc.)
- Some channels are inherently macOS-tied:
  - iMessage requires Apple Messages / macOS
  - BlueBubbles requires a macOS relay

## Browser Automation (Playwright) on VPS

CoWork OS includes Playwright-based browser automation tools.

On minimal Linux images (and slim Docker images), Chromium may fail to launch until dependencies are installed.

- Current approach: install Playwright Chromium + OS deps (see `docs/vps-linux.md`).
- Next step (planned): add an optional “Playwright-ready” Docker profile/image so browser automation works out-of-the-box.

## Security Defaults (Important)

- Control Plane binds to **loopback** by default (`127.0.0.1:18789`).
- Remote access should be done via:
  - SSH tunnel (simplest)
  - Tailscale Serve/Funnel (if you want private/public exposure)

Avoid binding the Control Plane directly to `0.0.0.0` unless you fully understand the risk and have network-level protections.

## Data & Backups

All persistent state lives under the **user data directory** (DB + encrypted settings + cron store + message history):

- Configure with `COWORK_USER_DATA_DIR=/var/lib/cowork-os` (recommended on VPS)
- Or `--user-data-dir /var/lib/cowork-os`

Back up that directory (or the Docker volume) to back up the instance.

