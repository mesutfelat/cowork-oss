import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import "./i18n"; // Initialize i18n before rendering
import "./styles/index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
