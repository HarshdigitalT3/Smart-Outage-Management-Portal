import type { CrewDispatchEvent } from "@smartoutage/shared";

type SubscribeOptions = {
  accessToken: string;
  onEvent: (event: CrewDispatchEvent) => void;
  onConnectionChange?: (connected: boolean) => void;
  onError?: (error: unknown) => void;
};

/**
 * Computes ws:// or wss:// base url from the configured API base URL.
 */
function computeWsBaseUrl(apiBaseUrl: string): string {
  const u = new URL(apiBaseUrl);
  if (u.protocol === "https:") u.protocol = "wss:";
  else u.protocol = "ws:";
  return u.toString().replace(/\/$/, "");
}

// PUBLIC_INTERFACE
export function subscribeToCrewDispatchEvents(opts: SubscribeOptions): { close: () => void } {
  /**
   * Subscribes to backend websocket for crew dispatch/job card events.
   *
   * Backend notes:
   * - WebSocket endpoint is on the same server at path `/ws`
   * - Auth is passed via query string: ?token=JWT (browser limitation)
   *
   * Returns:
   * - close(): terminates the websocket connection.
   */
  const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "";
  if (!apiBaseUrl) {
    opts.onError?.(new Error("VITE_API_BASE_URL is not configured; cannot connect to websocket."));
    return { close: () => undefined };
  }

  const wsBase = computeWsBaseUrl(apiBaseUrl);
  const wsUrl = `${wsBase}/ws?token=${encodeURIComponent(opts.accessToken)}`;

  let isClosedByUser = false;
  let ws: WebSocket | null = null;

  function connect() {
    ws = new WebSocket(wsUrl);

    ws.addEventListener("open", () => {
      opts.onConnectionChange?.(true);
    });

    ws.addEventListener("close", () => {
      opts.onConnectionChange?.(false);
      if (!isClosedByUser) window.setTimeout(() => connect(), 1000);
    });

    ws.addEventListener("error", (e) => {
      opts.onError?.(e);
    });

    ws.addEventListener("message", (msg) => {
      try {
        const raw = typeof msg.data === "string" ? msg.data : "";
        const parsed = JSON.parse(raw) as CrewDispatchEvent;
        if (!parsed || typeof parsed !== "object" || typeof (parsed as any).type !== "string") return;

        // Filter only our event types; backend also sends outage events over same /ws.
        if (parsed.type === "job_assigned" || parsed.type === "job_status_updated") {
          opts.onEvent(parsed);
        }
      } catch (err) {
        opts.onError?.(err);
      }
    });
  }

  connect();

  return {
    close() {
      isClosedByUser = true;
      try {
        ws?.close();
      } catch {
        // ignore
      }
      ws = null;
    }
  };
}
