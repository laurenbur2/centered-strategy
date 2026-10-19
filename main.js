/* Centered Strategy — interactions */
(function () {
  "use strict";

  /* --- current year in footer --- */
  var yearEl = document.getElementById("year");
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  /* --- nav: shadow on scroll --- */
  var nav = document.getElementById("nav");
  function onScroll() {
    if (!nav) return;
    nav.classList.toggle("is-scrolled", window.scrollY > 8);
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  /* --- full-screen menu toggle --- */
  var toggle = document.getElementById("navToggle");
  var menu = document.getElementById("menu");
  if (toggle && menu) {
    function setMenu(open) {
      menu.classList.toggle("is-open", open);
      toggle.classList.toggle("is-active", open);
      toggle.setAttribute("aria-expanded", String(open));
      toggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
      menu.setAttribute("aria-hidden", String(!open));
      document.body.classList.toggle("menu-open", open);
      document.body.style.overflow = open ? "hidden" : "";
    }
    toggle.addEventListener("click", function () {
      setMenu(!menu.classList.contains("is-open"));
    });
    // close after tapping a link
    menu.addEventListener("click", function (e) {
      if (e.target.closest("a")) setMenu(false);
    });
    // close on Escape
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && menu.classList.contains("is-open")) setMenu(false);
    });
  }

  /* --- hero sunburst mark (radiating rays) --- */
  function buildRays(id, cx, cy) {
    var g = document.getElementById(id);
    if (!g) return;
    var count = 60, svgns = "http://www.w3.org/2000/svg";
    for (var i = 0; i < count; i++) {
      var ang = (i / count) * Math.PI * 2 - Math.PI / 2;
      var seed = Math.sin(i * 12.9898) * 43758.5453;
      var rnd = seed - Math.floor(seed);
      var inner = 30, outer = 62 + rnd * 58;
      var line = document.createElementNS(svgns, "line");
      line.setAttribute("x1", cx + Math.cos(ang) * inner);
      line.setAttribute("y1", cy + Math.sin(ang) * inner);
      line.setAttribute("x2", cx + Math.cos(ang) * outer);
      line.setAttribute("y2", cy + Math.sin(ang) * outer);
      line.setAttribute("stroke", "#48613C");
      line.setAttribute("stroke-width", "1");
      line.setAttribute("stroke-linecap", "round");
      line.setAttribute("opacity", (0.45 + rnd * 0.55).toFixed(2));
      line.setAttribute("class", "ray");
      line.style.animationDelay = (i * 0.008) + "s";
      g.appendChild(line);
      if (rnd > 0.62) {
        var dot = document.createElementNS(svgns, "circle");
        dot.setAttribute("cx", cx + Math.cos(ang) * (outer + 5));
        dot.setAttribute("cy", cy + Math.sin(ang) * (outer + 5));
        dot.setAttribute("r", "1.4");
        dot.setAttribute("fill", "#48613C");
        dot.setAttribute("opacity", "0.6");
        g.appendChild(dot);
      }
    }
  }
  buildRays("rays", 150, 150);

  var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* --- floating CTA: show after the first screen, hide over the closing CTA + footer --- */
  var floatCta = document.getElementById("floatCta");
  if (floatCta) {
    var endZone = document.querySelector(".cta-band") || document.querySelector(".footer");
    function onFloat() {
      var past = window.scrollY > window.innerHeight * 0.75;
      var atEnd = endZone && endZone.getBoundingClientRect().top < window.innerHeight * 0.9;
      floatCta.classList.toggle("is-visible", past && !atEnd);
    }
    window.addEventListener("scroll", onFloat, { passive: true });
    onFloat();
  }

  /* --- count-up numbers --- */
  var counters = document.querySelectorAll("[data-count]");
  if ("IntersectionObserver" in window && counters.length && !reduceMotion) {
    var cio = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var el = entry.target, end = +el.getAttribute("data-count"), t0 = null;
        function tick(t) {
          if (!t0) t0 = t;
          var k = Math.min((t - t0) / 1400, 1);
          el.textContent = Math.round(end * (1 - Math.pow(1 - k, 3)));
          if (k < 1) requestAnimationFrame(tick);
        }
        requestAnimationFrame(tick);
        cio.unobserve(el);
      });
    }, { threshold: 0.6 });
    counters.forEach(function (el) { cio.observe(el); });
  }

  /* --- scroll reveal --- */
  var revealEls = document.querySelectorAll(".reveal");
  if ("IntersectionObserver" in window && revealEls.length) {
    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -8% 0px" }
    );
    revealEls.forEach(function (el) { io.observe(el); });
  } else {
    revealEls.forEach(function (el) { el.classList.add("is-visible"); });
  }
})();
