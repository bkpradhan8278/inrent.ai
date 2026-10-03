import { randomBase62 } from "@inrent/core";

export function slugify(input: string, maxLength = 40): string {
  const s = input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, maxLength);
  return s || "workspace";
}

export function uniqueSlug(input: string): string {
  return `${slugify(input, 32)}-${randomBase62(6).toLowerCase()}`;
}
