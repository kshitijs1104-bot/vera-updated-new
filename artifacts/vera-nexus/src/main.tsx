import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { setDefaultHeaders } from "@workspace/api-client-react";

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
