document$.subscribe(({ body }) => {
  renderMathInElement(body, {
    delimiters: [
      { left: "$$", right: "$$", display: true },
      { left: "$", right: "$", display: false },
      { left: "\\(", right: "\\)", display: false },
      { left: "\\[", right: "\\]", display: true }
    ],
    ignoredClasses: ["md-search", "md-header"],
    throwOnError: false
  })
})

// A selection boundary inside a formula is widened to the whole formula, so a formula is never cut in half.
window.sspWholeFormulas = (range) => {
  const r = range.cloneRange();
  const up = (n) => { const e = n && (n.nodeType === 1 ? n : n.parentNode); return e && e.closest ? e.closest(".katex") : null; };
  const a = up(r.startContainer), b = up(r.endContainer);
  if (a) r.setStartBefore(a);
  if (b) r.setEndAfter(b);
  return r;
};

// Copying a selection that includes formulas puts their LaTeX source on the clipboard.
document.addEventListener("copy", (e) => {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || !sel.rangeCount) return;
  const frag = window.sspWholeFormulas(sel.getRangeAt(0)).cloneContents();
  if (!frag.querySelector(".katex")) return;
  frag.querySelectorAll(".katex").forEach((k) => {
    const tex = k.querySelector('annotation[encoding="application/x-tex"]');
    const display = k.parentElement && k.parentElement.classList.contains("katex-display");
    const src = tex ? tex.textContent : "";
    k.replaceWith(document.createTextNode(display ? "$$" + src + "$$" : "$" + src + "$"));
  });
  const box = document.createElement("div");
  box.appendChild(frag);
  e.clipboardData.setData("text/plain", box.textContent);
  e.preventDefault();
});

// Definition tooltips (abbr) are plain text built by the theme at hover time: typeset the math inside them.
new MutationObserver(() => {
  document.querySelectorAll(".md-tooltip2__inner").forEach((el) => {
    if (!el.textContent.includes("$")) return;
    renderMathInElement(el, {
      delimiters: [{ left: "$$", right: "$$", display: false }, { left: "$", right: "$", display: false }],
      throwOnError: false
    });
  });
}).observe(document.body, { childList: true, subtree: true, characterData: true });
