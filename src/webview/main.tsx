import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./ChatApp";
import "./styles/globals.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
