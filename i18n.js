(function (root) {
  "use strict";

  const api = root.chrome?.i18n;

  function message(key, substitutions, fallback = "") {
    try {
      const translated = api?.getMessage?.(key, substitutions);
      if (translated) return translated;
    } catch (_error) {
      // Unavailable i18n APIs use the supplied readable fallback.
    }
    return fallback;
  }

  function parseSubstitutions(value) {
    if (!value) return undefined;
    try {
      const parsed = JSON.parse(value);
      if (parsed === null) return undefined;
      if (Array.isArray(parsed)) return parsed.map(String);
      return String(parsed);
    } catch (_error) {
      return value;
    }
  }

  function direction() {
    return message("catalogDirection", undefined, "ltr") === "rtl" ? "rtl" : "ltr";
  }

  function locale() {
    return message("catalogLanguage", undefined, "en").replace(/_/g, "-");
  }

  function applyDirection(element) {
    if (!element) return;
    element.setAttribute("dir", direction());
    element.setAttribute("lang", locale());
  }

  function localizePage(scope = root.document) {
    if (!scope?.querySelectorAll) return;
    const query = (selector) => [
      ...(scope.matches?.(selector) ? [scope] : []),
      ...scope.querySelectorAll(selector),
    ];
    query("[data-i18n]").forEach((element) => {
      const substitutions = parseSubstitutions(element.dataset.i18nArgs);
      const translated = message(
        element.dataset.i18n,
        substitutions,
        element.textContent.trim(),
      );
      if (translated) element.textContent = translated;
    });
    for (const attribute of ["title", "aria-label", "placeholder"]) {
      query(`[data-i18n-${attribute}]`).forEach((element) => {
        const key = element.getAttribute(`data-i18n-${attribute}`);
        const substitutions = parseSubstitutions(element.dataset.i18nArgs);
        const translated = message(
          key,
          substitutions,
          element.getAttribute(attribute) || "",
        );
        if (translated) element.setAttribute(attribute, translated);
      });
    }
    if (scope === root.document) applyDirection(root.document.documentElement);
  }

  const FT_I18N = Object.freeze({
    message,
    direction,
    locale,
    applyDirection,
    localizePage,
    parseSubstitutions,
  });
  root.FT_I18N = FT_I18N;

  const isExtensionDocument = ["chrome-extension:", "moz-extension:"].includes(
    root.location?.protocol,
  );
  if (root.document && isExtensionDocument) {
    if (root.document.readyState === "loading") {
      root.document.addEventListener("DOMContentLoaded", () => localizePage(), { once: true });
    } else {
      localizePage();
    }
  }
})(globalThis);
