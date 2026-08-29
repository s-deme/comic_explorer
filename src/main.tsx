import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { ViewerWindow } from "./features/viewer/ViewerWindow";
import { isViewerWindowLocation } from "./features/viewer/viewer-window";
import "./styles.css";

const root = document.getElementById("root");

if (root === null) {
  throw new Error("Application root element was not found");
}

createRoot(root).render(
  <StrictMode>
    {isViewerWindowLocation() ? <ViewerWindow /> : <App />}
  </StrictMode>,
);
