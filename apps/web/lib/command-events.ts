/** Opens the global command palette from anywhere (no dependency on the palette bundle). */
export const COMMAND_EVENT = "inrent:command";

export function openCommandPalette(mode: "all" | "docs" = "all") {
  window.dispatchEvent(new CustomEvent(COMMAND_EVENT, { detail: mode }));
}
