/**
 * WebSocket long connection for TCL TV Bot.
 * Connects to backend wsUrl and dispatches incoming messages to the agent.
 * Expected wire format: JSON { type: "message", text: string, from?: string }.
 * Uses dynamic import("ws") so the plugin loads without ws when only apiUrl is used.
 */

import type { ResolvedTclTvBotAccount } from "./types.js";
import { resolveTclTvBotAccount } from "./accounts.js";
import { sendTclTvBotText } from "./send.js";
import { isAllowedWsUrl } from "./validate.js";

const CHANNEL_ID = "tcl-tv-bot";
/** Default "to" / peerId when backend does not send "from". */
const DEFAULT_TO = "default_client_2";
/** Max inbound message length to avoid DoS / memory abuse. */
const MAX_INBOUND_TEXT_LENGTH = 100_000;
/** Max peer id length for session key and logs. */
const MAX_PEER_ID_LENGTH = 512;

export type TclTvBotWSMessage = {
  type: "message";
  text: string;
  from?: string;
};

/** Outbound reply over the same WebSocket. Backend can distinguish by type "reply". */
export type TclTvBotWSReply = {
  type: "reply";
  text: string;
  to?: string;
};

/** Normalize WebSocket message to string (ws may deliver Buffer). */
function rawDataToString(data: unknown): string {
  if (typeof data === "string") return data;
  if (Buffer.isBuffer(data)) return data.toString("utf8");
  if (data instanceof ArrayBuffer) return new TextDecoder().decode(data);
  if (ArrayBuffer.isView(data)) return new TextDecoder().decode(data.buffer);
  return "";
}

function clampPeerId(value: string | undefined): string | undefined {
  if (value == null || value === "") return undefined;
  const s = value.trim();
  return s.length > MAX_PEER_ID_LENGTH ? s.slice(0, MAX_PEER_ID_LENGTH) : s || undefined;
}

function parseWSMessage(data: unknown): TclTvBotWSMessage | null {
  const str = rawDataToString(data);
  if (!str) return null;
  try {
    const raw = JSON.parse(str) as Record<string, unknown>;
    // Direct format: { type: "message", text: "...", from?: "..." }
    if (raw?.type === "message" && typeof raw.text === "string") {
      const text = String(raw.text).trim();
      if (text.length > MAX_INBOUND_TEXT_LENGTH) return null;
      return {
        type: "message",
        text,
        from: clampPeerId(typeof raw.from === "string" ? raw.from : undefined),
      };
    }
    // Envelope format: { to?: "...", text: "{\"type\":\"message\",...}" }
    if (typeof raw?.text === "string" && raw.text.trim().startsWith("{")) {
      const inner = JSON.parse(String(raw.text)) as Record<string, unknown>;
      if (inner?.type === "message" && typeof inner.text === "string") {
        const text = String(inner.text).trim();
        if (text.length > MAX_INBOUND_TEXT_LENGTH) return null;
        return {
          type: "message",
          text,
          from: clampPeerId(
            typeof inner.from === "string"
              ? inner.from
              : typeof raw.to === "string"
                ? raw.to
                : undefined,
          ),
        };
      }
    }
  } catch {
    return null;
  }
  return null;
}

function waitUntilAbort(signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve();
      return;
    }
    signal?.addEventListener("abort", () => resolve(), { once: true });
  });
}

import type { OpenClawConfig } from "openclaw/plugin-sdk";

export type MonitorParams = {
  account: ResolvedTclTvBotAccount;
  cfg: OpenClawConfig;
  channelRuntime: {
    reply: {
      finalizeInboundContext: (ctx: Record<string, unknown>) => Record<string, unknown>;
      dispatchReplyWithBufferedBlockDispatcher: (params: {
        ctx: Record<string, unknown>;
        cfg: OpenClawConfig;
        dispatcherOptions: {
          deliver: (payload: { text?: string; body?: string }) => Promise<void>;
        };
      }) => Promise<unknown>;
    };
    routing: {
      buildAgentSessionKey: (params: {
        agentId: string;
        channel: string;
        accountId?: string | null;
        peer?: { kind: string; id: string } | null;
      }) => string;
    };
  };
  abortSignal?: AbortSignal;
  setStatus?: (patch: { connected?: boolean; lastError?: string | null }) => void;
  log?: { info?: (msg: string) => void; error?: (msg: string) => void };
};

/** Ping interval to avoid idle timeout (e.g. 60s) closing the connection with 1006. */
const PING_INTERVAL_MS = 25_000;
/** Initial delay before first reconnect; doubles each time (exponential backoff) until max. */
const RECONNECT_DELAY_INITIAL_MS = 2_000;
/** Max delay between reconnect attempts when server is long unavailable (e.g. 10 min startup). */
const RECONNECT_DELAY_MAX_MS = 60_000;

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Start WebSocket client to backend wsUrl; on each message dispatch to agent and deliver reply via send.
 * Keeps connection alive with protocol ping and auto-reconnects on close (similar to Feishu channel).
 */
export async function runTclTvBotWSMonitor(params: MonitorParams): Promise<void> {
  const { account, cfg, channelRuntime, abortSignal, setStatus, log } = params;
  const wsUrl = account.wsUrl?.trim();
  if (!wsUrl) {
    log?.info?.(`tcl-tv-bot[${account.appId}]: no wsUrl, skipping long connection`);
    return waitUntilAbort(abortSignal);
  }

  // Always append appId and appKey (WS interface params) so the backend can identify and authenticate
  const appKey = account.appKey ?? "";
  let connectUrl: string;
  try {
    const url = new URL(wsUrl);
    url.searchParams.set("appId", account.appId);
    url.searchParams.set("appKey", appKey);
    connectUrl = url.toString();
  } catch {
    const params = new URLSearchParams({ appId: account.appId, appKey });
    const sep = wsUrl.includes("?") ? "&" : "?";
    connectUrl = `${wsUrl}${sep}${params.toString()}`;
  }

  let WebSocket: (typeof import("ws"))["default"];
  try {
    const mod = await import("ws");
    WebSocket = mod.default;
  } catch (err) {
    const msg =
      "tcl-tv-bot long connection requires the 'ws' package. In the plugin directory run: npm install (or pnpm install)";
    log?.error?.(msg);
    setStatus?.({ connected: false, lastError: msg });
    return;
  }

  const wsOptions: { headers?: Record<string, string> } = {
    headers: {
      "X-Tcl-App-Id": account.appId,
      "X-Tcl-App-Key": account.appKey ?? "",
    },
  };

  const WS_OPEN = 1;

  /** Run a single connection; resolves with close code when the socket closes, rejects on connection error. */
  const runOneConnection = (): Promise<{ closeCode: number } | void> =>
    new Promise<{ closeCode: number } | void>((resolve, reject) => {
      if (abortSignal?.aborted) {
        resolve();
        return;
      }
      log?.info?.(`tcl-tv-bot[${account.appId}]: connecting to ${connectUrl.replace(/appKey=[^&]+/g, "appKey=***")}`);
      const connectionSessionId =
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID().slice(0, 8)
          : `conn-${Date.now().toString(36)}`;
      const ws = new WebSocket(connectUrl, wsOptions);

      let pingTimer: ReturnType<typeof setInterval> | null = null;

      function startPing() {
        if (pingTimer) return;
        pingTimer = setInterval(() => {
          if (ws.readyState !== WS_OPEN) return;
          try {
            ws.ping();
          } catch {
            // ignore
          }
        }, PING_INTERVAL_MS);
      }

      function stopPing() {
        if (pingTimer) {
          clearInterval(pingTimer);
          pingTimer = null;
        }
      }

      function sendReplyOverWs(text: string, to?: string): boolean {
        if (ws.readyState !== WS_OPEN) return false;
        try {
          const payload: TclTvBotWSReply = { type: "reply", text, to: to || undefined };
          ws.send(JSON.stringify(payload));
          return true;
        } catch {
          return false;
        }
      }

      ws.on("open", () => {
        setStatus?.({ connected: true, lastError: null });
        log?.info?.(
          `tcl-tv-bot[${account.appId}]: WebSocket connected sessionId=${connectionSessionId}`,
        );
        startPing();
      });

      ws.on("message", async (data: unknown) => {
      const rawStr = rawDataToString(data);
      const rawPreview = rawStr.length > 500 ? `${rawStr.slice(0, 500)}...` : rawStr;
      log?.info?.(`tcl-tv-bot[${account.appId}]: raw payload ${JSON.stringify(rawPreview)}`);
      const msg = parseWSMessage(data);
      if (!msg?.text) {
        return;
      }
      const peerId = msg.from ?? DEFAULT_TO;
      const preview = msg.text.length > 200 ? `${msg.text.slice(0, 200)}...` : msg.text;
      log?.info?.(`tcl-tv-bot[${account.appId}]: parsed from=${peerId} text=${JSON.stringify(preview)}`);
      try {
        const sessionKey = channelRuntime.routing.buildAgentSessionKey({
          agentId: "main",
          channel: CHANNEL_ID,
          accountId: account.key,
          peer: { kind: "direct", id: peerId },
        });
        const msgCtx = channelRuntime.reply.finalizeInboundContext({
          Body: msg.text,
          RawBody: msg.text,
          CommandBody: msg.text,
          From: `${CHANNEL_ID}:${peerId}`,
          To: `${CHANNEL_ID}:${peerId}`,
          SessionKey: sessionKey,
          AccountId: account.key,
          OriginatingChannel: CHANNEL_ID,
          OriginatingTo: `${CHANNEL_ID}:${peerId}`,
          ChatType: "direct",
          SenderId: peerId,
          Provider: CHANNEL_ID,
          Surface: CHANNEL_ID,
          ConversationLabel: peerId,
          Timestamp: Date.now(),
        });

        await channelRuntime.reply.dispatchReplyWithBufferedBlockDispatcher({
          ctx: msgCtx,
          cfg,
          dispatcherOptions: {
            deliver: async (payload: { text?: string; body?: string }) => {
              const text = payload?.text ?? payload?.body;
              if (!text) return;
              const acc = resolveTclTvBotAccount(cfg, account.key);
              // Prefer sending over the same WebSocket when connected
              if (sendReplyOverWs(text, peerId)) {
                return;
              }
              // Fallback to HTTP when apiUrl is set
              if (acc.apiUrl) {
                const result = await sendTclTvBotText(acc, text, peerId);
                if (!result.ok) {
                  log?.error?.(`tcl-tv-bot[${account.appId}] send failed: ${result.error}`);
                }
                return;
              }
              log?.error?.(`tcl-tv-bot[${account.appId}] cannot deliver reply: WebSocket not open and apiUrl not set`);
            },
          },
        });
      } catch (err) {
        log?.error?.(`tcl-tv-bot[${account.appId}] dispatch error: ${String(err)}`);
      }
    });

      ws.on("close", (code, reason) => {
        stopPing();
        setStatus?.({ connected: false });
        log?.info?.(
          `tcl-tv-bot[${account.appId}]: WebSocket closed sessionId=${connectionSessionId} code=${code} ${reason?.toString() ?? ""}`,
        );
        resolve({ closeCode: code });
      });

      ws.on("error", (err) => {
        setStatus?.({ connected: false, lastError: String(err) });
        log?.error?.(`tcl-tv-bot[${account.appId}] WebSocket error: ${String(err)}`);
        reject(err);
      });

      abortSignal?.addEventListener(
        "abort",
        () => {
          try {
            ws.close();
          } catch {}
        },
        { once: true },
      );
    });

  // Reconnect loop: 1000/1001/1005/1006 → immediate reconnect; else exponential backoff.
  const IMMEDIATE_RECONNECT_CODES = new Set([1000, 1001, 1005, 1006]);
  let reconnectDelayMs = RECONNECT_DELAY_INITIAL_MS;
  while (!abortSignal?.aborted) {
    try {
      const result = await runOneConnection();
      if (result != null && IMMEDIATE_RECONNECT_CODES.has(result.closeCode)) {
        reconnectDelayMs = 0;
        log?.info?.(`tcl-tv-bot[${account.appId}]: code=${result.closeCode}, reconnecting immediately`);
      } else {
        reconnectDelayMs = RECONNECT_DELAY_INITIAL_MS;
      }
    } catch (err) {
      log?.error?.(`tcl-tv-bot[${account.appId}] connection error: ${String(err)}`);
      reconnectDelayMs = Math.min(reconnectDelayMs * 2, RECONNECT_DELAY_MAX_MS);
    }
    if (abortSignal?.aborted) break;
    if (reconnectDelayMs > 0) {
      log?.info?.(`tcl-tv-bot[${account.appId}]: reconnecting in ${reconnectDelayMs / 1000}s...`);
      await delay(reconnectDelayMs);
    }
    if (abortSignal?.aborted) break;
    log?.info?.(`tcl-tv-bot[${account.appId}]: reconnecting now`);
  }
}
