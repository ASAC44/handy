import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { Button } from "./ui/button";

export type Theme = "light" | "dark";

/** Toggles shadcn's light and dark token sets and persists the preference. */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(() => {
    const saved = localStorage.getItem("handy.theme");
    return saved === "dark" || saved === "ink" ? "dark" : "light";
  });

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    delete document.documentElement.dataset.theme;
    localStorage.setItem("handy.theme", theme);
  }, [theme]);

  const next: Theme = theme === "light" ? "dark" : "light";
  const Icon = theme === "light" ? Sun : Moon;

  return (
    <Button
      variant="outline"
      size="sm"
      className="capBtn themeToggle"
      onClick={() => setTheme(next)}
      data-tip={`Theme: ${theme} — switch to ${next}`}
      aria-label="Switch theme"
    >
      <Icon aria-hidden="true" /> {theme === "light" ? "Light" : "Dark"}
    </Button>
  );
}
