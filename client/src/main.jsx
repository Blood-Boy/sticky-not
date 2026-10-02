import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import { applyTheme, store } from "./lib.js";
import "./styles.css";

applyTheme(store.get("mwn:theme", null));
createRoot(document.getElementById("app")).render(<App />);
