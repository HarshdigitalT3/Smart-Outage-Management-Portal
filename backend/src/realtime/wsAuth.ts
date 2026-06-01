import type http from "http";
import { WebSocketServer } from "ws";
import { verifyAccessToken } from "../utils/jwt.js";
import type { JwtClaims } from "@smartoutage/shared";
import { Roles } from "@smartoutage/shared";

/**
 * Applies role-based auth to the WsHub's /ws endpoint by intercepting the upgrade.
 * We validate the access token from the query string (?token=...).
 *
 * Note: browsers cannot set custom headers in WebSocket constructors reliably,
 * so query param token is a pragmatic approach for this scaffold.
 */

// PUBLIC_INTERFACE
export function registerRealtimeWsAuth(server: http.Server) {
  /**
   * Registers an HTTP upgrade handler that enforces RBAC access to /ws.
   *
   * Allowed roles:
   * - Operator: needs outage + dispatch realtime updates (AC2)
   * - Crew: needs job card realtime updates (AC4)
   *
   * Customer is intentionally excluded from realtime websockets; customers use the public
   * postcode lookup endpoint instead (AC5).
   */
  const gate = new WebSocketServer({ noServer: true });

  server.on("upgrade", (req, socket, head) => {
    try {
      const url = new URL(req.url ?? "", `http://${req.headers.host ?? "localhost"}`);
      if (url.pathname !== "/ws") return;

      const token = url.searchParams.get("token");
      if (!token) {
        socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
        socket.destroy();
        return;
      }

      const decoded = verifyAccessToken(token) as JwtClaims;
      const allowed = decoded.role === Roles.OPERATOR || decoded.role === Roles.CREW;
      if (!allowed) {
        socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
        socket.destroy();
        return;
      }

      // Authorized: accept the upgrade on the gate. The WsHub attaches to this gate (noServer mode)
      // so there is only a single websocket connection.
      gate.handleUpgrade(req, socket, head, (ws) => {
        gate.emit("connection", ws, req);
      });
    } catch {
      socket.write("HTTP/1.1 400 Bad Request\r\n\r\n");
      socket.destroy();
    }
  });

  return gate;
}
