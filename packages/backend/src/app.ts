// Builds the Express app. The order of this middleware list matters.
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { env } from './config/env';
import { routes } from './routes';
import { errorHandler } from './common/middleware/error-handler';
import { notFound } from './common/middleware/not-found';
import { globalLimiter } from './common/middleware/rate-limit';

export const app = express();

// Only when actually running behind a reverse proxy, otherwise clients could fake their IP.
if (env.TRUST_PROXY > 0) app.set('trust proxy', env.TRUST_PROXY);

app.use(helmet());
app.use(
  cors({
    // Must run before the routes so browser preflight requests are answered.
    origin: env.CORS_ORIGINS.length > 0 ? env.CORS_ORIGINS : false,
    methods: ['GET', 'POST', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  }),
);
app.use(globalLimiter);
app.use(express.json({ limit: '100kb' }));

app.use('/api/v1', routes);

app.use(notFound);
app.use(errorHandler); // MUST be last, so it can catch errors thrown by everything above
