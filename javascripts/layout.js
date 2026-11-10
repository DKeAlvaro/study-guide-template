// Two header buttons show/hide the chapters index (left) and the page index (right).
(function () {
  "use strict";
  if (window.__sspLayoutLoaded) return;
  window.__sspLayoutLoaded = true;

  const root = document.documentElement;
  const KEYS = { nav: "ssp-show-nav", toc: "ssp-show-toc" };
  const ICONS = {
    nav: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 6h16M4 12h10M4 18h16"/></svg>',
    toc: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01"/></svg>',
  };
  const TITLES = { nav: "Chapters", toc: "On this page" };

  // both indexes are visible unless the reader hid them
  const on = (k) => localStorage.getItem(KEYS[k]) !== "0";

  function apply() {
    root.classList.remove("peek-nav", "peek-toc");
    root.classList.toggle("show-nav", on("nav"));
    root.classList.toggle("show-toc", on("toc"));
    document.querySelectorAll(".layout-btn").forEach((b) => b.classList.toggle("active", on(b.dataset.k)));
  }

  // ---- hover the window edge to peek at a hidden index --------------------
  // Left edge -> chapters, right edge -> on-this-page. The panel only exists
  // while the pointer is on its side of the screen; leave and it disappears.
  const PANEL = { nav: ".md-sidebar--primary", toc: ".md-sidebar--secondary" };
  const OPEN = 30; // px from the edge that opens a panel
  const NEAR = 110; // px from the edge where the edge light starts to grow
  const KEEP = 34; // extra px of room before it closes again
  const DWELL = 140; // ms the pointer must rest at the edge before a panel opens
  const WIDTH = { nav: 194, toc: 194 };
  const wide = window.matchMedia("(min-width: 60em)");

  // the page scrollbar sits on the right edge and swallows part of it
  let sbw = 0;
  function measureScrollbar() {
    sbw = Math.max(0, window.innerWidth - document.documentElement.clientWidth);
    root.style.setProperty("--ssp-sb", sbw + "px");
  }

  const peeking = (k) => root.classList.contains("peek-" + k);

  function measure(k) {
    const el = document.querySelector(PANEL[k]);
    if (el && el.offsetWidth) WIDTH[k] = el.offsetWidth;
  }

  function hidePeek(k) {
    cancelOpen(k);
    if (!peeking(k)) return;
    measure(k);
    root.classList.remove("peek-" + k);
  }

  const timers = {};
  function cancelOpen(k) {
    clearTimeout(timers[k]);
    timers[k] = 0;
  }

  // open only after the pointer rests at the edge, so sweeping past (or reaching
  // for the page scrollbar) does not make the panel pop in
  function requestPeek(k) {
    if (peeking(k) || timers[k]) return;
    timers[k] = setTimeout(() => {
      timers[k] = 0;
      showPeek(k);
    }, DWELL);
  }

  function showPeek(k) {
    if (on(k)) {
      hidePeek(k); // already pinned open by the header button
      return;
    }
    if (!peeking(k)) {
      root.classList.add("peek-" + k);
      placePeek();
    }
    measure(k);
  }

  // the panel starts under the header while the header is on screen, so the
  // header buttons stay clickable; once it scrolled away the panel takes the top
  function placePeek() {
    if (!peeking("nav") && !peeking("toc")) return;
    const header = document.querySelector(".md-header");
    const bottom = header ? header.getBoundingClientRect().bottom : 0;
    root.style.setProperty("--ssp-peek-top", (bottom > 0 ? bottom : 0) + "px");
  }

  function track(e) {
    if (!wide.matches) {
      hidePeek("nav");
      hidePeek("toc");
      return;
    }
    const x = e.clientX;
    const right = window.innerWidth - x - sbw;
    const leftLimit = peeking("nav") ? WIDTH.nav + KEEP : OPEN;
    const rightLimit = peeking("toc") ? WIDTH.toc + KEEP : OPEN;
    root.classList.toggle("near-nav", x <= NEAR);
    root.classList.toggle("near-toc", right <= NEAR);
    const onScrollbar = right < 0; // pointer is on the page scrollbar itself
    if (x <= leftLimit) (peeking("nav") ? showPeek : requestPeek)("nav");
    else hidePeek("nav");
    if (right <= rightLimit && !(onScrollbar && !peeking("toc"))) (peeking("toc") ? showPeek : requestPeek)("toc");
    else hidePeek("toc");
  }

  function trackOut() {
    hidePeek("nav");
    hidePeek("toc");
    root.classList.remove("near-nav", "near-toc");
  }

  document.addEventListener("mousemove", track, { passive: true });
  document.addEventListener("mouseleave", trackOut);
  window.addEventListener("blur", trackOut);
  window.addEventListener("scroll", placePeek, { passive: true });
  window.addEventListener("resize", measureScrollbar);

  function ensureButtons() {
    const inner = document.querySelector(".md-header__inner");
    if (!inner) return;
    if (!inner.querySelector(".layout-btn")) ["nav", "toc"].forEach((k) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "layout-btn layout-btn-" + k;
      b.dataset.k = k;
      b.title = TITLES[k];
      b.setAttribute("aria-label", TITLES[k]);
      b.innerHTML = ICONS[k];
      b.addEventListener("click", () => {
        localStorage.setItem(KEYS[k], on(k) ? "0" : "1");
        apply();
      });
      // chapters button on the far left, page-index button on the far right
      if (k === "nav") inner.insertBefore(b, inner.firstChild);
      else inner.appendChild(b);
    });

    // edge lights: the whole window edge glows when that index is hidden
    if (!document.querySelector(".edge-hint")) ["nav", "toc"].forEach((k) => {
      const t = document.createElement("div");
      t.className = "edge-hint edge-hint-" + k;
      t.setAttribute("aria-hidden", "true");
      document.body.appendChild(t);
    });

    apply();
  }

  function boot() { ensureButtons(); measureScrollbar(); apply(); }
  boot();
  if (typeof document$ !== "undefined" && document$ && document$.subscribe) document$.subscribe(boot);
})();
