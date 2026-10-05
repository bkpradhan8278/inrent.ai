"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useSyncExternalStore } from "react";
import { Toaster } from "sonner";
import { DropdownMenu, DropdownMenuContent, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cookieDomain } from "@/lib/hosts";
import { DEFAULT_THEME, readThemePreference, resolveTheme, THEME_COLOR, THEME_COOKIE, themeCookie, type ResolvedTheme, type ThemePreference } from "@/lib/theme";
import { cn } from "@/lib/utils";

const CHANGE_EVENT = "inrent-theme-change";
const LIGHT_QUERY = "(prefers-color-scheme: light)";

function applyTheme(pref: ThemePreference) {
  const theme = resolveTheme(pref, window.matchMedia(LIGHT_QUERY).matches);
  document.documentElement.setAttribute("data-theme", theme);
  let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement("meta");
    meta.name = "theme-color";
    document.head.appendChild(meta);
  }
  meta.content = THEME_COLOR[theme];
}

export function setThemePreference(pref: ThemePreference) {
  // A host-only cookie from before subdomain routing would shadow the shared one; drop it.
  if (cookieDomain) document.cookie = `${THEME_COOKIE}=; Path=/; Max-Age=0`;
  document.cookie = themeCookie(pref, cookieDomain);
  applyTheme(pref);
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

function subscribe(onChange: () => void) {
  const media = window.matchMedia(LIGHT_QUERY);
  // Re-apply when the OS scheme flips (only matters for "system"), and when the tab regains focus
  // in case another tab or subdomain changed the shared cookie.
  const resync = () => {
    applyTheme(readThemePreference(document.cookie));
    onChange();
  };
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("focus", resync);
  media.addEventListener("change", resync);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("focus", resync);
    media.removeEventListener("change", resync);
  };
}

export function useThemePreference(): ThemePreference {
  return useSyncExternalStore(subscribe, () => readThemePreference(document.cookie), () => DEFAULT_THEME);
}

export function useResolvedTheme(): ResolvedTheme {
  return useSyncExternalStore(
    subscribe,
    () => (document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark"),
    () => "dark",
  );
}

const OPTIONS = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
] as const;

/** Sun/moon button with a Light · Dark · System menu. */
export function ThemeToggle({ className }: { className?: string }) {
  const pref = useThemePreference();
  const resolved = useResolvedTheme();
  const Icon = resolved === "light" ? Sun : Moon;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn("inline-flex size-8 shrink-0 items-center justify-center rounded-md text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg data-[state=open]:bg-surface-2 data-[state=open]:text-fg", className)}
        aria-label={`Theme: ${pref}. Change theme`}
      >
        <Icon className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-40">
        <DropdownMenuLabel>Theme</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={pref} onValueChange={(v) => setThemePreference(v as ThemePreference)}>
          {OPTIONS.map((o) => (
            <DropdownMenuRadioItem key={o.value} value={o.value}>
              <o.icon /> {o.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Inline Light · Dark · System switch for menus that are already open (mobile nav, account menu). */
export function ThemeSegmented({ className }: { className?: string }) {
  const pref = useThemePreference();
  return (
    <div role="radiogroup" aria-label="Theme" className={cn("inline-flex rounded-lg border border-border bg-surface p-0.5", className)}>
      {OPTIONS.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={pref === o.value}
          onClick={() => setThemePreference(o.value)}
          className={cn("inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[12.5px] transition-colors", pref === o.value ? "bg-surface-3 text-fg" : "text-fg-subtle hover:text-fg-muted")}
        >
          <o.icon className="size-3.5" /> {o.label}
        </button>
      ))}
    </div>
  );
}

export function ThemedToaster() {
  const resolved = useResolvedTheme();
  return <Toaster theme={resolved} position="bottom-right" toastOptions={{ classNames: { toast: "!bg-surface-2 !border-border-strong !text-fg" } }} />;
}
