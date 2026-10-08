/**
 * Regenerates the raster brand assets (favicon, app icons, email logo, OAuth logos) from the INRENT
 * mark in apps/web/components/brand/logo.tsx. Re-run after changing the mark:
 *
 *   node scripts/generate-brand-assets.mjs
 *
 * sharp is not a direct dependency: it is resolved through Next (which ships it for image
 * optimization), so no extra package is installed for an occasional script.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const web = join(root, "apps", "web");
const fromWeb = createRequire(join(web, "package.json"));
const sharp = createRequire(fromWeb.resolve("next/package.json"))("sharp");

const GRADIENT = `<linearGradient id="g" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#7ff5d3"/><stop offset=".55" stop-color="#5cebc0"/><stop offset="1" stop-color="#8e96ff"/></linearGradient>`;
const TILE = `<rect x="1" y="1" width="30" height="30" rx="8" fill="url(#g)"/><rect x="1.5" y="1.5" width="29" height="29" rx="7.5" fill="none" stroke="#ffffff" stroke-opacity=".35"/>`;
const GLYPH = `<g fill="none" stroke="#03140e" stroke-width="2.1" stroke-linecap="round"><path d="M10.5 16C15 16 15.5 9.5 21 9.5"/><path d="M10.5 16H21"/><path d="M10.5 16C15 16 15.5 22.5 21 22.5"/></g><circle cx="9.5" cy="16" r="3" fill="#03140e"/><circle cx="22.5" cy="9.5" r="2" fill="#03140e"/><circle cx="22.5" cy="16" r="2" fill="#03140e"/><circle cx="22.5" cy="22.5" r="2" fill="#03140e"/>`;

const svg = (body, size) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"${size ? ` width="${size}" height="${size}"` : ""}><defs>${GRADIENT}</defs>${body}</svg>`;

/** The mark exactly as LogoMark draws it: rounded tile on a transparent square. */
const mark = (size) => svg(TILE + GLYPH, size);

/** iOS home screen: opaque, the tile inset ~12% on the site background (iOS applies its own mask). */
const apple = (size) => {
  const pad = 32 * 0.12;
  const k = (32 - 2 * pad) / 30;
  return svg(`<rect width="32" height="32" fill="#06070a"/><g transform="translate(${pad} ${pad}) scale(${k}) translate(-1 -1)">${TILE + GLYPH}</g>`, size);
};

/**
 * Android maskable: the gradient fills the whole square and the glyph sits well inside the
 * central safe zone (a circle of radius 40%). At 0.9x its farthest point is ~10.1/32 from centre,
 * under the 12.8/32 limit, so circle, squircle and teardrop masks all keep it whole.
 */
const maskable = (size) => svg(`<rect width="32" height="32" fill="url(#g)"/><g transform="translate(16 16) scale(.9) translate(-16 -16)">${GLYPH}</g>`, size);

const png = (source, size, { opaque = false } = {}) => {
  const image = sharp(Buffer.from(source(size)));
  // iOS renders transparent pixels black: the home-screen icon ships with no alpha channel at all.
  return (opaque ? image.flatten({ background: "#06070a" }) : image).png({ compressionLevel: 9 }).toBuffer();
};

/** ICO with PNG-compressed entries (valid since Windows Vista; every current browser reads them). */
function ico(images) {
  const header = Buffer.alloc(6 + 16 * images.length);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  let offset = header.length;
  images.forEach(({ size, data }, i) => {
    const at = 6 + 16 * i;
    header.writeUInt8(size >= 256 ? 0 : size, at);
    header.writeUInt8(size >= 256 ? 0 : size, at + 1);
    header.writeUInt8(0, at + 2); // palette colours
    header.writeUInt8(0, at + 3); // reserved
    header.writeUInt16LE(1, at + 4); // colour planes
    header.writeUInt16LE(32, at + 6); // bits per pixel
    header.writeUInt32LE(data.length, at + 8);
    header.writeUInt32LE(offset, at + 12);
    offset += data.length;
  });
  return Buffer.concat([header, ...images.map((i) => i.data)]);
}

const app = join(web, "app");
const brand = join(web, "public", "brand");
mkdirSync(brand, { recursive: true });

const write = (path, data) => {
  writeFileSync(path, data);
  console.log(`wrote ${path.slice(root.length + 1).replace(/\\/g, "/")} (${data.length} bytes)`);
};

const favicon = await Promise.all([16, 32, 48].map(async (size) => ({ size, data: await png(mark, size) })));
write(join(app, "favicon.ico"), ico(favicon));
write(join(app, "apple-icon.png"), await png(apple, 180, { opaque: true }));
write(join(brand, "icon-192.png"), await png(mark, 192));
write(join(brand, "icon-512.png"), await png(mark, 512));
write(join(brand, "icon-maskable-512.png"), await png(maskable, 512));
write(join(brand, "email-logo.png"), await png(mark, 96));
write(join(brand, "logo-120.png"), await png(mark, 120));
write(join(brand, "logo-512.png"), await png(mark, 512));
write(join(brand, "logo.svg"), Buffer.from(`${mark()}\n`));
