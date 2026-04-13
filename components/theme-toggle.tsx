"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ThemeToggle() {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const saved = window.localStorage.getItem("theme");
    const dark = saved === "dark";
    document.documentElement.classList.toggle("dark", dark);
    if (saved !== "dark" && saved !== "light") {
      window.localStorage.setItem("theme", "light");
    }
    setIsDark(dark);
  }, []);

  const toggleTheme = () => {
    const next = !isDark;
    setIsDark(next);
    document.documentElement.classList.toggle("dark", next);
    window.localStorage.setItem("theme", next ? "dark" : "light");
  };

  return (
    <Button
      type="button"
      variant="outline"
      className="h-10 min-w-10 border-slate-400 text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-50 dark:hover:bg-slate-800"
      onClick={toggleTheme}
      aria-label="تبديل المظهر"
      title="تبديل المظهر"
    >
      <span className="inline-flex h-4 w-4 items-center justify-center">
        {isDark ? <Sun className="h-4 w-4 transition-transform duration-200 ease-out" /> : <Moon className="h-4 w-4 transition-transform duration-200 ease-out" />}
      </span>
    </Button>
  );
}
