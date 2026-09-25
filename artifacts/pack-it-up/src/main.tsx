import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
// @ts-ignore — game is plain JS
import App from "./game/App.jsx";
import "./game/styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
