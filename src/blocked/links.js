// Reads the block page's own address. Loaded by blocked.html before blocked.js, and by the tests.
//
// The block page is opened two ways:
//   ?u=<address>                 by a redirect rule. Chrome pastes the address in as-is,
//                                so it must not be decoded (that would turn %26 into &).
//   ?t=<encoded address>         by Focus Guard moving a tab. Has sweep=1 when it's re-blocking
//                                tabs that were already open, which isn't a new visit, and
//                                why=moved&to=<site> or why=ended when a pass is the reason.
function readBlockLink(search) {
  if (search.startsWith("?u=")) {
    let url = search.slice(3);
    // Links made before ?t= existed were encoded
    if (!/^https?:/.test(url)) try { url = decodeURIComponent(url); } catch (_) {}
    return { url, fromTab: false, sweep: false, why: "", to: "" };
  }
  const params = new URLSearchParams(search);
  return {
    url: params.get("t") || "",
    fromTab: params.has("t"),
    sweep: params.get("sweep") === "1",
    why: params.get("why") || "",
    to: params.get("to") || ""
  };
}

// Why this tab was re-blocked, if a pass is the reason. Empty for normal blocks.
function sweepNote(link) {
  if (link.why === "moved" && link.to) {
    return `Your pass moved to ${link.to}, so this site is blocked again. You can only have one pass at a time.`;
  }
  if (link.why === "ended") return "Your 5-minute pass for this site has ended.";
  return "";
}

// If a pass for a different site is active, unlocking this one would end it.
// Returns that site, or "" if there's no such pass.
function otherPass(pass, url, now) {
  if (!pass || !(pass.until > now)) return "";
  let host = "";
  try { host = new URL(url).hostname; } catch (_) {}
  const covered = (pass.domains || [pass.domain]).some((d) => host === d || host.endsWith("." + d));
  return covered ? "" : pass.domain;
}

// How many pages to go back to get past the blocked site. A redirect replaces the AI page
// in history (1 step); moving a tab adds the block page after it (2 steps).
// 0 means there's nothing to go back to.
function backSteps(link, historyLength) {
  const steps = link.fromTab ? 2 : 1;
  return historyLength > steps ? steps : 0;
}
