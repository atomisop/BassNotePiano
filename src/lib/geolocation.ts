export interface GeoLocation {
  ip: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
}

const PRIVATE_IPS = new Set(["127.0.0.1", "::1"]);

/**
 * Best-effort IP → city/region/country lookup via ip-api.com's free,
 * keyless endpoint. Never throws — a failed or slow lookup degrades to
 * "unknown location" rather than blocking login, since this only feeds an
 * informational security alert, not an access decision.
 */
export async function lookupIpLocation(ip: string | null): Promise<GeoLocation> {
  if (!ip || PRIVATE_IPS.has(ip)) {
    return { ip, city: null, region: null, country: null };
  }

  try {
    const res = await fetch(`http://ip-api.com/json/${ip}?fields=status,city,regionName,country`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return { ip, city: null, region: null, country: null };

    const data = await res.json();
    if (data.status !== "success") return { ip, city: null, region: null, country: null };

    return { ip, city: data.city ?? null, region: data.regionName ?? null, country: data.country ?? null };
  } catch {
    return { ip, city: null, region: null, country: null };
  }
}
