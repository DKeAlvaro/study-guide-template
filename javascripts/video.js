// Animations: play (muted, looping) only while at least half visible; pause when scrolled away.
// Readers who ask for reduced motion get the poster and the controls, never autoplay.
(function () {
  const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const io = "IntersectionObserver" in window && !still
    ? new IntersectionObserver((entries) => {
        entries.forEach((e) => {
          const v = e.target;
          if (e.isIntersecting && e.intersectionRatio >= 0.5) {
            if (v.dataset.userPaused !== "1") v.play().catch(() => {});
          } else if (!v.paused) {
            v.dataset.auto = "1";
            v.pause();
          }
        });
      }, { threshold: [0, 0.5] })
    : null;

  function wire() {
    document.querySelectorAll("video.anim:not([data-wired])").forEach((v) => {
      v.dataset.wired = "1";
      v.muted = true;
      // A pause the reader asked for sticks; a pause caused by scrolling away does not.
      v.addEventListener("pause", () => {
        if (v.dataset.auto === "1") { v.dataset.auto = ""; return; }
        if (v.isConnected && !v.ended) v.dataset.userPaused = "1";
      });
      v.addEventListener("play", () => { v.dataset.userPaused = ""; });
      if (io) io.observe(v);
    });
  }

  if (typeof document$ !== "undefined") document$.subscribe(wire);
  // Also run immediately: document$ may have emitted before this script loaded.
  wire();
})();
