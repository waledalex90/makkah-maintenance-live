"use client";

import { Sun } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ThemeToggle() {
  return (
    <Button
      type="button"
      variant="outline"
      className="h-10 min-w-10 border-slate-200 bg-white text-slate-900 hover:bg-slate-100"
      disabled
      aria-label="الوضع المضيء"
      title="الوضع المضيء"
    >
      <span className="inline-flex h-4 w-4 items-center justify-center">
        <Sun className="h-4 w-4 text-amber-500 transition-transform duration-200 ease-out" />
      </span>
    </Button>
  );
}
