import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import { applyTheme, store } from "./lib.js";
import "./styles.css";

applyTheme(store.get("mwn:theme", null));
createRoot(document.getElementById("app")).render(<App />);

// Lets the app open without a connection (see public/sw.js).
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(() => {}));
}
