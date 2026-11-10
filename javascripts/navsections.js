// Left menu: the new exam course and the old long guide are two collapsible sections, tagged .nav-new / .nav-old.
// Where the menu is a column (desktop) the course and its blocks start open and the old guide starts closed; what
// the reader opens or closes is remembered per device. The section holding the current page always stays open.
(function () {
  const KEY = "ssp-nav-open";
  const wide = window.matchMedia("(min-width: 76.25em)");
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } };
  const save = (o) => { try { localStorage.setItem(KEY, JSON.stringify(o)); } catch (e) { /* private mode */ } };
  const nameOf = (li) => {
    const l = li.querySelector(":scope > label.md-nav__link");
    return l ? l.textContent.trim() : "";
  };

  function apply() {
    const top = document.querySelector(".md-sidebar--primary .md-nav--primary > .md-nav__list");
    if (!top) return;
    top.querySelectorAll(":scope > .md-nav__item--nested").forEach((li) => {
      const n = nameOf(li);
      li.classList.toggle("nav-new", /^New/.test(n));
      li.classList.toggle("nav-old", /^Old/.test(n));
    });
    const saved = load();
    top.querySelectorAll(".md-nav__item--nested").forEach((li) => {
      const t = li.querySelector(":scope > input.md-nav__toggle");
      if (!t) return;
      const n = nameOf(li);
      if (!t.dataset.navWired) {
        t.dataset.navWired = "1";
        t.addEventListener("change", () => { if (!wide.matches) return; const s = load(); s[n] = t.checked; save(s); });
      }
      if (!wide.matches || li.classList.contains("md-nav__item--active")) return;
      t.checked = n in saved ? !!saved[n] : !li.closest(".nav-old");
    });
  }

  if (typeof document$ !== "undefined") document$.subscribe(apply);
  // Also run immediately: document$ may have emitted before this script loaded.
  apply();
})();
