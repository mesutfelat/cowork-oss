# Live Canvas

Live Canvas is an agent-driven visual workspace that allows CoWork-OSS agents to create, display, and interact with dynamic HTML/CSS/JavaScript content in real-time.

## Overview

Live Canvas enables agents to:
- Render interactive visualizations, dashboards, and forms
- Display data analysis results with charts and graphs
- Create prototypes and mockups
- Build interactive tools for user feedback
- Execute JavaScript in the canvas context and retrieve results

Each canvas session opens in a dedicated Electron BrowserWindow and is isolated per task.

## Architecture

```
┌─────────────────────────────────────────────────┐
│              Agent (Task Executor)               │
│  Uses canvas_* tools to create visual content    │
└─────────────────────────────────────────────────┘
                      ↓
┌─────────────────────────────────────────────────┐
│              Canvas Manager                      │
│  - Session lifecycle management                  │
│  - BrowserWindow creation                        │
│  - File watching (chokidar)                      │
│  - Event broadcasting                            │
└─────────────────────────────────────────────────┘
                      ↓
┌─────────────────────────────────────────────────┐
│           Canvas BrowserWindow                   │
│  - Loads content via canvas:// protocol          │
│  - Isolated session directory                    │
│  - A2UI bridge for user interactions             │
└─────────────────────────────────────────────────┘
                      ↓
┌─────────────────────────────────────────────────┐
│           canvas:// Protocol Handler             │
│  - Secure file serving from session directory    │
│  - MIME type detection                           │
│  - Path traversal protection                     │
└─────────────────────────────────────────────────┘
```

## Agent Tools

The following tools are available to agents for canvas operations:

### `canvas_create`

Creates a new canvas session.

**Input:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `title` | string | No | Window title (default: "Canvas {timestamp}") |

**Output:**
```json
{
  "sessionId": "abc123-def456",
  "sessionDir": "/path/to/session/directory"
}
```

### `canvas_push`

Pushes content to the canvas session.

**Input:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `session_id` | string | Yes | Canvas session ID |
| `content` | string | Yes | HTML/CSS/JS content |
| `filename` | string | No | Filename (default: "index.html") |

**Output:**
```json
{
  "success": true
}
```

### `canvas_show`

Shows the canvas window and brings it to focus.

**Input:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `session_id` | string | Yes | Canvas session ID |

**Output:**
```json
{
  "success": true
}
```

### `canvas_hide`

Hides the canvas window without closing the session.

**Input:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `session_id` | string | Yes | Canvas session ID |

**Output:**
```json
{
  "success": true
}
```

### `canvas_close`

Closes the canvas session and its window.

**Input:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `session_id` | string | Yes | Canvas session ID |

**Output:**
```json
{
  "success": true
}
```

### `canvas_eval`

Executes JavaScript in the canvas context.

**Input:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `session_id` | string | Yes | Canvas session ID |
| `script` | string | Yes | JavaScript code to execute |

**Output:**
```json
{
  "result": <any>
}
```

### `canvas_snapshot`

Takes a screenshot of the canvas content.

**Input:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `session_id` | string | Yes | Canvas session ID |

**Output:**
```json
{
  "imageBase64": "iVBORw0KGgo...",
  "width": 800,
  "height": 600
}
```

### `canvas_list`

Lists all canvas sessions for the current task.

**Input:** None

**Output:**
```json
{
  "sessions": [
    {
      "id": "abc123",
      "title": "My Canvas",
      "status": "active",
      "createdAt": 1706789012345
    }
  ]
}
```

## Example Usage

### Creating a Data Visualization

```javascript
// Agent creates a canvas session
const { sessionId } = await canvas_create({ title: "Sales Dashboard" });

// Push HTML content with Chart.js
await canvas_push({
  session_id: sessionId,
  content: `
    <!DOCTYPE html>
    <html>
    <head>
      <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
      <style>
        body { font-family: system-ui; padding: 20px; }
        canvas { max-width: 600px; }
      </style>
    </head>
    <body>
      <h1>Q4 Sales by Region</h1>
      <canvas id="chart"></canvas>
      <script>
        new Chart(document.getElementById('chart'), {
          type: 'bar',
          data: {
            labels: ['North', 'South', 'East', 'West'],
            datasets: [{
              label: 'Sales ($M)',
              data: [12, 19, 8, 15],
              backgroundColor: ['#4CAF50', '#2196F3', '#FFC107', '#9C27B0']
            }]
          }
        });
      </script>
    </body>
    </html>
  `
});

// Show the canvas
await canvas_show({ session_id: sessionId });

// Take a snapshot
const { imageBase64 } = await canvas_snapshot({ session_id: sessionId });
```

### Interactive Form

```javascript
// Create canvas with a form for user input
const { sessionId } = await canvas_create({ title: "Configuration" });

await canvas_push({
  session_id: sessionId,
  content: `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: system-ui; padding: 20px; }
        input, select { margin: 10px 0; padding: 8px; width: 200px; }
        button { background: #007AFF; color: white; padding: 10px 20px; border: none; cursor: pointer; }
      </style>
    </head>
    <body>
      <h2>Project Settings</h2>
      <form id="config">
        <div>
          <label>Project Name:</label><br>
          <input type="text" id="name" value="my-project">
        </div>
        <div>
          <label>Framework:</label><br>
          <select id="framework">
            <option value="react">React</option>
            <option value="vue">Vue</option>
            <option value="svelte">Svelte</option>
          </select>
        </div>
        <button type="button" onclick="window.coworkCanvas.sendA2UIAction('submit', 'config', getFormData())">
          Apply Settings
        </button>
      </form>
      <script>
        function getFormData() {
          return {
            name: document.getElementById('name').value,
            framework: document.getElementById('framework').value
          };
        }
      </script>
    </body>
    </html>
  `
});

await canvas_show({ session_id: sessionId });
```

## A2UI (Agent-to-UI) Communication

Canvas windows can send actions back to the agent using the A2UI bridge. This enables interactive workflows where user actions in the canvas trigger agent responses.

### Sending Actions from Canvas

The canvas preload script exposes `window.coworkCanvas`:

```javascript
// Send an action to the agent
window.coworkCanvas.sendA2UIAction(
  'button_click',           // Action name
  'submit-button',          // Component ID
  { formData: {...} }       // Context object
);
```

### Receiving Actions in Agent

When a user interacts with the canvas, the agent receives a formatted message:

```
[Canvas Interaction]
Action: button_click
Component: submit-button
Context: { "formData": { ... } }

The user interacted with the canvas. Please respond appropriately based on this action.
```

## Security

### Path Traversal Protection

The `canvas://` protocol implements multiple layers of security:

1. **Double dot check**: Paths containing `..` are rejected
2. **Double slash check**: Paths containing `//` are rejected
3. **Path containment**: Resolved paths must be within the session directory

### Session Isolation

- Each canvas session has its own directory
- Sessions are scoped to specific tasks
- File operations are sandboxed to the session directory

### URL Format

```
canvas://{sessionId}/{filename}
```

Example: `canvas://abc123-def456/index.html`

## Configuration

Live Canvas uses the following directory for session storage:

```
~/Library/Application Support/cowork-oss/canvas/{sessionId}/
```

Sessions are automatically cleaned up when:
- The session is explicitly closed via `canvas_close`
- The application exits
- The parent task is deleted

## Supported Content

### File Types

| Extension | MIME Type |
|-----------|-----------|
| `.html`, `.htm` | `text/html` |
| `.css` | `text/css` |
| `.js`, `.mjs` | `application/javascript` |
| `.json` | `application/json` |
| `.png` | `image/png` |
| `.jpg`, `.jpeg` | `image/jpeg` |
| `.svg` | `image/svg+xml` |
| `.gif` | `image/gif` |
| `.webp` | `image/webp` |
| `.woff`, `.woff2` | `font/woff`, `font/woff2` |
| `.ttf`, `.otf` | `font/ttf`, `font/otf` |
| `.mp3` | `audio/mpeg` |
| `.mp4` | `video/mp4` |
| `.pdf` | `application/pdf` |

### External Resources

Canvas content can load external resources via CDN:
- Chart.js, D3.js for visualizations
- Tailwind CSS, Bootstrap for styling
- Any other libraries via script/link tags

## Events

The Canvas Manager emits events that can be observed in the main process:

| Event | Description |
|-------|-------------|
| `session_created` | New canvas session created |
| `session_closed` | Canvas session closed |
| `content_pushed` | Content pushed to canvas |
| `window_opened` | Canvas window opened |
| `window_closed` | Canvas window closed |
| `a2ui_action` | User interaction from canvas |

## Troubleshooting

### Canvas Window Not Showing

1. Ensure the session exists with `canvas_list`
2. Check that `canvas_show` was called after `canvas_push`
3. Verify the content has valid HTML structure

### Content Not Updating

1. The canvas auto-reloads on file changes
2. Ensure you're pushing to the correct session ID
3. Check browser console for JavaScript errors

### A2UI Actions Not Received

1. Verify `window.coworkCanvas` is available in the canvas context
2. Check that the action name is descriptive
3. Ensure the canvas window is still open

## API Reference

See the following files for implementation details:

- `src/electron/canvas/canvas-manager.ts` - Session management
- `src/electron/canvas/canvas-protocol.ts` - URL protocol handler
- `src/electron/agent/tools/canvas-tools.ts` - Agent tool definitions
- `src/electron/ipc/canvas-handlers.ts` - IPC handlers
