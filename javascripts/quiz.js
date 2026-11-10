// Quiz mode (always on): every solution starts hidden so you can try the question first.
(function () {
  function apply() {
    document.querySelectorAll("details.solution").forEach((d) => { d.open = false; });
  }
  document$.subscribe(apply);
  // Also run immediately: document$ may have emitted before this script loaded.
  apply();
})();
