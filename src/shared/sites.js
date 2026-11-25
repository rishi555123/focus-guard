// Turns what people type into the blocklist box into clean domains, and the optional
// group of AI app builders. Loaded by the popup before popup.js, by the background
// script (importScripts), and by the tests.

// Blocked on top of your own list when "Also block AI app builders" is on (off by default).
// Kept out of the saved list, so turning the group off never touches your own sites.
const APP_BUILDER_SITES = ["v0.app", "bolt.new", "lovable.dev"];

// Your list plus the app builders when that group is on, without duplicates
const withAppBuilders = (sites, on) => [...new Set([...sites, ...(on ? APP_BUILDER_SITES : [])])];

// A blocklist entry is a site, or one part of a site:
//   "chatgpt.com"               the whole site and its subdomains
//   "github.com/copilot"        just /copilot and the pages under it (not /copilotx)
//   "google.com/search?udm=50"  just /search, and only with udm=50 in the address
// Entries without a path or query, which is every entry saved before 1.1, work as before.

// One or more labels separated by dots, ending in a letter-based top-level domain
const DOMAIN_RE = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:[a-z]{2,63}|xn--[a-z0-9-]{1,59})$/;
// A path as the browser writes it: letters, digits and - . _ ~ % / only
const PATH_RE = /^(\/[a-z0-9\-._~%]+)+$/;
// The one query part an entry can require
const PARAM_RE = /^[a-z0-9\-._]+$/i;

// "google.com/search?udm=50" -> { host: "google.com", path: "/search", param: ["udm", "50"] }
function parseEntry(entry) {
  const [rest, query] = entry.split("?");
  const slash = rest.indexOf("/");
  return {
    host: slash < 0 ? rest : rest.slice(0, slash),
    path: slash < 0 ? "" : rest.slice(slash),
    param: query ? query.split("=") : null
  };
}

const onHost = (host, site) => host === site || host.endsWith("." + site);

// Whether an address is on a blocklist entry
function entryMatches(url, entry) {
  let u;
  try { u = new URL(url); } catch (_) { return false; } // missing or unparseable address
  const { host, path, param } = parseEntry(entry);
  if (!onHost(u.hostname, host)) return false;
  const p = u.pathname.toLowerCase();
  if (path && p !== path && !p.startsWith(path + "/")) return false;
  return !param || u.searchParams.getAll(param[0]).includes(param[1]);
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// The same test as a regular expression for the browser's blocking rules. It matches the
// whole address, so the block page gets all of it. (The rules' regex engine has no
// lookahead, which is why an entry can require only one query part.)
function entryRegex(entry) {
  const { host, path, param } = parseEntry(entry);
  let re = "^https?://([^/]*\\.)?" + escapeRe(host);
  if (!path && !param) return re + "(/.*)?$"; // the same rule as before 1.1 for whole sites
  re += escapeRe(path);
  if (!param) return re + "([/?#].*)?$";
  return re + "(/[^?#]*)?\\?([^#]*&)?" + escapeRe(param[0]) + "=" + escapeRe(param[1]) + "(&[^#]*)?(#.*)?$";
}

// Whether `broad` already blocks everything `narrow` does, like "github.com" and "github.com/copilot"
function entryCovers(broad, narrow) {
  if (broad === narrow) return false;
  const b = parseEntry(broad), n = parseEntry(narrow);
  if (!onHost(n.host, b.host)) return false;
  if (b.path && n.path !== b.path && !n.path.startsWith(b.path + "/")) return false;
  return !b.param || (!!n.param && n.param[0] === b.param[0] && n.param[1] === b.param[1]);
}

// "https://www.ChatGPT.com/c/123" -> "chatgpt.com/c/123", "google.com/search?udm=50" stays.
// Returns null if it isn't a site or a page of one.
function cleanSite(line) {
  let s = line.trim();
  if (!s || s.includes("@")) return null; // emails and user@host addresses aren't sites
  s = s.replace(/^\*\./, ""); // subdomains are covered automatically
  const scheme = s.match(/^([a-z][a-z0-9+.-]*):\/\//i);
  if (scheme && !/^https?$/i.test(scheme[1])) return null;
  if (!scheme) s = "http://" + s;
  let url;
  try { url = new URL(s); } catch (_) { return null; }
  const host = url.hostname.replace(/^www\./, ""); // already lower case; any port is dropped
  if (!DOMAIN_RE.test(host)) return null;
  const path = url.pathname.toLowerCase().replace(/\/+$/, ""); // "/" and trailing slashes mean the whole page
  if (path && !PATH_RE.test(path)) return null;
  const params = [...url.searchParams]; // the #fragment is dropped
  if (!path) return host; // a query on the whole site would make it narrower than meant
  if (params.length === 0) return host + path;
  if (params.length > 1) return null; // one query part at most (see entryRegex)
  const [[key, value]] = params;
  return PARAM_RE.test(key) && PARAM_RE.test(value) ? `${host}${path}?${key}=${value}` : null;
}

// Clean every line: { sites, invalid, covered }. `sites` are the unique valid entries,
// leaving out any that another entry already covers; `covered` lists those as
// [entry, covered by]; `invalid` lists lines that aren't sites.
function parseSites(text) {
  const found = [], invalid = [];
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    const site = cleanSite(line);
    if (site) { if (!found.includes(site)) found.push(site); } else invalid.push(line.trim());
  }
  const covered = [];
  const sites = found.filter((site) => {
    const by = found.find((other) => entryCovers(other, site));
    if (by) covered.push([site, by]);
    return !by;
  });
  return { sites, invalid, covered };
}
