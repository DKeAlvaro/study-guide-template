// Ask-the-guide: side panel that answers questions about the current page using
// the reader's own LLM API key (kept only in localStorage). The chat itself
// (streaming, markdown, KaTeX, input, scrolling) is Deep Chat (deepchat.dev);
// this file only adds the launcher, key settings, the "Ask about this" chip and
// the page context.
(function () {
  // EDIT ME: course name used in the AI tutor's system prompt
  const SUBJECT = "COURSE NAME (University)";
  "use strict";
  if (window.__sspAskLoaded) return; // instant navigation may re-run scripts
  window.__sspAskLoaded = true;

  const DEEP_CHAT = "https://cdn.jsdelivr.net/npm/deep-chat@2.5.0/dist/deepChat.bundle.js";

  const LS = { provider: "ssp-ask-provider", key: "ssp-ask-key", model: "ssp-ask-model" };
  const MAX_CONTEXT = 14000;
  const MAX_SELECTION = 6000;
  const ZOOM_KEY = "ssp-ask-zoom";
  const ZOOM_MIN = 0.6, ZOOM_MAX = 2.2;
  let zoom = parseFloat(localStorage.getItem(ZOOM_KEY)) || 1;
  zoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, zoom));

  const PROVIDERS = {
    gemini: {
      name: "Google Gemini",
      keyHint: "AIza...",
      keyUrl: "https://aistudio.google.com/apikey",
      defaultModel: "gemini-2.5-flash",
      connection: (key, model) => ({ gemini: { key: key, model: model } }),
    },
    openai: {
      name: "OpenAI",
      keyHint: "sk-...",
      keyUrl: "https://platform.openai.com/api-keys",
      defaultModel: "gpt-6-luna",
      connection: (key, model) => ({ openAI: { key: key, chat: { model: model } } }),
    },
    openrouter: {
      name: "OpenRouter",
      keyHint: "sk-or-...",
      keyUrl: "https://openrouter.ai/keys",
      defaultModel: "google/gemini-2.5-flash",
      connection: (key, model) => ({ openRouter: { key: key, model: model } }),
    },
  };

  const ICONS = {
    back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>',
    trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12h10l1-12M9 7V4h6v3"/></svg>',
    close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    settings: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h9M19 7h1M4 17h3M13 17h7"/><circle cx="16" cy="7" r="2.3"/><circle cx="10" cy="17" r="2.3"/></svg>',
    chat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 12a7.5 7.5 0 0 1-7.5 7.5H8l-4 2.5V12A7.5 7.5 0 0 1 11.5 4.5h1A7.5 7.5 0 0 1 20 12z"/></svg>',
    zoomIn: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="10.5" cy="10.5" r="6"/><path d="M15 15l5 5M10.5 8v5M8 10.5h5"/></svg>',
    zoomOut: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="10.5" cy="10.5" r="6"/><path d="M15 15l5 5M8 10.5h5"/></svg>',
    quote: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 7h4v4a5.5 5.5 0 0 1-4 5v-2.2c1.2-.5 1.9-1.3 2-2.3H7V7zm8 0h4v4a5.5 5.5 0 0 1-4 5v-2.2c1.2-.5 1.9-1.3 2-2.3h-2V7z"/></svg>',
  };

  const state = {
    provider: localStorage.getItem(LS.provider) || "gemini",
    key: localStorage.getItem(LS.key) || "",
    model: localStorage.getItem(LS.model) || "",
    selection: "",
    open: false,
    view: "chat",
  };
  if (!PROVIDERS[state.provider]) state.provider = "gemini";

  const ui = {};
  let chat = null;
  let saved = []; // conversation kept across instant navigation (the body is swapped)
  let chip = null;
  let lastFocus = null;
  let geom = null; // live window geometry (desktop), shared by drag/resize and the anchoring
  let minimized = false; // clicked outside: the window shrinks to the ball
  let ball = null;
  let tail = null;
  let anchor = null; // { range } of the highlighted passage the window was opened from
  const isTouch = () => window.matchMedia && window.matchMedia("(pointer: coarse)").matches;

  function el(tag, cls, html) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html !== undefined) n.innerHTML = html;
    return n;
  }

  /* ---------------- page context ---------------- */

  function pageTitle() {
    const h = document.querySelector(".md-content__inner h1");
    return (h && h.textContent.replace(/\s*#\s*$/, "").trim()) || document.title;
  }

  function pageContext() {
    const main = document.querySelector(".md-content__inner");
    if (!main) return "";
    const clone = main.cloneNode(true);
    clone.querySelectorAll("script, style, .noprint, #ask-panel, .md-content__button").forEach((n) => n.remove());
    clone.querySelectorAll(".katex").forEach((katex) => {
      const ann = katex.querySelector('annotation[encoding="application/x-tex"]');
      const tex = ann ? ann.textContent.trim() : katex.textContent;
      katex.replaceWith(document.createTextNode(" $" + tex + "$ "));
    });
    const text = clone.textContent.replace(/[ \t ]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
    return ("Page: " + pageTitle() + "\n\n" + text).slice(0, MAX_CONTEXT);
  }

  function systemPrompt() {
    return (
      "You are a tutor for " + SUBJECT + ". " +
      "The student is revising for the exam and asks about the material in this guide. " +
      "Answer from the PAGE CONTENT below when the question is about the guide; " +
      "if it goes beyond it, say so and answer from general knowledge. " +
      (state.selection
        ? "The student has highlighted a passage (see SELECTED PASSAGE below): treat it as the immediate context and focus your answer on it. "
        : "") +
      "Be concise and exam-focused: short derivation steps, state the formula before using it, " +
      "point out the mistakes the exam punishes. " +
      "Write maths in LaTeX between $...$ (inline) or $$...$$ (display); never use MathML or \\( \\). " +
      "Reply in the same language the student writes in.\n\n--- PAGE CONTENT ---\n" +
      pageContext() +
      (state.selection ? '\n\n--- SELECTED PASSAGE ---\n"""' + state.selection + '"""' : "")
    );
  }

  // Deep Chat builds the provider request; swap in the live system prompt just before it is sent
  function requestInterceptor(req) {
    const b = req.body || {};
    const sys = systemPrompt();
    if (b.systemInstruction) b.systemInstruction = { parts: [{ text: sys }] };
    else if (b.system_instruction) b.system_instruction = { parts: [{ text: sys }] };
    else if (Array.isArray(b.contents)) b.systemInstruction = { parts: [{ text: sys }] };
    else if (Array.isArray(b.messages)) {
      if (b.messages[0] && b.messages[0].role === "system") b.messages[0].content = sys;
      else b.messages.unshift({ role: "system", content: sys });
    } else if (Array.isArray(b.input)) b.input.unshift({ role: "system", content: sys });
    return req;
  }

  /* ---------------- Deep Chat ---------------- */

  let libPromise = null;
  function loadLib() {
    if (!libPromise) {
      libPromise = import(DEEP_CHAT).then(() => customElements.whenDefined("deep-chat"));
      libPromise.catch(() => { libPromise = null; });
    }
    return libPromise;
  }

  function dark() {
    return document.documentElement.getAttribute("data-md-color-scheme") === "slate" ||
      document.body.getAttribute("data-md-color-scheme") === "slate";
  }

  const SHADOW_CSS =
    // desktop: the input floats over the bottom edge. The whole strip is the hover zone; until then
    // only a small grey handle shows, and it fades out once the box takes over.
    "@media (min-width:45em){#input{position:absolute!important;left:0;right:0;bottom:0;min-height:34px;padding:0!important;background:transparent!important}" +
    "#input>*{opacity:0;transition:opacity .15s}#input:hover>*,#input:focus-within>*{opacity:1}" +
    "#input::after{content:'';position:absolute;left:50%;bottom:8px;width:44px;height:5px;margin-left:-22px;border-radius:4px;background:rgba(128,128,128,.55);pointer-events:none;transition:opacity .15s}" +
    "#input:hover::after,#input:focus-within::after{opacity:0}}" +
    "#text-input{padding-right:2.8rem!important;box-sizing:border-box}" +
    ".inner-message-container{width:calc(100% - 8px)!important}" +
    "#text-input{white-space:nowrap!important;overflow:hidden!important;max-height:2.4em!important}" +
    "[contenteditable]:empty:before{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}" +
    ".katex{font-size:1.05em;display:inline-block;max-width:100%;overflow-x:auto;overflow-y:hidden;vertical-align:middle}" +
    ".katex-display{overflow-x:auto;overflow-y:hidden;margin:.6em 0;max-width:100%}.katex-display>.katex{display:block;max-width:100%}" +
    ".message-bubble,.ai-message,.user-message{overflow-wrap:anywhere;min-width:0;max-width:100%}" +
    "table{display:block;max-width:100%;overflow-x:auto;border-collapse:collapse;font-size:.85em;margin:.5em 0}" +
    "th,td{border:1px solid rgba(128,128,128,.4);padding:.3em .6em}th{background:rgba(128,128,128,.12)}" +
    "pre{overflow-x:auto}p{margin:.25em 0}ul,ol{margin:.3em 0;padding-left:1.3em}h1,h2,h3,h4{font-size:1em;margin:.7em 0 .3em}" +
    "blockquote{margin:.4em 0;padding:.1em .8em;border-left:3px solid rgba(128,128,128,.5)}";

  function chatStyleProps() {
    const d = dark();
    const fg = d ? "#ece7e1" : "#1d1b19";
    const soft = d ? "rgba(255,255,255,.08)" : "rgba(0,0,0,.05)";
    return {
      chatStyle: { width: "100%", height: "100%", border: "none", background: "transparent", borderRadius: "0" },
      messageStyles: {
        default: {
          shared: { bubble: { maxWidth: "94%", padding: ".3rem .6rem", overflow: "hidden", overflowWrap: "anywhere", fontSize: "14px", lineHeight: "1.5", color: fg } },
          user: { bubble: { background: "#a82616", color: "#fff" } },
          intro: { bubble: { background: "transparent", border: "none", color: d ? "#b9b1a7" : "#6b6259", fontSize: "13px", padding: ".2rem .2rem" } },
          ai: { bubble: { background: soft, border: "1px solid " + (d ? "rgba(255,255,255,.13)" : "rgba(0,0,0,.1)") } },
        },
      },
      textInput: {
        placeholder: { text: "Ask about this page, or highlight a passage", style: { color: d ? "#9a948c" : "#6b6259" } },
        styles: {
          container: { borderRadius: "14px", border: "1px solid " + (d ? "rgba(255,255,255,.2)" : "rgba(0,0,0,.18)"), background: d ? "#1d1b19" : "#fff", boxShadow: "none", marginBottom: "8px", width: "calc(100% - 16px)" },
          text: { color: fg, fontSize: "14px" },
        },
      },
      submitButtonStyles: { position: "inside-right", submit: { container: { default: { bottom: "6px", right: "10px" } } } },
    };
  }

  function chatSettings(c) {
    const p = PROVIDERS[state.provider];
    c.directConnection = p.connection(state.key, state.model || p.defaultModel);
    c.connect = { stream: true };
    c.remarkable = { math: { options: { throwOnError: false } }, breaks: true };
    c.requestInterceptor = requestInterceptor;
    const s = chatStyleProps();
    Object.keys(s).forEach((k) => { c[k] = s[k]; });
  }

  function mountChat() {
    if (!state.key || !ui.chatHost) return Promise.resolve();
    return loadLib().then(() => {
      if (!ui.chatHost) return;
      if (chat && ui.chatHost.contains(chat)) {
        chatSettings(chat);
        return;
      }
      chat = document.createElement("deep-chat");
      chat.className = "ask-chat";
      chatSettings(chat);
      if (saved.length) chat.history = saved;
      ui.chatHost.appendChild(chat);
      // tables / formulas live inside the shadow root, so they are styled from there
      setTimeout(() => {
        if (chat && chat.shadowRoot) {
          const st = document.createElement("style");
          st.textContent = SHADOW_CSS;
          chat.shadowRoot.appendChild(st);
          applyZoom();
        }
      }, 50);
    }, () => {
      ui.chatHost.innerHTML = '<p class="ask-fail">Could not load the chat component (jsDelivr). Check your connection and reopen.</p>';
    });
  }

  function snapshot() {
    try {
      if (chat && chat.getMessages) {
        const m = chat.getMessages().filter((x) => x && x.text && x.role);
        if (m.length) saved = m.map((x) => ({ role: x.role, text: x.text }));
      }
    } catch (e) { /* keep the previous snapshot */ }
  }

  /* ---------------- UI ---------------- */

  function buildPanel() {
    ["ask-panel", "ask-backdrop"].forEach((id) => {
      const old = document.getElementById(id);
      if (old) old.remove();
    });
    chat = null;

    const backdrop = el("div");
    backdrop.id = "ask-backdrop";
    backdrop.addEventListener("click", close);

    const wrap = el("aside");
    wrap.id = "ask-panel";
    wrap.setAttribute("role", "dialog");
    wrap.setAttribute("aria-label", "Ask");
    wrap.innerHTML =
      '<div class="ask-grab"></div>' +
      ["n", "s", "e", "w", "nw", "ne", "sw", "se"].map((d) => '<div class="ask-resize ask-resize-' + d + '" data-edge="' + d + '"></div>').join("") +
      '<header class="ask-head">' +
        '<button type="button" class="ask-btn ask-back" data-act="back" aria-label="Back to chat">' + ICONS.back + '</button>' +
        '<div class="ask-head-text">' +
          '<div class="ask-quote" hidden>' +
            '<div class="ask-quote-main" tabindex="0"><div class="ask-quote-label" aria-label="Highlighted passage">' + ICONS.quote + '</div><div class="ask-quote-text"></div></div>' +
            '<button type="button" class="ask-quote-x" data-act="clear-ctx" aria-label="Remove highlighted passage">' + ICONS.close + '</button>' +
          '</div>' +
        '</div>' +
        '<button type="button" class="ask-btn ask-zoom" data-act="zoom-out" aria-label="Smaller text" title="Smaller text (Ctrl+scroll)">' + ICONS.zoomOut + '</button>' +
        '<button type="button" class="ask-btn ask-zoom" data-act="zoom-in" aria-label="Bigger text" title="Bigger text (Ctrl+scroll)">' + ICONS.zoomIn + '</button>' +
        '<button type="button" class="ask-btn ask-reset" data-act="reset" aria-label="New chat" title="New chat">' + ICONS.trash + '</button>' +
        '<button type="button" class="ask-btn ask-gear" data-act="settings" aria-label="API key settings" title="API key settings">' + ICONS.settings + '</button>' +
        '<button type="button" class="ask-btn ask-close" data-act="close" aria-label="Close" title="Close (Esc)">' + ICONS.close + '</button>' +
      '</header>' +
      '<div class="ask-body">' +
        '<div class="ask-chat-host"></div>' +
        '<form class="ask-settings" autocomplete="off">' +
          '<p class="ask-note">The key stays in this browser and goes straight to the provider. Nothing passes through this site.</p>' +
          '<label>Provider<select class="ask-provider"></select></label>' +
          '<label>API key<input type="password" class="ask-key" autocomplete="off" spellcheck="false"></label>' +
          '<label>Model<input type="text" class="ask-model" spellcheck="false"></label>' +
          '<div class="ask-actions">' +
            '<button type="submit" class="ask-save">Save</button>' +
            '<a class="ask-keylink" target="_blank" rel="noopener">Get a key</a>' +
          '</div>' +
        '</form>' +
      '</div>';

    document.body.appendChild(backdrop);
    document.body.appendChild(wrap);

    ui.panel = wrap;
    ui.backdrop = backdrop;
    ui.body = wrap.querySelector(".ask-body");
    ui.chatHost = wrap.querySelector(".ask-chat-host");
    ui.settings = wrap.querySelector(".ask-settings");
    ui.provider = wrap.querySelector(".ask-provider");
    ui.key = wrap.querySelector(".ask-key");
    ui.model = wrap.querySelector(".ask-model");
    ui.keylink = wrap.querySelector(".ask-keylink");
    ui.quote = wrap.querySelector(".ask-quote");
    ui.quoteText = wrap.querySelector(".ask-quote-text");
    // hovering the quote in the header lights up the passage on the page
    const hot = (on) => document.documentElement.classList.toggle("ask-hot", on);
    ui.quote.addEventListener("mouseenter", () => hot(true));
    ui.quote.addEventListener("mouseleave", () => hot(false));

    Object.keys(PROVIDERS).forEach((id) => {
      const o = el("option");
      o.value = id;
      o.textContent = PROVIDERS[id].name;
      ui.provider.appendChild(o);
    });

    wrap.addEventListener("click", (e) => {
      const hit = e.target.closest ? e.target.closest("[data-act]") : null;
      if (!hit) return;
      const act = hit.getAttribute("data-act");
      if (act === "close") close();
      else if (act === "settings") setView(state.view === "settings" ? "chat" : "settings");
      else if (act === "back") setView("chat");
      else if (act === "reset") resetChat();
      else if (act === "zoom-in") setZoom(zoom + 0.1);
      else if (act === "zoom-out") setZoom(zoom - 0.1);
      else if (act === "clear-ctx") setSelection("");
    });

    ui.provider.addEventListener("change", () => loadProviderFields(ui.provider.value));
    ui.settings.addEventListener("submit", (e) => {
      e.preventDefault();
      saveSettings();
    });

    bindFloating();
    loadProviderFields(state.provider);
    setSelection(state.selection);
    setView(state.key ? "chat" : "settings");
  }

  /* ---------------- floating window: drag + resize (desktop) ---------------- */

  const GEOM_KEY = "ssp-ask-geom";
  const MIN_W = 300, MIN_H = 130;
  const floating = () => window.matchMedia && window.matchMedia("(min-width: 45em)").matches;

  function clampGeom(g) {
    g.w = Math.max(MIN_W, Math.min(g.w, window.innerWidth - 8));
    g.h = Math.max(MIN_H, Math.min(g.h, window.innerHeight - 8));
    g.x = Math.max(4, Math.min(g.x, window.innerWidth - g.w - 4));
    g.y = Math.max(4, Math.min(g.y, window.innerHeight - g.h - 4));
    return g;
  }

  function loadGeom() {
    let g = null;
    try { g = JSON.parse(localStorage.getItem(GEOM_KEY)); } catch (e) { /* default */ }
    const w = (g && g.w) || 380;
    const h = (g && g.h) || 520;
    const x = g && typeof g.x === "number" ? g.x : window.innerWidth - w - 12;
    const y = g && typeof g.y === "number" ? g.y : window.innerHeight - h - 12;
    return clampGeom({ x: x, y: y, w: w, h: h });
  }

  function applyGeom(g) {
    const st = ui.panel.style;
    if (!floating()) { st.left = st.top = st.width = st.height = ""; return; }
    st.left = g.x + "px"; st.top = g.y + "px"; st.width = g.w + "px"; st.height = g.h + "px";
  }

  function setZoom(z) {
    zoom = Math.round(Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z)) * 10) / 10;
    try { localStorage.setItem(ZOOM_KEY, String(zoom)); } catch (e) { /* ignore */ }
    applyZoom();
  }

  // Zoom only restyles the messages (CSS inside the shadow root): re-setting Deep Chat's
  // properties would wipe the typed question and move the send button.
  function applyZoom() {
    if (!chat || !chat.shadowRoot) return;
    let st = chat.shadowRoot.getElementById("ask-zoom-style");
    if (!st) {
      st = document.createElement("style");
      st.id = "ask-zoom-style";
      chat.shadowRoot.appendChild(st);
    }
    st.textContent =
      ".message-bubble,.ai-message-text,.user-message-text,.error-message-text{font-size:" + Math.round(14 * zoom * 10) / 10 + "px!important}" +
      ".message-bubble .katex{font-size:1.05em!important}";
  }

  function bindFloating() {
    const g = loadGeom();
    geom = g;
    applyGeom(g);
    const save = () => { try { localStorage.setItem(GEOM_KEY, JSON.stringify(g)); } catch (e) { /* ignore */ } };

    function track(e, onMove) {
      e.preventDefault();
      const sx = e.clientX, sy = e.clientY, g0 = { x: g.x, y: g.y, w: g.w, h: g.h };
      const move = (ev) => { onMove(g0, ev.clientX - sx, ev.clientY - sy); applyGeom(g); };
      const up = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        ui.panel.classList.remove("dragging");
        save();
      };
      ui.panel.classList.add("dragging");
      hideTail();
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
    }

    ui.panel.querySelector(".ask-head").addEventListener("pointerdown", (e) => {
      if (!floating() || e.target.closest("button")) return;
      track(e, (g0, dx, dy) => { g.x = g0.x + dx; g.y = g0.y + dy; clampGeom(g); });
    });
    ui.panel.querySelectorAll(".ask-resize").forEach((h) => {
      h.addEventListener("pointerdown", (e) => {
        if (!floating()) return;
        const d = h.dataset.edge;
        track(e, (g0, dx, dy) => {
          const maxW = window.innerWidth - 8, maxH = window.innerHeight - 8;
          if (d.includes("e")) g.w = Math.min(maxW, Math.max(MIN_W, g0.w + dx));
          if (d.includes("s")) g.h = Math.min(maxH, Math.max(MIN_H, g0.h + dy));
          if (d.includes("w")) { g.w = Math.min(maxW, Math.max(MIN_W, g0.w - dx)); g.x = g0.x + g0.w - g.w; }
          if (d.includes("n")) { g.h = Math.min(maxH, Math.max(MIN_H, g0.h - dy)); g.y = g0.y + g0.h - g.h; }
          clampGeom(g);
        });
      });
    });
    // Ctrl + wheel (or pinch on a trackpad) over the window zooms the text instead of the page
    ui.panel.addEventListener("wheel", (e) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      setZoom(zoom + (e.deltaY < 0 ? 0.1 : -0.1));
    }, { passive: false });
    window.addEventListener("resize", () => {
      if (ui.panel && document.body.contains(ui.panel)) { clampGeom(g); applyGeom(g); }
    });
  }

  function setView(v) {
    state.view = v;
    ui.panel.dataset.view = v;
    if (v === "chat") {
      mountChat().then(() => {
        if (chat && chat.focusInput && !isTouch()) chat.focusInput();
      });
    } else ui.body.scrollTop = 0;
  }

  function resetChat() {
    saved = [];
    if (chat && chat.clearMessages) chat.clearMessages(true);
    setSelection("");
  }

  function loadProviderFields(id) {
    const p = PROVIDERS[id] || PROVIDERS.gemini;
    ui.provider.value = id;
    ui.key.value = id === state.provider ? state.key : "";
    ui.model.value = id === state.provider ? state.model : "";
    ui.model.placeholder = p.defaultModel;
    ui.key.placeholder = p.keyHint;
    ui.keylink.href = p.keyUrl;
  }

  function saveSettings() {
    state.provider = ui.provider.value;
    state.key = ui.key.value.trim();
    state.model = ui.model.value.trim();
    localStorage.setItem(LS.provider, state.provider);
    localStorage.setItem(LS.key, state.key);
    localStorage.setItem(LS.model, state.model);
    snapshot();
    if (chat) { chat.remove(); chat = null; } // rebuilt with the new provider, same conversation
    setView(state.key ? "chat" : "settings");
  }

  /* ---------------- context + highlighted passage ---------------- */

  function setSelection(text) {
    state.selection = String(text || "").trim().slice(0, MAX_SELECTION);
    if (!state.selection) clearAnchor();
    if (!ui.quote) return;
    ui.quote.hidden = !state.selection;
    ui.quoteText.textContent = state.selection;
    if (state.selection.includes("$") && window.renderMathInElement) {
      renderMathInElement(ui.quoteText, { delimiters: [{ left: "$", right: "$", display: false }], throwOnError: false });
    }
  }

  /* ---------------- open / close ---------------- */

  function open(opts) {
    if (!document.getElementById("ask-panel")) buildPanel();
    if (!state.open) lastFocus = document.activeElement;
    const wasOpen = state.open && !minimized;
    state.open = true;
    const wasMin = minimized;
    minimized = false;
    hideBall();
    document.documentElement.classList.add("ask-open");
    if (wasMin && floating() && !(opts && opts.rect)) expandFromBall();
    else {
      if (!(opts && opts.rect && floating() && !wasOpen)) {
        ui.panel.classList.remove("morph", "to-ball");
        ui.panel.classList.add("open");
      }
    }
    ui.backdrop.classList.add("open");
    if (opts && opts.selection !== undefined) {
      setSelection(opts.selection);
      if (state.key) setView("chat");
      if (opts.range) setAnchor(opts.range);
      if (opts.rect && floating()) {
        placeNear(opts.rect);
        if (!wasOpen) {
          const r = opts.rect;
          growFrom((r.left + r.right) / 2, geom.y > r.bottom - 1 ? r.bottom : r.top);
        }
      } else hideTail();
    } else if (wasMin) {
      showAnchor();
    }
    hideChip();
    if (state.view === "chat" && chat && chat.focusInput && !isTouch()) setTimeout(() => chat.focusInput(), 30);
  }

  function close() {
    // desktop: the window folds into a point instead of vanishing
    if (state.open && !minimized && floating() && ui.panel && geom && ui.panel.classList.contains("open")) {
      const p = ui.panel;
      const cx = geom.x + geom.w / 2, cy = geom.y + geom.h / 2;
      p.style.setProperty("--pw", geom.w + "px");
      p.classList.add("morph", "to-ball");
      p.style.left = cx - BALL / 2 + "px"; p.style.top = cy - BALL / 2 + "px";
      p.style.width = BALL + "px"; p.style.height = BALL + "px";
      setTimeout(() => {
        if (ui.panel !== p || state.open) return;
        p.classList.add("noanim");
        p.classList.remove("open", "morph", "to-ball");
        applyGeom(geom);
        void p.offsetWidth;
        p.classList.remove("noanim");
      }, 380);
      finishClose(true);
      return;
    }
    finishClose(false);
  }

  function finishClose(animated) {
    state.open = false;
    minimized = false;
    hideBall();
    hideTail();
    clearAnchor();
    document.documentElement.classList.remove("ask-open");
    if (ui.panel && !animated) ui.panel.classList.remove("open");
    if (ui.backdrop) ui.backdrop.classList.remove("open");
    hideChip();
    if (lastFocus && lastFocus.focus && document.contains(lastFocus)) {
      try { lastFocus.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
    }
  }

  /* ---------------- anchoring: window next to the highlighted text ---------------- */

  const GAP = 14;

  function hideTail() {
    if (tail) tail.style.display = "none";
  }

  function placeNear(r) {
    if (!geom || !ui.panel) return;
    const pref = loadGeom();
    const w = Math.min(pref.w, window.innerWidth - 8);
    const below = window.innerHeight - r.bottom - GAP - 8;
    const above = r.top - GAP - 8;
    const down = below >= pref.h || below >= above;
    const h = Math.max(MIN_H, Math.min(pref.h, down ? below : above));
    const cx = (r.left + r.right) / 2;
    geom.w = w;
    geom.h = h;
    geom.x = Math.max(4, Math.min(cx - w / 2, window.innerWidth - w - 4));
    geom.y = down ? r.bottom + GAP : r.top - GAP - h;
    clampGeom(geom);
    applyGeom(geom);

    if (!tail || !document.body.contains(tail)) {
      tail = el("div");
      tail.id = "ask-tail";
      document.body.appendChild(tail);
    }
    const tx = Math.max(geom.x + 20, Math.min(cx, geom.x + geom.w - 20));
    tail.className = down ? "below" : "above";
    tail.style.left = tx + "px";
    tail.style.top = (down ? geom.y : geom.y + geom.h) + "px";
    tail.style.display = "block";
  }

  // keep the passage visibly marked on the page while the window is about it
  function showAnchor() {
    if (!anchor || !window.CSS || !CSS.highlights || typeof Highlight === "undefined") return;
    try { CSS.highlights.set("ask-anchor", new Highlight(anchor.range)); } catch (e) { /* ignore */ }
  }

  function setAnchor(range) {
    anchor = { range: range };
    showAnchor();
  }

  function clearAnchor() {
    anchor = null;
    document.documentElement.classList.remove("ask-hot");
    if (window.CSS && CSS.highlights) CSS.highlights.delete("ask-anchor");
  }

  /* ---------------- the ball: what the window becomes when you click away ---------------- */

  // a white brush dab with two eyes and a mouth
  const FACE =
    '<svg viewBox="0 0 48 48" aria-hidden="true">' +
      '<path d="M9 27C7 17 14 9 24 9c10 0 17 7 15 17-1 8-8 13-16 13S10 35 9 27z" fill="#fff"/>' +
      '<circle cx="18" cy="23" r="2.2" fill="#a82616"/><circle cx="30" cy="23" r="2.2" fill="#a82616"/>' +
      '<path d="M18 30q6 5 12 0" fill="none" stroke="#a82616" stroke-width="2.2" stroke-linecap="round"/>' +
    '</svg>';
  const BALL = 44;
  let bx = 0, by = 0; // ball centre

  function ensureBall() {
    if (ball && document.body.contains(ball)) return ball;
    ball = el("button", "", FACE);
    ball.id = "ask-ball";
    ball.type = "button";
    ball.setAttribute("aria-label", "Open Ask AI");
    ball.title = "Ask AI";
    // drag it like the window (its centre is the window's centre); a plain click reopens the window.
    // The pointer is captured so the ball keeps following it, and positions come from the
    // pointer delta only (no clamping against the window size, which made it jump).
    ball.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      const sx = e.clientX, sy = e.clientY, x0 = bx, y0 = by;
      let moved = false;
      try { ball.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      const move = (ev) => {
        const dx = ev.clientX - sx, dy = ev.clientY - sy;
        if (!moved && Math.hypot(dx, dy) < 4) return;
        moved = true;
        bx = Math.max(BALL / 2 + 4, Math.min(x0 + dx, window.innerWidth - BALL / 2 - 4));
        by = Math.max(BALL / 2 + 4, Math.min(y0 + dy, window.innerHeight - BALL / 2 - 4));
        placeBall();
      };
      const up = () => {
        ball.removeEventListener("pointermove", move);
        ball.removeEventListener("pointerup", up);
        ball.removeEventListener("pointercancel", up);
        if (!moved) { open(); return; }
        geom.x = bx - geom.w / 2; geom.y = by - geom.h / 2;
        clampGeom(geom);
        try { localStorage.setItem(GEOM_KEY, JSON.stringify(geom)); } catch (err) { /* ignore */ }
      };
      ball.addEventListener("pointermove", move);
      ball.addEventListener("pointerup", up);
      ball.addEventListener("pointercancel", up);
    });
    document.body.appendChild(ball);
    return ball;
  }

  function placeBall() {
    ball.style.left = bx - BALL / 2 + "px";
    ball.style.top = by - BALL / 2 + "px";
  }

  function showBall() {
    const b = ensureBall();
    placeBall();
    b.style.display = "block";
  }

  function hideBall() {
    if (ball) ball.style.display = "none";
  }

  function minimize() {
    if (!state.open || minimized) return;
    minimized = true;
    document.documentElement.classList.remove("ask-open", "ask-hot");
    if (window.CSS && CSS.highlights) CSS.highlights.delete("ask-anchor");
    hideTail();
    bx = geom.x + geom.w / 2;
    by = geom.y + geom.h / 2;
    const p = ui.panel;
    p.style.setProperty("--pw", geom.w + "px");
      p.classList.add("morph", "to-ball");
    p.style.left = bx - BALL / 2 + "px"; p.style.top = by - BALL / 2 + "px";
    p.style.width = BALL + "px"; p.style.height = BALL + "px";
    setTimeout(() => {
      if (!minimized || ui.panel !== p) return;
      p.classList.add("noanim");
      p.classList.remove("open", "morph", "to-ball");
      applyGeom(geom);
      showBall();
      void p.offsetWidth;
      p.classList.remove("noanim");
    }, 380);
  }

  // window grows out of a point (the ball, or the highlighted text); header and body fade in after
  function growFrom(cx, cy) {
    const p = ui.panel;
    p.style.setProperty("--pw", geom.w + "px");
    p.classList.add("noanim", "morph", "to-ball", "grow");
    p.style.left = cx - BALL / 2 + "px"; p.style.top = cy - BALL / 2 + "px";
    p.style.width = BALL + "px"; p.style.height = BALL + "px";
    p.classList.add("open");
    void p.offsetWidth;
    p.classList.remove("noanim", "to-ball");
    applyGeom(geom);
    setTimeout(() => p.classList.remove("morph", "grow"), 620);
  }

  function expandFromBall() {
    geom.x = bx - geom.w / 2; geom.y = by - geom.h / 2;
    clampGeom(geom);
    hideBall();
    growFrom(bx, by);
  }

  /* ---------------- selection chip ---------------- */

  function hideChip() {
    if (chip) chip.style.display = "none";
  }

  function ensureChip() {
    if (chip && document.body.contains(chip)) return chip;
    chip = el("button", "", ICONS.quote + "<span>Ask about this</span>");
    chip.id = "ask-select-btn";
    chip.type = "button";
    // keep the text selected while pressing the chip
    chip.addEventListener("pointerdown", (e) => e.preventDefault());
    chip.addEventListener("mousedown", (e) => e.preventDefault());
    chip.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const text = chip.dataset.text || "";
      const range = chip._range, rect = chip._rect;
      hideChip();
      const s = window.getSelection && window.getSelection();
      if (s && s.removeAllRanges) s.removeAllRanges();
      open({ selection: text, range: range, rect: rect });
    });
    document.body.appendChild(chip);
    return chip;
  }

  // selected text with each formula as its LaTeX source (String(sel) would give the rendered glyphs twice)
  function selectedText(sel) {
    if (!sel.rangeCount) return "";
    const box = document.createElement("div");
    box.appendChild((window.sspWholeFormulas ? window.sspWholeFormulas(sel.getRangeAt(0)) : sel.getRangeAt(0)).cloneContents());
    box.querySelectorAll(".katex").forEach((k) => {
      const ann = k.querySelector('annotation[encoding="application/x-tex"]');
      k.replaceWith(document.createTextNode(" $" + (ann ? ann.textContent.trim() : k.textContent) + "$ "));
    });
    return box.textContent.replace(/\s+/g, " ").replace(/\$ ([.,;:)])/g, "$$$1").trim();
  }

  let lastUp = null;
  document.addEventListener("mouseup", (e) => { lastUp = { x: e.clientX, y: e.clientY, t: Date.now() }; }, true);

  function showChip() {
    const sel = window.getSelection ? window.getSelection() : null;
    const text = sel ? selectedText(sel) : "";
    const content = document.querySelector(".md-content__inner");
    const inside = (n) => n && content && content.contains(n.nodeType === 1 ? n : n.parentNode);
    if (!sel || sel.isCollapsed || sel.rangeCount === 0 || text.length < 3 || text.length > MAX_SELECTION ||
        !inside(sel.anchorNode) || !inside(sel.focusNode)) {
      hideChip();
      return;
    }
    const range = sel.getRangeAt(0);
    const rects = range.getClientRects();
    const r = rects.length ? rects[rects.length - 1] : range.getBoundingClientRect();
    if (!r || (!r.top && !r.left)) {
      hideChip();
      return;
    }
    const btn = ensureChip();
    btn.dataset.text = text;
    btn._range = range.cloneRange();
    btn._rect = { left: r.left, right: r.right, bottom: r.bottom, top: rects.length ? rects[0].top : r.top };
    btn.style.display = "flex";
    const w = btn.offsetWidth || 130;
    // mouse: sit right under the pointer where the drag ended, if that is on the selection
    const p = !isTouch() && lastUp && Date.now() - lastUp.t < 1500 ? lastUp : null;
    const nearSel = p && p.y >= r.top - 12 && p.y <= r.bottom + 12;
    const cx = nearSel ? p.x : r.left + r.width / 2;
    const x = Math.min(Math.max(8, cx - w / 2), window.innerWidth - w - 8);
    // touch browsers draw their own menu above the selection, so go below there
    const above = !isTouch() && !nearSel && r.top > 44;
    const h = btn.offsetHeight || 30;
    const y = nearSel ? Math.min(Math.max(p.y, r.bottom) + 6, window.innerHeight - 52)
      : above ? r.top - h - 2 : Math.min(r.bottom + (isTouch() ? 44 : 2), window.innerHeight - 52);
    btn.style.left = x + "px";
    btn.style.top = y + "px";
  }

  /* ---------------- boot ---------------- */

  let listenersBound = false;

  function bindGlobalListeners() {
    if (listenersBound) return;
    listenersBound = true;

    let t = null;
    const queue = (ms) => {
      clearTimeout(t);
      t = setTimeout(showChip, ms);
    };
    document.addEventListener("mouseup", () => queue(60));
    document.addEventListener("touchend", () => queue(350));
    document.addEventListener("keyup", (e) => {
      if (e.shiftKey || e.key.indexOf("Arrow") === 0) queue(120);
    });
    document.addEventListener("selectionchange", () => {
      const s = window.getSelection();
      if (!s || s.isCollapsed) hideChip();
      else if (isTouch()) queue(450);
    });
    window.addEventListener("scroll", () => { hideChip(); hideTail(); }, { capture: true, passive: true });
    // click anywhere outside the window: it shrinks to the ball (phones keep the dimmed backdrop)
    document.addEventListener("pointerdown", (e) => {
      if (!state.open || minimized || !floating()) return;
      const t = e.target;
      if (t && t.closest && t.closest("#ask-panel, #ask-select-btn, #ask-ball")) return;
      minimize();
    }, true);
    window.addEventListener("resize", () => { hideChip(); hideTail(); });

    document.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      if (chip && chip.style.display !== "none") hideChip();
      else if (state.open) close();
    });
  }

  function boot() {
    try {
      bindGlobalListeners();
      // instant navigation swaps the body: rebuild the panel, keeping the conversation
      if (state.open && !document.getElementById("ask-panel")) {
        const wasMin = minimized;
        snapshot();
        state.open = false;
        open();
        if (wasMin) minimize();
      }
    } catch (e) {
      if (window.console && console.warn) console.warn("ask-the-guide failed to start", e);
    }
  }

  boot();
  if (typeof document$ !== "undefined" && document$ && typeof document$.subscribe === "function") {
    try {
      document$.subscribe(() => boot());
    } catch (e) { /* instant navigation refresh is optional */ }
  }
})();
