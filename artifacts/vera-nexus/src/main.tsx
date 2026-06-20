import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { setDefaultHeaders, setBaseUrl } from "@workspace/api-client-react";

// Point all /api/* calls at the Replit backend when VITE_API_BASE_URL is set,
// otherwise fall back to relative /api paths (useful for local dev with a proxy).
const apiBaseUrl = import.meta.env.VITE_API_BASE_URL as string | undefined;
if (apiBaseUrl) {
  setBaseUrl(apiBaseUrl.replace(/\/+$/, ""));
}

// Persistent session ID for all API calls (matches backend settings row lookup)
function getSessionId(): string {
  let id = localStorage.getItem("vn_session_id");
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem("vn_session_id", id);
  }
  return id;
}
setDefaultHeaders({ "x-session-id": getSessionId() });

createRoot(document.getElementById("root")!).render(<App />);
