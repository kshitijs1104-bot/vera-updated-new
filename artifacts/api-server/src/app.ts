import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { clerkMiddleware } from "./middlewares/auth";

if (!process.env["CLERK_SECRET_KEY"]) {
  throw new Error(
    "CLERK_SECRET_KEY environment variable is required but was not provided. " +
      "Set it in your Replit Secrets — see artifacts/api-server/.env.example.",
  );
}

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
// TODO: lock down before production — set ALLOWED_ORIGIN to your Vercel deployment URL.
// CORS must be registered before any routes so preflight (OPTIONS) requests are
// handled for every endpoint, including the AI POST routes.
app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "x-session-id", "x-groq-api-key"],
    credentials: false,
  }),
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Reads and verifies the Clerk session token on every request (Authorization
// header or __session cookie) and makes it available via getAuth(req) in any
// downstream handler. Does not reject unauthenticated requests on its own —
// routes that must be signed-in use requireAuth from ./middlewares/auth.
app.use(clerkMiddleware());

app.use("/api", router);

export default app;
