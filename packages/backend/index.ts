// Starts the HTTP server. Everything else lives in src/app.ts.
import { app } from './src/app';
import { env } from './src/config/env';

app.listen(env.PORT, () => {
  console.log(`API listening on port ${env.PORT}`);
});
