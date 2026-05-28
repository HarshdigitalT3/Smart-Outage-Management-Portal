import { config } from "./config/env.js";
import { createApp } from "./app.js";

const app = createApp();

app.listen(config.port, () => {
  // eslint-disable-next-line no-console
  console.log(`API listening on port ${config.port} (${config.nodeEnv})`);
});
