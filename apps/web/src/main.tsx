import { StrictMode, type ComponentType } from "react";
import { createRoot } from "react-dom/client";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./shadcn.css";

const path = location.pathname.replace(/\/+$/, "") || "/";
let Page: ComponentType;

if (path === "/dashboard") {
  await import("./styles.css");
  Page = (await import("./DashboardPage")).DashboardPage;
  document.title = "Handy — Meeting agents";
} else {
  await import("./landing/styles.css");
  Page = (await import("./landing/Landing")).Landing;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <TooltipProvider>
      <Page />
    </TooltipProvider>
  </StrictMode>,
);
