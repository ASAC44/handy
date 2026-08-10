import { StrictMode, type ComponentType } from "react";
import { createRoot } from "react-dom/client";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

const path = location.pathname.replace(/\/+$/, "") || "/";
const dashboard = path === "/dashboard";
document.documentElement.dataset.page = dashboard ? "dashboard" : "landing";
document.documentElement.classList.toggle(
  "dark",
  dashboard && ["dark", "ink"].includes(localStorage.getItem("handy.theme") ?? ""),
);
let Page: ComponentType;

if (dashboard) {
  Page = (await import("./DashboardPage")).DashboardPage;
  document.title = "Handy — Meeting agents";
} else {
  Page = (await import("./landing/Landing")).Landing;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <TooltipProvider>
      <Page />
    </TooltipProvider>
  </StrictMode>,
);
