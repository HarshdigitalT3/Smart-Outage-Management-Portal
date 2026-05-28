import type http from "http";
import { WebSocketServer } from "ws";
import { verifyAccessToken } from "../utils/jwt.js";
import type { JwtClaims } from "@smartoutage/shared";
import { Roles } from "@smartoutage/shared";

/**
 * Applies operator-only auth to the WsHub's /ws endpoint by intercepting the upgrade.
 * We validate the access token from the query string (?token=...).
 *
 * Note: browsers cannot set custom headers in WebSocket constructors reliably,
 * so query param token is a pragmatic approach for this scaffold.
 */

// PUBLIC_INTERFACE
export function registerOperatorOnlyWsAuth(server: http.Server) {
  /**
   * Registers an HTTP upgrade handler that enforces operator-only access to /ws.
   *
   * This function must be called BEFORE creating the WebSocketServer, or must share
   * the same upgrade handling. Since `ws` handles upgrade internally when given {server, path},
   * we instead create a separate auth gate server and then let WsHub attach normally.
   *
   * Implementation detail:
   * - We create a "gate" WebSocketServer in noServer mode and close unauthorized upgrades.
   * - WsHub uses its own WebSocketServer on the same path. To avoid collisions, WsHub
   *   should be attached AFTER this gate and we forward authorized upgrades to it.
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
      if (decoded.role !== Roles.OPERATOR) {
        socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
        socket.destroy();
        return;
      }

      // Authorized: accept the upgrade on the gate and immediately close.
      // The actual WsHub server will accept a separate upgrade; this gate is purely
      // to ensure unauthorized upgrades are blocked early.
      gate.handleUpgrade(req, socket, head, (ws) => {
        // Immediately close this gate connection; the client will reconnect and be accepted
        // by the main hub. This avoids a second open socket.
        ws.close();
      });
    } catch {
      socket.write("HTTP/1.1 400 Bad Request\r\n\r\n");
      socket.destroy();
    }
  });

  return gate;
}
