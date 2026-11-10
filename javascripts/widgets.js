// Interactive figures. The course-specific widgets were removed; add yours as W.name = (root, preset) => {...}. Markup: <div class="widget" data-w="name" data-preset="..."></div>.
// Each widget draws an SVG with its own controls and plays once by itself the first time it scrolls into view.
// Also here: .stepper (worked solutions revealed one step at a time) and .tf (true/false cards from a table).
(function () {
  const NS = "http://www.w3.org/2000/svg";
  const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const W = {};
  // Example: W.hello = (root) => { H('p', { text: 'hello ' + (root.dataset.preset || '') }, root); return {}; };

  // ---------- helpers ----------
  function S(tag, a, parent) {
    const e = document.createElementNS(NS, tag);
    for (const k in a || {}) if (k === "text") e.textContent = a[k]; else e.setAttribute(k, a[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  function H(tag, a, parent) {
    const e = document.createElement(tag);
    for (const k in a || {}) {
      if (k === "html") e.innerHTML = a[k];
      else if (k === "text") e.textContent = a[k];
      else e.setAttribute(k, a[k]);
    }
    if (parent) parent.appendChild(e);
    return e;
  }
  const lin = (d0, d1, r0, r1) => (v) => r0 + ((v - d0) / (d1 - d0)) * (r1 - r0);
  const grid = (a, b, n) => Array.from({ length: n }, (_, i) => a + ((b - a) * i) / (n - 1));
  const pathOf = (pts) => "M" + pts.map((p) => p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" L");
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  function fmt(v, d) {
    const s = (+v).toFixed(d === undefined ? 2 : d);
    const t = s.includes(".") ? s.replace(/0+$/, "").replace(/\.$/, "") : s;
    return t === "-0" ? "0" : t;
  }
  function tex(el, html) {
    el.innerHTML = html;
    if (window.renderMathInElement) {
      renderMathInElement(el, { delimiters: [{ left: "$", right: "$", display: false }], throwOnError: false });
    }
  }
  function tween(ms, frame, done) {
    let alive = true;
    const t0 = performance.now();
    const ease = (u) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2);
    (function loop(t) {
      if (!alive) return;
      const u = Math.min(1, (t - t0) / ms);
      frame(ease(u));
      if (u < 1) requestAnimationFrame(loop);
      else if (done) done();
    })(t0);
    return () => { alive = false; };
  }
  function mulberry(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function erf(x) {
    const s = Math.sign(x), a = Math.abs(x), t = 1 / (1 + 0.3275911 * a);
    const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-a * a);
    return s * y;
  }
  const Phi = (z) => 0.5 * (1 + erf(z / Math.SQRT2));
  const npdf = (z) => Math.exp(-z * z / 2) / Math.sqrt(2 * Math.PI);

  function shell(root, w, h) {
    root.innerHTML = "";
    const svg = S("svg", { viewBox: "0 0 " + w + " " + h, class: "w-svg" }, H("div", { class: "w-scroll" }, root));
    const cap = H("div", { class: "w-cap" }, root);
    const bar = H("div", { class: "w-bar" }, root);
    return { svg, cap, bar };
  }
  function btn(bar, label, fn, cls) {
    const b = H("button", { type: "button", class: "w-btn" + (cls ? " " + cls : ""), text: label }, bar);
    b.addEventListener("click", fn);
    return b;
  }
  function slider(bar, label, min, max, step, val, fn, show) {
    const wrap = H("label", { class: "w-sl" }, bar);
    const name = H("span", { class: "w-sl-name" }, wrap);
    tex(name, label);
    const inp = H("input", { type: "range", min: min, max: max, step: step, value: val }, wrap);
    const out = H("span", { class: "w-sl-val", text: show ? show(val) : fmt(val) }, wrap);
    const upd = () => { const v = +inp.value; out.textContent = show ? show(v) : fmt(v); fn(v); };
    inp.addEventListener("input", upd);
    return { inp, wrap, set(v) { inp.value = v; upd(); }, get: () => +inp.value, upd };
  }
  function tabs(bar, names, fn) {
    const box = H("span", { class: "w-tabs" }, bar);
    const bs = names.map((n, i) => btn(box, n, () => pick(i)));
    function pick(i) { bs.forEach((b, j) => b.classList.toggle("on", i === j)); fn(i); }
    return pick;
  }
  // x axis with tick labels, returns the group
  function axes(g, X, Y, x0, x1, y0, ticks, opt) {
    opt = opt || {};
    S("line", { x1: X(x0), x2: X(x1), y1: Y(y0), y2: Y(y0), class: "ax" }, g);
    ticks.forEach(([v, lab]) => {
      S("line", { x1: X(v), x2: X(v), y1: Y(y0), y2: Y(y0) + 4, class: "ax" }, g);
      S("text", { x: X(v), y: Y(y0) + 17, class: "w-t s", "text-anchor": "middle", text: lab }, g);
    });
    if (opt.name) S("text", { x: X(x1), y: Y(y0) - 6, class: "w-t s", "text-anchor": "end", text: opt.name }, g);
  }
  // svg point from a pointer event (viewBox coordinates)
  function svgPoint(svg, e) {
    const p = svg.createSVGPoint();
    p.x = e.clientX; p.y = e.clientY;
    return p.matrixTransform(svg.getScreenCTM().inverse());
  }
  function drag(svg, fn) {
    let on = false;
    svg.addEventListener("pointerdown", (e) => { on = true; svg.setPointerCapture(e.pointerId); fn(svgPoint(svg, e)); });
    svg.addEventListener("pointermove", (e) => { if (on) fn(svgPoint(svg, e)); });
    ["pointerup", "pointercancel"].forEach((ev) => svg.addEventListener(ev, () => { on = false; }));
  }
  // repeat fn(u) for u in [0,1] over ms, then done; returns a stop function
  function sweep(ms, fn, done) {
    let alive = true;
    const t0 = performance.now();
    (function loop(t) {
      if (!alive) return;
      const u = Math.min(1, (t - t0) / ms);
      fn(u);
      if (u < 1) requestAnimationFrame(loop); else if (done) done();
    })(t0);
    return () => { alive = false; };
  }

  // ---------- worked solutions revealed one step at a time ----------
  function steppers() {
    document.querySelectorAll(".stepper:not([data-ready])").forEach((box) => {
      box.dataset.ready = "1";
      const groups = [[]];
      [...box.children].forEach((c) => { if (c.tagName === "HR") { groups.push([]); c.remove(); } else groups[groups.length - 1].push(c); });
      const steps = groups.filter((gr) => gr.length).map((gr) => {
        const d = H("div", { class: "step" });
        gr[0].before(d);
        gr.forEach((c) => d.appendChild(c));
        return d;
      });
      if (steps.length < 2) return;
      let shown = 1;
      const bar = H("div", { class: "w-bar step-bar" }, box);
      const next = btn(bar, "", () => show(shown + 1), "main");
      const all = btn(bar, "Show all", () => show(steps.length));
      const reset = btn(bar, "Hide again", () => show(1));
      function show(n) {
        const prev = shown;
        shown = clamp(n, 1, steps.length);
        steps.forEach((s, i) => {
          s.hidden = i >= shown;
          if (i >= prev && i < shown) { s.classList.remove("in"); void s.offsetWidth; s.classList.add("in"); }
        });
        next.textContent = shown < steps.length ? "Next step (" + (shown + 1) + " of " + steps.length + ")" : "All " + steps.length + " steps shown";
        next.disabled = shown === steps.length;
        all.hidden = shown === steps.length;
        reset.hidden = shown === 1;
      }
      show(1);
    });
  }

  // ---------- true/false cards from a 3-column table: statement | T or F | why ----------
  function tfs() {
    document.querySelectorAll(".tf:not([data-ready])").forEach((box) => {
      const table = box.querySelector("table");
      if (!table) return;
      box.dataset.ready = "1";
      const list = H("div", { class: "tf-list" });
      const score = H("div", { class: "tf-score" });
      let right = 0, done = 0;
      const rows = [...table.querySelectorAll("tbody tr")];
      rows.forEach((tr) => {
        const [q, a, why] = tr.children;
        const ans = a.textContent.trim().toUpperCase().startsWith("T");
        const card = H("div", { class: "tf-card" }, list);
        const st = H("div", { class: "tf-st" }, card);
        while (q.firstChild) st.appendChild(q.firstChild);
        const btns = H("div", { class: "tf-btns" }, card);
        const res = H("div", { class: "tf-res" }, card);
        res.hidden = true;
        H("b", { text: ans ? "TRUE. " : "FALSE. " }, res);
        while (why.firstChild) res.appendChild(why.firstChild);
        ["True", "False"].forEach((lab) => {
          btn(btns, lab, () => {
            if (!res.hidden) return;
            const ok = (lab === "True") === ans;
            card.classList.add(ok ? "ok" : "no");
            res.hidden = false;
            btns.hidden = true;
            done++; if (ok) right++;
            score.textContent = right + " / " + done + " right so far (" + rows.length + " cards)";
          });
        });
      });
      score.textContent = rows.length + " cards: decide True or False, then read why.";
      table.closest(".md-typeset__scrollwrap") ? table.closest(".md-typeset__scrollwrap").replaceWith(list) : table.replaceWith(list);
      list.before(score);
    });
  }

  // ---------- boot ----------
  const io = "IntersectionObserver" in window ? new IntersectionObserver((es) => es.forEach((e) => {
    if (!e.isIntersecting || e.intersectionRatio < 0.35) return;
    const r = e.target;
    io.unobserve(r);
    if (!still && r._w && r._w.play) r._w.play();
  }), { threshold: [0, 0.35] }) : null;

  function boot() {
    document.querySelectorAll(".widget[data-w]:not([data-ready])").forEach((root) => {
      const make = W[root.dataset.w];
      if (!make) return;
      root.dataset.ready = "1";
      try { root._w = make(root, root.dataset.preset) || {}; } catch (err) { console.error(err); root.textContent = "(figure failed to load)"; return; }
      // any touch of the controls takes over from the automatic play
      ["pointerdown", "keydown"].forEach((ev) => root.addEventListener(ev, () => { if (root._w.stop) root._w.stop(); }, true));
      if (io) io.observe(root);
    });
    steppers();
    tfs();
  }
  if (typeof document$ !== "undefined") document$.subscribe(boot);
  // Also run immediately: document$ may have emitted before this script loaded.
  boot();
})();
