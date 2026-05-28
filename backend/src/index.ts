import { config } from "./config/env.js";
import { createApp } from "./app.js";
import http from "http";
import { wsHub } from "./singleton/ws.js";
import { registerRealtimeWsAuth } from "./realtime/wsAuth.js";

const app = createApp();

const server = http.createServer(app);

// Enforce RBAC for realtime connections (operator + crew only), then attach hub.
const gatedWss = registerRealtimeWsAuth(server);
wsHub.attach(gatedWss);

server.listen(config.port, () => {
  // eslint-disable-next-line no-console
  console.log(`API listening on port ${config.port} (${config.nodeEnv})`);
});
