import { useEffect, useState } from "react";

export type Theme = "paper" | "ink";
const THEMES: { id: Theme; label: string; icon: string }[] = [
  { id: "paper", label: "Paper", icon: "◐" },
  { id: "ink", label: "Ink", icon: "◑" },
];

/** Switches the app theme by setting [data-theme] on <html>; persisted to
 *  localStorage. An inline script in index.html applies it before first paint
 *  (no flash); this keeps it in sync and lets the user change it. */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(() => {
    const saved = localStorage.getItem("sidebar.theme");
    return saved === "ink" || saved === "paper" ? saved : "paper";
  });

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("sidebar.theme", theme);
  }, [theme]);

  const current = THEMES.find((t) => t.id === theme) ?? THEMES[0];
  const next: Theme = theme === "paper" ? "ink" : "paper";

  return (
    <button
      className="capBtn themeToggle"
      onClick={() => setTheme(next)}
      data-tip={`Theme: ${current.label} — switch to ${next}`}
      aria-label="Switch theme"
    >
      {current.icon} {current.label}
    </button>
  );
}
