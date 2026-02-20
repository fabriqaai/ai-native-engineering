(function () {
  var GA_ID = "G-EN8BEGE9B7";

  if (typeof window === "undefined") return;
  if (window.__ainativeGaInitialized) return;
  window.__ainativeGaInitialized = true;

  var script = document.createElement("script");
  script.async = true;
  script.src = "https://www.googletagmanager.com/gtag/js?id=" + GA_ID;
  document.head.appendChild(script);

  window.dataLayer = window.dataLayer || [];
  window.gtag = function () {
    window.dataLayer.push(arguments);
  };
  window.gtag("js", new Date());
  window.gtag("config", GA_ID);
})();
