/**
 * DNS workaround: Resolves a hostname using Google's public DNS
 * and returns the IP address. Used to work around local DNS servers
 * that refuse queries for certain domains.
 */
import dns from 'dns';

dns.setServers(['8.8.8.8', '8.8.4.4']);

/**
 * Resolves a hostname to an IPv4 address using Google's DNS.
 * Falls back to the OS resolver if Google DNS fails.
 */
export async function resolveHost(hostname: string): Promise<string | null> {
  return new Promise((resolve) => {
    dns.resolve4(hostname, (err, addresses) => {
      if (!err && addresses.length > 0) {
        resolve(addresses[0]);
      } else {
        resolve(null);
      }
    });
  });
}

/**
 * Parses a connection string and returns the hostname.
 */
export function extractHostname(connectionString: string): string | null {
  try {
    const match = connectionString.match(/@([^:\/?]+)/);
    if (match) return match[1];
    const urlMatch = connectionString.match(/:\/\/([^:\/?]+)/);
    if (urlMatch) return urlMatch[1];
  } catch {}
  return null;
}
