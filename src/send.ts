/**
 * Send messages to TCL TV Bot API.
 * POST to apiUrl/message (or similar) with text payload.
 */

import type { ResolvedTclTvBotAccount } from "./types.js";

export type SendTextResult = { ok: true } | { ok: false; error: string };

/**
 * Send text to the TCL TV Bot endpoint.
 * Expects API to accept POST with JSON body { text: string, to?: string }.
 */
export async function sendTclTvBotText(
  account: ResolvedTclTvBotAccount,
  text: string,
  to?: string,
): Promise<SendTextResult> {
  const base = account.apiUrl.replace(/\/+$/, "");
  const url = `${base}/message`;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Tcl-App-Id": account.appId,
    "X-Tcl-App-Key": account.appKey ?? "",
  };
  if (account.token) {
    headers["Authorization"] = `Bearer ${account.token}`;
  }

  const body = JSON.stringify({ text, to: to || undefined });

  try {
    const res = await fetch(url, {
      method: "POST",
      headers,
      body,
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => res.statusText);
      return { ok: false, error: `${res.status}: ${errText}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}
