// Reads the block page's own address. Loaded by blocked.html before blocked.js, and by the tests.
//
// The block page is opened two ways:
//   ?u=<address>                 by a redirect rule. Chrome pastes the address in as-is,
//                                so it must not be decoded (that would turn %26 into &).
//   ?t=<encoded address>         by Focus Guard moving a tab. Starts with sweep=1 when it's
//                                re-blocking tabs that were already open, which isn't a new visit.
function readBlockLink(search) {
  if (search.startsWith("?u=")) {
    let url = search.slice(3);
    // Links made before ?t= existed were encoded
    if (!/^https?:/.test(url)) try { url = decodeURIComponent(url); } catch (_) {}
    return { url, fromTab: false, sweep: false };
  }
  const params = new URLSearchParams(search);
  return { url: params.get("t") || "", fromTab: params.has("t"), sweep: params.get("sweep") === "1" };
}

// How many pages to go back to get past the blocked site. A redirect replaces the AI page
// in history (1 step); moving a tab adds the block page after it (2 steps).
// 0 means there's nothing to go back to.
function backSteps(link, historyLength) {
  const steps = link.fromTab ? 2 : 1;
  return historyLength > steps ? steps : 0;
}
