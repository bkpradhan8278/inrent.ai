import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/**
 * SSRF protection for every user-supplied outbound URL (webhooks, MCP servers, custom
 * provider endpoints). We validate the URL shape, then resolve DNS and reject any private,
 * loopback, link-local, metadata or otherwise non-public address.
 *
 * Note: callers should also pin the resolved address when connecting (or re-validate right
 * before the request) to reduce DNS-rebinding windows.
 */

export class UnsafeUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsafeUrlError";
  }
}

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "localhost.localdomain",
  "metadata.google.internal",
  "metadata",
  "instance-data",
]);

const ALLOWED_PORTS = new Set(["", "443", "80", "8443", "8080"]);

function ipv4ToInt(ip: string): number {
  return ip.split(".").reduce((acc, octet) => (acc << 8) + Number(octet), 0) >>> 0;
}

const PRIVATE_V4: Array<[string, number]> = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
];

function isPrivateIPv4(ip: string): boolean {
  const n = ipv4ToInt(ip);
  return PRIVATE_V4.some(([base, bits]) => {
    const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
    return (n & mask) === (ipv4ToInt(base) & mask);
  });
}

function expandIPv6(ip: string): number[] | null {
  let addr = ip.toLowerCase();
  const zone = addr.indexOf("%");
  if (zone >= 0) addr = addr.slice(0, zone);
  // Embedded IPv4 (e.g. ::ffff:127.0.0.1)
  const v4Match = /(\d+\.\d+\.\d+\.\d+)$/.exec(addr);
  let tail: number[] = [];
  if (v4Match?.[1]) {
    const n = ipv4ToInt(v4Match[1]);
    tail = [(n >>> 16) & 0xffff, n & 0xffff];
    addr = addr.slice(0, addr.length - v4Match[1].length) + "0:0";
  }
  const [head = "", rest] = addr.split("::");
  const headParts = head ? head.split(":") : [];
  const restParts = rest !== undefined && rest !== "" ? rest.split(":") : [];
  const missing = 8 - headParts.length - restParts.length;
  if (rest === undefined && headParts.length !== 8) return null;
  const parts = [...headParts, ...Array(rest !== undefined ? missing : 0).fill("0"), ...restParts].map((p) =>
    parseInt(p || "0", 16),
  );
  if (parts.length !== 8 || parts.some((p) => Number.isNaN(p))) return null;
  if (tail.length) {
    parts[6] = tail[0]!;
    parts[7] = tail[1]!;
  }
  return parts;
}

function isPrivateIPv6(ip: string): boolean {
  const p = expandIPv6(ip);
  if (!p) return true; // unparseable → treat as unsafe
  const [a = 0, b = 0, c = 0, d = 0, e = 0, f = 0, g = 0, h = 0] = p;
  if (p.every((x) => x === 0)) return true; // ::
  if (a === 0 && b === 0 && c === 0 && d === 0 && e === 0 && f === 0 && g === 0 && h === 1) return true; // ::1
  if ((a & 0xfe00) === 0xfc00) return true; // fc00::/7 unique local
  if ((a & 0xffc0) === 0xfe80) return true; // fe80::/10 link local
  if ((a & 0xff00) === 0xff00) return true; // multicast
  if (a === 0x2001 && b === 0x0db8) return true; // documentation
  // IPv4-mapped / translated: ::ffff:a.b.c.d and 64:ff9b::/96
  if (a === 0 && b === 0 && c === 0 && d === 0 && e === 0 && (f === 0xffff || f === 0)) {
    const v4 = `${g >> 8}.${g & 0xff}.${h >> 8}.${h & 0xff}`;
    return isPrivateIPv4(v4);
  }
  if (a === 0x64 && b === 0xff9b) {
    const v4 = `${g >> 8}.${g & 0xff}.${h >> 8}.${h & 0xff}`;
    return isPrivateIPv4(v4);
  }
  return false;
}

export function isPrivateAddress(ip: string): boolean {
  const family = isIP(ip);
  if (family === 4) return isPrivateIPv4(ip);
  if (family === 6) return isPrivateIPv6(ip);
  return true;
}

export interface OutboundUrlOptions {
  /** Allow plain http:// (development only). */
  allowHttp?: boolean;
  /** Skip private-address checks (development only, e.g. local webhook receivers). */
  allowPrivateNetwork?: boolean;
  resolver?: (hostname: string) => Promise<string[]>;
}

const defaultResolver = async (hostname: string): Promise<string[]> => {
  const results = await lookup(hostname, { all: true, verbatim: true });
  return results.map((r) => r.address);
};

/** Validates syntax only (no DNS). Throws UnsafeUrlError. */
export function parseOutboundUrl(raw: string, opts: OutboundUrlOptions = {}): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new UnsafeUrlError("URL is not valid");
  }
  if (url.protocol !== "https:" && !(opts.allowHttp && url.protocol === "http:")) {
    throw new UnsafeUrlError("URL must use https");
  }
  if (url.username || url.password) throw new UnsafeUrlError("URL must not contain credentials");
  if (!opts.allowPrivateNetwork && !ALLOWED_PORTS.has(url.port)) throw new UnsafeUrlError(`Port ${url.port} is not allowed`);
  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (!opts.allowPrivateNetwork) {
    if (BLOCKED_HOSTNAMES.has(host) || host.endsWith(".localhost") || host.endsWith(".internal") || host.endsWith(".local")) {
      throw new UnsafeUrlError("URL points to a private host");
    }
    if (isIP(host) && isPrivateAddress(host)) throw new UnsafeUrlError("URL points to a private address");
    if (!isIP(host) && !host.includes(".")) throw new UnsafeUrlError("URL host must be a public domain");
  }
  return url;
}

/** Full validation including DNS resolution. Returns the resolved public addresses. */
export async function assertPublicUrl(raw: string, opts: OutboundUrlOptions = {}): Promise<{ url: URL; addresses: string[] }> {
  const url = parseOutboundUrl(raw, opts);
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (opts.allowPrivateNetwork) return { url, addresses: [] };
  const addresses = isIP(host) ? [host] : await (opts.resolver ?? defaultResolver)(host).catch(() => {
    throw new UnsafeUrlError("URL host could not be resolved");
  });
  if (addresses.length === 0) throw new UnsafeUrlError("URL host could not be resolved");
  for (const address of addresses) {
    if (isPrivateAddress(address)) throw new UnsafeUrlError("URL resolves to a private address");
  }
  return { url, addresses };
}
