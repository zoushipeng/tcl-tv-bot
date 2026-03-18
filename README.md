# TCL TV Bot channel plugin

OpenClaw channel plugin for TCL TV Bot — custom bot integration (reference implementation based on Feishu/Synology).

## Install

Choose one of the following.

1. **From OpenClaw repo (dev/source)**  
   No install step. The plugin lives under `extensions/tcl-tv-bot` and is discovered as a bundled plugin when you run OpenClaw from the repo (e.g. `pnpm openclaw` or Gateway from source). Run **`pnpm install`** at the repo root so the `ws` dependency is available (needed only if you use **wsUrl** long connection). Add the channel config below and restart the Gateway.

2. **Local path (copy into state dir)**  
   From the OpenClaw repo root:
   ```bash
   openclaw plugins install ./extensions/tcl-tv-bot
   ```
   This copies the plugin to `~/.openclaw/extensions/tcl-tv-bot/`. **If you use WebSocket (wsUrl), install dependencies:**
   ```bash
   cd ~/.openclaw/extensions/tcl-tv-bot && npm install
   ```
   (Or `pnpm install` if you use pnpm.)

3. **Local path (link, no copy)**  
   For development without copying:
   ```bash
   openclaw plugins install -l /path/to/openclaw/extensions/tcl-tv-bot
   ```
   This adds the path to `plugins.load.paths` in your config. If you use **wsUrl**, install dependencies in that directory: `cd /path/to/openclaw/extensions/tcl-tv-bot && pnpm install`.

4. **From npm (when published)**  
   If the package is published as `@openclaw/tcl-tv-bot`:
   ```bash
   openclaw plugins install @openclaw/tcl-tv-bot
   ```

After install, add the channel config (see **Config**), then **restart the Gateway** so the plugin is loaded.

## Config

Add to `~/.openclaw/openclaw.json`:

```json5
{
  channels: {
    "tcl-tv-bot": {
      enabled: true,
      accounts: {
        "appId1": {
          apiUrl: "https://tcl-tv-bot-t.test.leiniao.com/tcl-tv-bot",
          appId: "appId1",
          appKey: "your-app-key-1",
          token: "optional-bearer-token",
          wsUrl: "wss://your-tv-bot.example.com/ws",
          enabled: true,
        },
        "appId2": {
          apiUrl: "https://tcl-tv-bot-t.test.leiniao.com/tcl-tv-bot",
          appId: "appId2",
          appKey: "your-app-key-2",
          token: "optional-bearer-token",
          wsUrl: "wss://your-tv-bot.example.com/ws",
          enabled: true,
        },
      },
    },
  },
}
```

You can define multiple accounts under `accounts` with keys like `appId1`, `appId2`; each account has its own `appId` / `appKey` sent to the backend.

- **apiUrl**: Bot API base URL. Outbound sends `POST {apiUrl}/message` with body `{ text, to? }`.
- **appId**: Optional. Value sent to backend as `appId` (query param and header `X-Tcl-App-Id`). If omitted, the account key (e.g. `appId1`) is used.
- **appKey**: App key for backend auth. Sent as query param `appKey` and header `X-Tcl-App-Key`.
- **token**: Optional; sent as `Authorization: Bearer <token>` on HTTP requests.
- **wsUrl**: Optional WebSocket URL for long connection. When set, OpenClaw connects to the backend and receives messages over WS; replies are sent via `apiUrl` (if set) or logged if only `wsUrl` is configured.

### Long connection (WebSocket)

To receive messages from your backend, set `wsUrl` (e.g. `wss://your-tv-bot.example.com/ws`). The plugin connects as a client with **two query parameters** (`appId`, `appKey`) and **two request headers** (`X-Tcl-App-Id`, `X-Tcl-App-Key`). Values come from config: `appId` (or account key if omitted), `appKey`. It then expects JSON lines/messages in this form:

```json
{ "type": "message", "text": "user message here", "from": "optional-peer-id" }
```

- `text`: required; content passed to the agent.
- `from`: optional; used as session peer id and reply target (e.g. device id). Defaults to `"default_client_2"`.

**Keepalive and reconnection (similar to Feishu channel):**
- The client sends a **WebSocket protocol ping** every 25s to avoid idle timeouts (e.g. code 1006 after ~60s). Your server can respond with pong or ignore.
- If the connection closes with **code 1000, 1001, 1005, or 1006** (normal/going away/no status/abnormal closure, e.g. server restart or graceful shutdown), the plugin **reconnects immediately** (no delay). For other close codes or connection errors, it uses **exponential backoff**: first retry after 2s, then 4s, 8s, 16s, 32s, then capped at 60s. If the server is down for a long time, the client keeps retrying every 60s until it comes back. Once a connection succeeds and then closes again (non-1006), the delay resets to 2s for the next cycle.

**Replies (outbound)** are sent over the **same WebSocket** when the connection is open: OpenClaw sends JSON `{ "type": "reply", "text": "...", "to": "<peerId>" }`. Your backend can listen for `type === "reply"` on the same connection. If the WebSocket is not open, the plugin falls back to HTTP `POST {apiUrl}/message` when `apiUrl` is set; if only `wsUrl` is set and the socket is down, the reply is not delivered (error logged).

### Viewing messages in the gateway chat window

When the plugin receives a message from the backend, it dispatches to the agent and the conversation (user message + assistant reply) is written to the **session transcript**. To see it in the gateway chat UI:

1. Open the gateway chat (Web or TUI).
2. In the session/channel list, select **TCL TV Bot** and the peer (e.g. `default_client_2` or the `from` value your backend sends). The session key is `agent:main:tcl-tv-bot:direct:<peerId>`.
3. The conversation history for that session will show the received messages and the agent’s replies.

If the chat UI subscribes to chat events for that session, it may update in real time when the agent finishes; otherwise refresh or re-select the session to load the latest history.

## Discovery

Plugin is under `extensions/tcl-tv-bot`. With repo run, it is discovered as a bundled plugin when `channels.tcl-tv-bot` is enabled. You can also add the path to `plugins.load.paths` or install to `~/.openclaw/extensions`.

## Troubleshooting

- **Cannot find module 'ws'**  
  The WebSocket client is only loaded when **wsUrl** is set. If you see this error, install dependencies so `ws` is available:
  - **From repo**: run `pnpm install` at the OpenClaw repo root.
  - **Installed to ~/.openclaw/extensions/tcl-tv-bot**: run `cd ~/.openclaw/extensions/tcl-tv-bot && npm install`.
  If you do not use long connection (no `wsUrl`), the plugin loads without `ws` and this error should not appear.

- **Message received but agent not triggered (no reply)**  
  If you see `raw payload` in Gateway logs but no `parsed from=...` or no assistant reply, the message never reaches the agent. Common causes:
  1. **Message format**  
     Payload must be valid JSON with `type: "message"` and `text` a non-empty string. Direct: `{"type":"message","text":"hello","from":"optional-id"}`. Envelope: outer `text` must be a stringified JSON object with `type` and `text`. If `text` is missing, empty, or not a string, the plugin returns without calling the dispatcher.
  2. **Parse failure**  
     Malformed JSON or unexpected structure causes `parseWSMessage` to return null; the handler exits at `if (!msg?.text) return`.
  3. **Dispatch error**  
     If you see `tcl-tv-bot[default]: dispatch error: ...` in logs, the exception is from the core dispatch/agent path (e.g. session store, config, or model). Check the full error and Gateway/config for that session.
  4. **Channel not started**  
     If `channelRuntime` is missing, the plugin does not start the WebSocket monitor (you see "channelRuntime not available - inbound disabled"). No messages are received.
  5. **Duplicate skipped**  
     If the same message is processed twice and the context includes a stable `MessageSid`, the core may skip it as duplicate. The plugin does not set `MessageSid` by default, so this only applies if you extend the payload to include a message id that gets passed into the context.
  Check Gateway logs for `raw payload` and `parsed from=...` to see how far the message got; any error after that is from the dispatcher or agent.

## Extending

- **Receive messages**: Long connection is implemented in `src/monitor.ts`; it connects to `wsUrl` and dispatches via `ctx.channelRuntime.reply.dispatchReplyWithBufferedBlockDispatcher`.
- **Probe/status**: Add `status.probeAccount` and `status.buildAccountSnapshot` for `openclaw channels status`.
- **Reply over WebSocket**: Outbound replies are already sent over the same WebSocket when connected (see Long connection: wire format `type: "reply"`).
