function localeCandidates(requested = []) {
  const values = Array.isArray(requested) ? requested : [requested];
  const candidates = [];
  for (const value of values) {
    const normalized = String(value || '').replace('_', '-');
    if (!normalized) continue;
    candidates.push(normalized);
    const language = normalized.split('-')[0];
    if (language && language !== normalized) candidates.push(language);
  }
  return [...new Set(candidates)];
}

export function selectDeckLocale(deck, requested = []) {
  const available = Object.keys(deck?.localizations || {});
  if (!available.length) return null;
  const canonical = new Map(available.map((locale) => [locale.toLowerCase(), locale]));
  for (const candidate of localeCandidates(requested)) {
    const exact = canonical.get(candidate.toLowerCase());
    if (exact) return exact;
    const language = candidate.split('-')[0].toLowerCase();
    const compatible = available.find((locale) => locale.split('-')[0].toLowerCase() === language);
    if (compatible) return compatible;
  }
  return null;
}

export function localizedDeck(deck, requested = (typeof navigator !== 'undefined' ? navigator.languages : [])) {
  const locale = selectDeckLocale(deck, requested);
  if (!locale) return deck;
  const translation = deck.localizations[locale];
  return {
    ...deck,
    ...(translation.name ? { name: translation.name } : {}),
    ...(translation.description ? { description: translation.description } : {}),
    layout: {
      ...deck.layout,
      widgets: deck.layout.widgets.map((widget) => ({ ...widget, ...(translation.widgets?.[widget.id] || {}) }))
    },
    activeLocale: locale
  };
}

export function safePackageIcon(deck) {
  const value = String(deck?.package?.icon?.dataUrl || '');
  return /^data:image\/(?:png|webp|jpeg|svg\+xml);base64,[A-Za-z0-9+/=]{1,100000}$/.test(value) ? value : null;
}
