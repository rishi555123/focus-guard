// Light/dark theme toggle. A one-line script in each page's <head> applies the saved
// theme before the page draws, so there's no flash; this file wires up the button.
// Light is the default. The choice is saved in localStorage as "fg-theme".
(function () {
  var KEY = "fg-theme";
  var root = document.documentElement;
  var button = document.getElementById("theme-toggle");

  function current() { return root.getAttribute("data-theme") === "dark" ? "dark" : "light"; }

  function apply(theme) {
    if (theme === "dark") root.setAttribute("data-theme", "dark");
    else root.removeAttribute("data-theme");
    if (!button) return;
    // The label says what pressing the button will do
    var label = theme === "dark" ? "Switch to light mode" : "Switch to dark mode";
    button.setAttribute("aria-label", label);
    button.title = label;
  }

  if (button) {
    button.addEventListener("click", function () {
      var next = current() === "dark" ? "light" : "dark";
      apply(next);
      try { localStorage.setItem(KEY, next); } catch (e) { /* storage blocked: the choice lasts until the page closes */ }
    });
    button.hidden = false; // hidden in the HTML, so it never shows without JavaScript
  }

  // Keep other open tabs of the site in step
  window.addEventListener("storage", function (e) {
    if (e.key === KEY) apply(e.newValue === "dark" ? "dark" : "light");
  });

  apply(current());
})();
