(() => {
  const userAgent = navigator.userAgent;
  const preferred = /Edg(?:e|A|iOS)?\//.test(userAgent)
    ? "edge"
    : /(?:Firefox|FxiOS)\//.test(userAgent) ? "firefox" : "chrome";

  document.querySelectorAll(".install-actions [data-store]").forEach((button) => {
    button.classList.toggle("primary", button.dataset.store === preferred);
  });
})();
