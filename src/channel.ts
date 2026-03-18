/**
 * TCL TV Bot channel plugin (reference implementation based on Feishu/Synology).
 * Config: channels.tcl-tv-bot.accounts.<accountId>.apiUrl, token, appId, appKey, wsUrl, enabled.
 * Long connection: set wsUrl to receive messages from backend via WebSocket.
 */

import type { ChannelPlugin, OpenClawConfig } from "openclaw/plugin-sdk";
import { DEFAULT_ACCOUNT_ID } from "openclaw/plugin-sdk";
import {
  listTclTvBotAccountIds,
  resolveDefaultTclTvBotAccountId,
  resolveTclTvBotAccount,
} from "./accounts.js";
import { runTclTvBotWSMonitor } from "./monitor.js";
import { sendTclTvBotText } from "./send.js";
import type { ResolvedTclTvBotAccount, TclTvBotChannelConfig } from "./types.js";

const CHANNEL_ID = "tcl-tv-bot";

function setAccountEnabled(
  cfg: OpenClawConfig,
  accountId: string,
  enabled: boolean,
): OpenClawConfig {
  const channelCfg = (cfg.channels as Record<string, unknown>)?.[CHANNEL_ID] as
    | TclTvBotChannelConfig
    | undefined;
  if (accountId === DEFAULT_ACCOUNT_ID) {
    return {
      ...cfg,
      channels: {
        ...cfg.channels,
        [CHANNEL_ID]: { ...channelCfg, enabled },
      },
    };
  }
  const accounts = { ...channelCfg?.accounts, [accountId]: { ...channelCfg?.accounts?.[accountId], enabled } };
  return {
    ...cfg,
    channels: {
      ...cfg.channels,
      [CHANNEL_ID]: { ...channelCfg, accounts },
    },
  };
}

export const tclTvBotPlugin: ChannelPlugin<ResolvedTclTvBotAccount> = {
  id: CHANNEL_ID,
  meta: {
    id: CHANNEL_ID,
    label: "TCL TV Bot",
    selectionLabel: "TCL TV Bot",
    docsPath: "/channels/tcl-tv-bot",
    blurb: "Custom bot channel for TCL TV integration.",
    aliases: ["tcltv", "tcl-tv"],
    order: 95,
  },
  capabilities: {
    chatTypes: ["direct"],
    polls: false,
    threads: false,
    media: false,
    reactions: false,
    edit: false,
    reply: true,
  },
  reload: { configPrefixes: [`channels.${CHANNEL_ID}`] },
  configSchema: {
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        enabled: { type: "boolean" },
        defaultAccount: { type: "string" },
        accounts: {
          type: "object",
          additionalProperties: {
            type: "object",
            properties: {
              enabled: { type: "boolean" },
              apiUrl: { type: "string" },
              token: { type: "string" },
              appId: { type: "string" },
              appKey: { type: "string" },
              wsUrl: { type: "string" },
            },
          },
        },
      },
    },
  },
  config: {
    listAccountIds: (cfg) => listTclTvBotAccountIds(cfg),
    resolveAccount: (cfg, accountId) => resolveTclTvBotAccount(cfg, accountId),
    defaultAccountId: (cfg) => resolveDefaultTclTvBotAccountId(cfg),
    setAccountEnabled: ({ cfg, accountId, enabled }) =>
      setAccountEnabled(cfg, accountId, enabled),
    isConfigured: (account) => account.configured,
    isEnabled: (account) => account.enabled,
  },
  gateway: {
    startAccount: async (ctx) => {
      const account = resolveTclTvBotAccount(ctx.cfg, ctx.accountId);
      if (!account.configured) {
        ctx.log?.info?.(`tcl-tv-bot[${ctx.accountId}]: not configured (set apiUrl or wsUrl), skipping`);
        return;
      }
      if (!ctx.channelRuntime) {
        ctx.log?.warn?.("tcl-tv-bot: channelRuntime not available - inbound disabled");
        return;
      }
      ctx.log?.info?.(`tcl-tv-bot[${ctx.accountId}]: starting (apiUrl=${Boolean(account.apiUrl)}, wsUrl=${Boolean(account.wsUrl)})`);
      return runTclTvBotWSMonitor({
        account,
        cfg: ctx.cfg,
        channelRuntime: ctx.channelRuntime,
        abortSignal: ctx.abortSignal,
        setStatus: (patch) => ctx.setStatus({ ...ctx.getStatus(), ...patch }),
        log: ctx.log,
      });
    },
  },
  outbound: {
    deliveryMode: "direct",
    textChunkLimit: 2000,
    sendText: async (ctx) => {
      const account = resolveTclTvBotAccount(ctx.cfg, ctx.accountId ?? undefined);
      if (!account.configured) {
        return { ok: false, error: "TCL TV Bot account not configured (missing apiUrl)" };
      }
      const result = await sendTclTvBotText(account, ctx.text, ctx.to);
      if (!result.ok) return { ok: false, error: result.error };
      return { ok: true };
    },
  },
};
