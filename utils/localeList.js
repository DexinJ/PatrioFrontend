import i18next from "i18next";

// Joins list values with the separator the current language expects.
// Chinese uses the enumeration comma (、); English uses a plain comma.
export function joinList(values) {
  const items = Array.isArray(values) ? values : [];
  const separator = String(i18next.language || "")
    .toLowerCase()
    .startsWith("zh")
    ? "、"
    : ", ";
  return items.join(separator);
}
