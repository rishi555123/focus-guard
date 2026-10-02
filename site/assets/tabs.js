// Install guide tabs (Chrome / Edge). Without JavaScript, both guides simply show one after the other.
(function () {
  document.documentElement.classList.remove("no-js");
  const tablist = document.querySelector('[role="tablist"]');
  if (!tablist) return;
  const tabs = Array.from(tablist.querySelectorAll('[role="tab"]'));
  const panels = tabs.map((tab) => document.getElementById(tab.getAttribute("aria-controls")));

  function select(tab, focus) {
    tabs.forEach((t, i) => {
      const on = t === tab;
      t.setAttribute("aria-selected", String(on));
      t.tabIndex = on ? 0 : -1;
      panels[i].hidden = !on;
    });
    if (focus) tab.focus();
  }

  tabs.forEach((tab, i) => {
    tab.addEventListener("click", () => {
      select(tab, false);
      history.replaceState(null, "", "#" + tab.dataset.browser);
    });
    tab.addEventListener("keydown", (e) => {
      const next = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 }[e.key];
      if (next === undefined) return;
      e.preventDefault();
      select(tabs[(next + tabs.length) % tabs.length], true);
    });
  });

  // Start on the tab in the address (#chrome or #edge), or the visitor's browser.
  // Edge is detected the way Microsoft recommends: the "Microsoft Edge" brand in
  // User-Agent Client Hints, with the "Edg/" token as a fallback.
  const brands = (navigator.userAgentData && navigator.userAgentData.brands) || [];
  const isEdge = brands.length ? brands.some((b) => b.brand === "Microsoft Edge") : /\bEdg\//.test(navigator.userAgent);
  const fromHash = tabs.find((t) => "#" + t.dataset.browser === location.hash);
  select(fromHash || tabs.find((t) => t.dataset.browser === (isEdge ? "edge" : "chrome")) || tabs[0], false);
})();
