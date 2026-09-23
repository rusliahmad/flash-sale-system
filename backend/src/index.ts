import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { createRedisClient } from "./config/redis.js";
import { seedStock } from "./services/sale.service.js";

const redis = createRedisClient();
await seedStock(redis);

const app = createApp(redis);
app.listen(env.port, () => {
  console.log(`flash-sale-backend listening on :${env.port}`);
});
