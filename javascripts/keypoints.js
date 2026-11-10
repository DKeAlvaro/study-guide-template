// Key points: ==text== (<mark>) and .key blocks are highlighted always; the header button fades everything else.
(function () {
  "use strict";
  if (window.__sspKeyLoaded) return;
  window.__sspKeyLoaded = true;

  const root = document.documentElement;
  const KEY = "ssp-key-only";
  const ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 11-6 6v3h9l3-3"/><path d="m22 12-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4"/></svg>';
  // blocks whose own text sits around a mark: the text goes grey, the mark stays
  const TEXT = /^(P|LI|TD|TH|DT|DD|FIGCAPTION|BLOCKQUOTE)$/;
  // inside such a block, only these children are blocks worth walking into
  const NESTED = "ul, ol, p, div, table, figure, details";
  const KEEP = /^(H[1-6]|SCRIPT|STYLE|MARK)$/;

  const on = () => localStorage.getItem(KEY) === "1";
  const article = () => document.querySelector("article.md-content__inner");
  const hasKeys = () => { const a = article(); return !!(a && a.querySelector("mark, .key")); };

  // dim: holds no key point; part: holds one inside its own text; anything else is walked into
  function tag(parent, nestedOnly) {
    for (const el of parent.children) {
      if (nestedOnly && !el.matches(NESTED)) continue;
      if (KEEP.test(el.tagName) || el.matches(".key, .admonition-title, summary")) continue;
      if (!el.querySelector("mark, .key")) { el.classList.add("kp-dim"); continue; }
      if (TEXT.test(el.tagName)) { el.classList.add("kp-part"); tag(el, true); continue; }
      tag(el, false);
    }
  }

  function apply() {
    const any = hasKeys();
    root.classList.toggle("kp-on", any && on());
    document.querySelectorAll(".kp-btn").forEach((b) => {
      b.hidden = !any;
      b.classList.toggle("active", on());
    });
  }

  function ensureButton() {
    const inner = document.querySelector(".md-header__inner");
    if (!inner || inner.querySelector(".kp-btn")) return;
    const b = document.createElement("button");
    b.type = "button";
    b.className = "kp-btn";
    b.title = "Key points only";
    b.setAttribute("aria-label", "Key points only");
    b.innerHTML = ICON;
    b.addEventListener("click", () => {
      localStorage.setItem(KEY, on() ? "0" : "1");
      apply();
    });
    const toc = inner.querySelector(".layout-btn-toc");
    if (toc) inner.insertBefore(b, toc);
    else inner.appendChild(b);
  }

  function boot() {
    const a = article();
    if (a && !a.dataset.kpTagged) { a.dataset.kpTagged = "1"; tag(a, false); }
    ensureButton();
    apply();
  }
  boot();
  if (typeof document$ !== "undefined" && document$ && document$.subscribe) document$.subscribe(boot);
})();
