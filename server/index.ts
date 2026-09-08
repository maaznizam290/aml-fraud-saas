import "dotenv/config";
import { createApp } from "./app.js";
import { getStore } from "./db.js";

const PORT = Number(process.env.PORT ?? 4000);

const app = createApp();
app.listen(PORT, () => {
  console.log(`[server] AML fraud gateway listening on port ${PORT} (store mode: ${getStore().mode})`);
});
