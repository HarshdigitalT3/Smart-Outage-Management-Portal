import type http from "http";
import { WebSocketServer, WebSocket } from "ws";
import type { OutageEvent, CrewDispatchEvent } from "@smartoutage/shared";

/**
 * Very small WebSocket hub:
 * - Accepts connections on /ws
 * - Broadcasts server-side events to all connected clients
 *
 * Auth is handled via query param token (?token=JWT) for WS handshakes.
 * We keep the hub focused on broadcasting; route-level auth is handled separately.
 */
export class WsHub {
  private wss: WebSocketServer | null = null;
  private clients = new Set<WebSocket>();

  // PUBLIC_INTERFACE
  attach(server: http.Server) {
    /**
     * Attaches a WebSocket server to an existing HTTP server.
     */
    this.wss = new WebSocketServer({ server, path: "/ws" });

    this.wss.on("connection", (socket) => {
      this.clients.add(socket);

      socket.on("close", () => {
        this.clients.delete(socket);
      });

      socket.on("error", () => {
        // Ensure errored sockets don't stay tracked.
        this.clients.delete(socket);
      });

      // Optional ping/pong could be added later.
    });
  }

  // PUBLIC_INTERFACE
  broadcast(event: OutageEvent | CrewDispatchEvent) {
    /**
     * Broadcasts an event to all connected websocket clients.
     *
     * Currently used for:
     * - outage realtime events (operator dashboards / maps)
     * - crew dispatch + job card realtime events (operator assignment + crew updates)
     */
    const payload = JSON.stringify(event);
    for (const ws of this.clients) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(payload);
      }
    }
  }
}
