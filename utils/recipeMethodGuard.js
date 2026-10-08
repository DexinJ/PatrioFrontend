// utils/recipeMethodGuard.js
//
// The client half of the method-originality guard. A BYO provider runs the
// summarizer on the user's own key, so its output is untrusted input: it is
// checked here against the publisher's steps before it can reach a card.
//
// Mirrors src/chat/recipeMethodGuard.js on the backend. Scope, stated honestly:
// this catches VERBATIM reuse. A synonym-level rewrite of every step still
// passes, and a cross-language summary shares no shingles with the source at
// all. The prompt, the small bullet budget, and the link back are the primary
// controls.

export const METHOD_SHINGLE_WORDS = 6;
export const METHOD_OVERLAP_THRESHOLD = 0.4;

function words(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function shingleSet(value, size) {
  const tokens = words(value);
  const output = new Set();
  if (tokens.length < size) return output;
  for (let index = 0; index + size <= tokens.length; index += 1) {
    output.add(tokens.slice(index, index + size).join(" "));
  }
  return output;
}

export function shingleOverlap(
  candidate,
  sourceText,
  size = METHOD_SHINGLE_WORDS
) {
  const candidateShingles = shingleSet(candidate, size);
  if (candidateShingles.size === 0) return 0;
  const source = shingleSet(sourceText, size);
  if (source.size === 0) return 0;
  let shared = 0;
  for (const shingle of candidateShingles) {
    if (source.has(shingle)) shared += 1;
  }
  return shared / candidateShingles.size;
}

/**
 * Keeps only the bullets that are sufficiently rewritten. With no source text
 * there is nothing to compare against, so the bullets are kept as-is rather
 * than silently dropped.
 */
export function filterOriginalMethod(
  bullets,
  sourceText,
  {
    size = METHOD_SHINGLE_WORDS,
    threshold = METHOD_OVERLAP_THRESHOLD,
  } = {}
) {
  const list = Array.isArray(bullets) ? bullets : [];
  const source = String(sourceText || "").trim();
  if (!source) return list.slice();
  return list.filter(
    (bullet) => shingleOverlap(bullet, source, size) <= threshold
  );
}
