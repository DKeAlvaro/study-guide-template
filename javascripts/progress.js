// Generic progress tracker for mkdocs-material: per-page "done" toggle, sidebar ticks, export/import.
// Nothing here is site-specific: pages come from the nav, storage is keyed by the site's base path.
(function () {
  const scope = (typeof __md_scope !== "undefined" ? __md_scope.pathname : "/");
  const KEY = "progress:" + scope;
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } };
  const save = (p) => localStorage.setItem(KEY, JSON.stringify(p));
  const pageId = (url) => {
    const p = new URL(url, location.href).pathname;
    return (p.startsWith(scope) ? p.slice(scope.length) : p) || "index.html";
  };
  const navLinks = () => [...document.querySelectorAll(".md-nav--primary a.md-nav__link[href]")]
    .filter((a) => !a.getAttribute("href").startsWith("#") && pageId(a.href) !== "index.html");

  function refresh() {
    const done = load();
    const links = navLinks();
    links.forEach((a) => a.classList.toggle("done", !!done[pageId(a.href)]));
    const ids = new Set(links.map((a) => pageId(a.href)));
    const n = [...ids].filter((i) => done[i]).length;
    const label = document.getElementById("progress-count");
    if (label) label.textContent = n + " / " + ids.size + " done";
    const btn = document.getElementById("progress-toggle");
    if (btn) {
      const d = !!done[pageId(location.href)];
      btn.classList.toggle("on", d);
      btn.textContent = d ? "✓ Done" : "Mark as done";
    }
  }

  function exportCode() {
    const code = btoa(JSON.stringify(load()));
    (navigator.clipboard ? navigator.clipboard.writeText(code) : Promise.reject())
      .then(() => alert("Progress code copied to clipboard."))
      .catch(() => prompt("Copy this progress code:", code));
  }

  function importCode() {
    const code = prompt("Paste a progress code:");
    if (!code) return;
    try {
      const data = JSON.parse(atob(code.trim()));
      if (!data || typeof data !== "object") throw 0;
      save(Object.assign(load(), data));
      refresh();
    } catch (e) { alert("Invalid progress code."); }
  }

  function mount() {
    const article = document.querySelector("article.md-content__inner");
    if (!article || document.getElementById("progress-bar") || pageId(location.href) === "index.html") return;
    const bar = document.createElement("div");
    bar.id = "progress-bar";
    bar.innerHTML = '<button id="progress-toggle" type="button"></button>' +
      '<span id="progress-count"></span>' +
      '<button type="button" class="link" data-act="export">export</button>' +
      '<button type="button" class="link" data-act="import">import</button>';
    article.appendChild(bar);
    bar.addEventListener("click", (e) => {
      const t = e.target;
      if (t.id === "progress-toggle") {
        const p = load(), id = pageId(location.href);
        if (p[id]) delete p[id]; else p[id] = 1;
        save(p); refresh();
      } else if (t.dataset.act === "export") exportCode();
      else if (t.dataset.act === "import") importCode();
    });
  }

  document$.subscribe(() => { mount(); refresh(); });
})();
