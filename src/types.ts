/**
 * TCL TV Bot channel types.
 * Config lives under channels.tcl-tv-bot and channels.tcl-tv-bot.accounts.<accountId>.
 */

export type TclTvBotChannelConfig = {
  enabled?: boolean;
  defaultAccount?: string;
  accounts?: Record<string, TclTvBotAccountConfig>;
};

export type TclTvBotAccountConfig = {
  enabled?: boolean;
  /** Bot API base URL (e.g. https://your-tv-bot.example.com/api) */
  apiUrl?: string;
  /** Optional token for auth (Bearer). */
  token?: string;
  /** App id sent to backend (WS/HTTP). If omitted, the account key (e.g. default) is used. */
  appId?: string;
  /** App key sent when connecting (WS query) and on every request (X-Tcl-App-Key). */
  appKey?: string;
  /** Optional WebSocket URL for receiving events. */
  wsUrl?: string;
};

export type ResolvedTclTvBotAccount = {
  /** Config account key (e.g. default), for re-resolution only. */
  key: string;
  /** Value sent to backend as appId (config appId or key). */
  appId: string;
  appKey?: string;
  enabled: boolean;
  configured: boolean;
  apiUrl: string;
  token?: string;
  wsUrl?: string;
};
