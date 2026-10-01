// Turns what people type into the blocklist box into clean domains.
// Loaded by the popup before popup.js, and by the tests.

// One or more labels separated by dots, ending in a letter-based top-level domain
const DOMAIN_RE = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:[a-z]{2,63}|xn--[a-z0-9-]{1,59})$/;

// "https://www.ChatGPT.com/c/123" -> "chatgpt.com". Returns null if it isn't a domain.
function cleanSite(line) {
  let s = line.trim().toLowerCase();
  if (!s || s.includes("@")) return null; // emails and user@host addresses aren't sites
  s = s.replace(/^\*\./, ""); // subdomains are covered automatically
  const scheme = s.match(/^([a-z][a-z0-9+.-]*):\/\//);
  if (scheme && scheme[1] !== "http" && scheme[1] !== "https") return null;
  if (!scheme) s = "http://" + s;
  let host;
  try { host = new URL(s).hostname; } catch (_) { return null; } // also drops any port, path or query
  host = host.replace(/^www\./, "");
  return DOMAIN_RE.test(host) ? host : null;
}

// Clean every line: { sites: unique valid domains, invalid: lines that aren't domains }
function parseSites(text) {
  const sites = [], invalid = [];
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    const site = cleanSite(line);
    if (site) { if (!sites.includes(site)) sites.push(site); } else invalid.push(line.trim());
  }
  return { sites, invalid };
}
