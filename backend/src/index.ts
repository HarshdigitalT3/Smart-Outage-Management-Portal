import { config } from "./config/env.js";
import { createApp } from "./app.js";
import http from "http";
import { wsHub } from "./singleton/ws.js";

const app = createApp();

const server = http.createServer(app);

// Attach WebSocket hub on the same port (path: /ws).
wsHub.attach(server);

server.listen(config.port, () => {
  // eslint-disable-next-line no-console
  console.log(`API listening on port ${config.port} (${config.nodeEnv})`);
});
