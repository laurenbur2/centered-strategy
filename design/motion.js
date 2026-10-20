/* Mockup motion: scroll entrances, parallax, and scroll-driven scenes. */
(function () {
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var anims = document.querySelectorAll("[data-anim]");

  if (reduce || !("IntersectionObserver" in window)) {
    anims.forEach(function (el) { el.classList.add("in"); });
    return;
  }

  /* --- entrances --- */
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
    });
  }, { threshold: 0.15, rootMargin: "0px 0px -6% 0px" });
  anims.forEach(function (el) { io.observe(el); });

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }
  /* -1 when an element sits below the viewport, 0 centered, 1 above */
  function centerOffset(el, vh) { var r = el.getBoundingClientRect(); return clamp((vh / 2 - (r.top + r.height / 2)) / vh, -1.2, 1.2); }

  var floaters = $$("[data-speed]");

  /* hero: sun sets, hills shift, flowers grow */
  var hero = $(".hero-sun"), heroScene = $(".hero-sun .scene");
  var heroSun = heroScene && $(".sun", heroScene), heroHills = heroScene ? $$(".hill", heroScene) : [];
  var heroPlants = heroScene ? $$(".plants .sway", heroScene) : [];
  var heroCopy = $(".hero-sun__copy");

  /* collage: phone and browser drift in from opposite sides */
  var collage = $(".collage");
  var browser = collage && $(".frame--browser", collage), phone = collage && $(".frame--phone", collage);
  var chips = collage ? $$(".chip-stat", collage) : [], mark = collage && $(".hero__mark", collage);

  /* closing scene: sun rises, flowers bloom */
  var cta = $(".cta-sun"), ctaScene = cta && $(".scene--cta", cta);
  var ctaSun = ctaScene && $(".sun", ctaScene), ctaHills = ctaScene ? $$(".hill", ctaScene) : [];
  var ctaPlants = ctaScene ? $$(".plants .sway", ctaScene) : [];

  /* small things that tilt or drift as they pass */
  var tilts = $$(".svc-card__icon, .niche__icon, .step__icon, .both__list img, .founder2__facts img");
  var media = $$(".work-card__media > img");
  var founderArch = $(".founder2__arch img");

  var ticking = false;
  function frame() {
    var y = window.scrollY, vh = window.innerHeight;

    floaters.forEach(function (el) {
      var r = el.getBoundingClientRect();
      el.style.translate = "0 " + ((r.top + r.height / 2 - vh / 2) * parseFloat(el.dataset.speed)).toFixed(1) + "px";
    });

    if (hero && y < hero.offsetHeight * 1.3) {
      var hp = clamp(y / hero.offsetHeight, 0, 1);
      if (heroSun) heroSun.style.translate = "0 " + (y * 0.32).toFixed(1) + "px";
      heroHills.forEach(function (h, i) { h.style.translate = "0 " + (y * (0.12 - i * 0.04)).toFixed(1) + "px"; });
      heroPlants.forEach(function (p, i) { p.style.scale = (1 + hp * (0.45 + (i % 3) * 0.15)).toFixed(3); });
      if (heroCopy) { heroCopy.style.translate = "0 " + (y * 0.18).toFixed(1) + "px"; heroCopy.style.opacity = Math.max(0, 1 - y / (vh * 0.75)).toFixed(2); }
    }

    if (collage) {
      var q = centerOffset(collage, vh);
      if (browser) { browser.style.translate = (-q * 90).toFixed(1) + "px " + (q * 20).toFixed(1) + "px"; browser.style.rotate = (q * 2).toFixed(2) + "deg"; }
      if (phone) { phone.style.translate = (q * 30).toFixed(1) + "px " + (-q * 110).toFixed(1) + "px"; phone.style.rotate = (-q * 6).toFixed(2) + "deg"; }
      chips.forEach(function (c, i) { c.style.translate = "0 " + ((i ? 1 : -1) * q * 50).toFixed(1) + "px"; });
      if (mark) mark.style.rotate = (q * 120).toFixed(1) + "deg";
    }

    if (cta) {
      var r = cta.getBoundingClientRect();
      var cp = clamp((vh - r.top) / (r.height + vh * 0.15), 0, 1);
      var e = 1 - Math.pow(1 - cp, 3);
      if (ctaSun) ctaSun.style.translate = "0 " + ((1 - e) * 220).toFixed(1) + "px";
      ctaHills.forEach(function (h, i) { h.style.translate = "0 " + ((1 - e) * (30 + i * 25)).toFixed(1) + "px"; });
      ctaPlants.forEach(function (p, i) { p.style.scale = clamp(e * 1.15 - (i % 4) * 0.06, 0.05, 1).toFixed(3); });
    }

    tilts.forEach(function (el) { el.style.rotate = (centerOffset(el, vh) * 14).toFixed(2) + "deg"; });
    media.forEach(function (el) { el.style.translate = "0 " + (centerOffset(el, vh) * 26).toFixed(1) + "px"; });
    if (founderArch) founderArch.style.translate = "0 " + (centerOffset(founderArch, vh) * 18).toFixed(1) + "px";

    ticking = false;
  }
  window.addEventListener("scroll", function () {
    if (!ticking) { ticking = true; requestAnimationFrame(frame); }
  }, { passive: true });
  window.addEventListener("resize", frame);
  frame();
})();
