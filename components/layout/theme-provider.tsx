"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";

import { TooltipProvider } from "@/components/ui/tooltip";
import { ToastProvider } from "@/components/ui/toast";

/**
 * Client providers.
 *
 * `defaultTheme="dark"` because Sentinel is a dark-first investigative tool;
 * `enableSystem` still lets a viewer follow their OS preference.
 */
export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem
      disableTransitionOnChange
      storageKey="sentinel-theme"
    >
      <TooltipProvider delayDuration={200} skipDelayDuration={400}>
        <ToastProvider>{children}</ToastProvider>
      </TooltipProvider>
    </NextThemesProvider>
  );
}
