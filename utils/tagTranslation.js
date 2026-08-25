// utils/tagTranslation.js
// Maps canonical English tag labels ("Eat first", "Dairy", ...) to the
// localized display text in the tags.* catalog sections.
//
// Stored/backend values stay English; only the rendered label is translated.
import i18next from "i18next";

const SNAKE_TO_CAMEL = {
  eat_first: "eatFirst",
  use_soon: "useSoon",
  lasts_a_while: "lastsAWhile",
  long_keeper: "longKeeper",
  food_type: "foodType",
};

function sectionForType(type) {
  if (type === "storage") return "storage";
  if (type === "urgency") return "urgency";
  if (type === "food_type" || type === "foodType") return "foodType";
  return "state";
}

export function translateTagLabel(label, type) {
  const raw = String(label ?? "");
  const normalized = raw.trim().toLowerCase().replace(/\s+/g, "_");
  const key = SNAKE_TO_CAMEL[normalized] || normalized;
  const section = sectionForType(type);
  return i18next.t(`tags.${section}.${key}`, { defaultValue: raw });
}
