import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "./styles/tokens.css";
import "./styles/thmanyah.css";
import "./styles/app.css";
import App from "./App";
import { AppBoundary } from "./components/AppBoundary";
import { watchActions } from "./trace";

watchActions();

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AppBoundary>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </AppBoundary>
  </React.StrictMode>,
);
