/**
 * Account resolution for TCL TV Bot channel.
 * Reads from channels.tcl-tv-bot and channels.tcl-tv-bot.accounts.<id>.
 */

import type { OpenClawConfig } from "openclaw/plugin-sdk";
import type { TclTvBotChannelConfig, ResolvedTclTvBotAccount } from "./types.js";

const CHANNEL_ID = "tcl-tv-bot";
const DEFAULT_ACCOUNT_ID = "default";

function getChannelConfig(cfg: OpenClawConfig): TclTvBotChannelConfig | undefined {
  return (cfg.channels as Record<string, unknown>)?.[CHANNEL_ID] as
    | TclTvBotChannelConfig
    | undefined;
}

/**
 * List all configured account IDs.
 */
export function listTclTvBotAccountIds(cfg: OpenClawConfig): string[] {
  const channelCfg = getChannelConfig(cfg);
  if (!channelCfg?.accounts || typeof channelCfg.accounts !== "object") {
    return channelCfg ? [DEFAULT_ACCOUNT_ID] : [];
  }
  const ids = Object.keys(channelCfg.accounts).filter(Boolean);
  return ids.length > 0 ? [...ids].sort((a, b) => a.localeCompare(b)) : [DEFAULT_ACCOUNT_ID];
}

/**
 * Resolve default account ID (from defaultAccount or first account).
 */
export function resolveDefaultTclTvBotAccountId(cfg: OpenClawConfig): string {
  const channelCfg = getChannelConfig(cfg);
  const preferred = channelCfg?.defaultAccount?.trim();
  if (preferred) return preferred;
  const ids = listTclTvBotAccountIds(cfg);
  return ids[0] ?? DEFAULT_ACCOUNT_ID;
}

/**
 * Resolve a single account with merged config.
 */
export function resolveTclTvBotAccount(
  cfg: OpenClawConfig,
  accountId?: string | null,
): ResolvedTclTvBotAccount {
  const channelCfg = getChannelConfig(cfg) ?? {};
  const id = (accountId?.trim() || DEFAULT_ACCOUNT_ID) as string;

  const base = {
    enabled: channelCfg.enabled !== false,
    apiUrl: "",
    token: undefined as string | undefined,
    appKey: undefined as string | undefined,
    wsUrl: undefined as string | undefined,
  };

  const accountCfg = channelCfg.accounts?.[id];
  if (accountCfg && typeof accountCfg === "object") {
    const hasApiUrl = Boolean(accountCfg.apiUrl?.trim());
    const hasWsUrl = Boolean(accountCfg.wsUrl?.trim());
    const appId = accountCfg.appId?.trim() || id;
    return {
      key: id,
      appId,
      enabled: accountCfg.enabled ?? base.enabled,
      configured: hasApiUrl || hasWsUrl,
      apiUrl: (accountCfg.apiUrl?.trim() ?? base.apiUrl) as string,
      token: accountCfg.token?.trim() || undefined,
      appKey: accountCfg.appKey?.trim() || undefined,
      wsUrl: accountCfg.wsUrl?.trim() || undefined,
    };
  }

  return {
    key: id,
    appId: id,
    enabled: base.enabled,
    configured: false,
    apiUrl: base.apiUrl,
    token: base.token,
    appKey: base.appKey,
    wsUrl: base.wsUrl,
  };
}
