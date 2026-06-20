import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { setDefaultHeaders, setBaseUrl } from "@workspace/api-client-react";

// Point all /api/* calls at the Replit backend. Prefer the build-time env var,
// but fall back to the known production URL so the app works even when the env
// var isn't picked up by the build. This runs synchronously before React
// renders below, so the base URL is always set before any API hook fires.
const DEFAULT_API_BASE_URL = "https://vera-nexus-rebuild--kshitijaurelian.replit.app";
const apiBaseUrl =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) || DEFAULT_API_BASE_URL;
setBaseUrl(apiBaseUrl.replace(/\/+$/, ""));

// Persistent session ID for all API calls (matches backend settings row lookup)
function getSessionId(): string {
  let id = localStorage.getItem("vn_session_id");
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem("vn_session_id", id);
  }
  return id;
}
const storedGroqKey = localStorage.getItem("ve_groq_key");
setDefaultHeaders({
  "x-session-id": getSessionId(),
  ...(storedGroqKey ? { "x-groq-api-key": storedGroqKey } : {}),
});

createRoot(document.getElementById("root")!).render(<App />);
