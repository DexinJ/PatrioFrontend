// Renders the tool list the Apple Foundation Models path sends to the model.
//
// The OpenAI and custom-provider paths receive real JSON Schema, so their
// models can read argument structure directly. The Foundation Models bridge
// gets plain text instead, which means every shape has to be spelled out.
// When a shape is omitted the model is left guessing: `categories` was sent as
// an array of free-form labels because the model could only see the parameter
// name, never that it must be an object with required, enumerated keys.
//
// Shapes are derived from the schemas themselves and keyed by structural
// identity, so a schema shared by several tools (categoriesField is one object
// reused by five tools) is described once and referred to by name elsewhere.
// Nothing here is hardcoded, so the text cannot drift from the real schema.

const DEFAULT_DESCRIPTION_MAX_CHARS = 220;

function schemaKey(schema) {
  return JSON.stringify(schema ?? null);
}

/**
 * Collects every argument shape worth explaining, keyed by structural
 * identity. Object and array shapes are collected at any depth; bare enums
 * only at the top level, since a nested enum is already visible in its
 * parent's shape.
 */
function collectArgumentShapes(tools) {
  const shapes = new Map();

  const visit = (schema, name, depth) => {
    if (!schema || typeof schema !== "object") return;

    if (Array.isArray(schema.enum) && schema.enum.length) {
      // Scalars are keyed by name, not by structure: two parameters that
      // happen to share a type still each need their own line.
      if (depth === 0 && !shapes.has(name)) shapes.set(name, { name, schema });
      return;
    }

    // A top-level nullable field ("integer|null") is worth spelling out; a
    // plain string/integer/boolean is not, and listing them would only add
    // noise to the prompt.
    if (Array.isArray(schema.type)) {
      if (depth === 0 && !shapes.has(name)) shapes.set(name, { name, schema });
      return;
    }

    if (schema.type === "object" && schema.properties) {
      const key = schemaKey(schema);
      if (!shapes.has(key)) shapes.set(key, { name, schema, isArray: false });
      for (const [childName, child] of Object.entries(schema.properties)) {
        visit(child, childName, depth + 1);
      }
      return;
    }

    if (schema.type === "array" && schema.items) {
      const item = schema.items;
      if (item && item.type === "object" && item.properties) {
        const itemKey = schemaKey(item);
        if (!shapes.has(itemKey)) {
          shapes.set(itemKey, { name, schema: item, isArray: true });
        }
        for (const [childName, child] of Object.entries(item.properties)) {
          visit(child, childName, depth + 1);
        }
        return;
      }
      visit(item, name, depth);
    }
  };

  const list = Array.isArray(tools) ? tools : [];
  for (const { function: tool } of list) {
    const properties = tool?.parameters?.properties || {};
    for (const [name, schema] of Object.entries(properties)) {
      visit(schema, name, 0);
    }
  }

  return shapes;
}

/**
 * Renders a schema as short model-readable text. A shape that has its own
 * legend is referenced by name instead of being expanded a second time.
 */
function renderShape(schema, nameByKey, selfKey) {
  if (!schema || typeof schema !== "object") return "value";

  if (Array.isArray(schema.enum) && schema.enum.length) {
    return schema.enum.join("|");
  }

  if (schema.type === "object" && schema.properties) {
    const key = schemaKey(schema);
    if (key !== selfKey && nameByKey.has(key)) return nameByKey.get(key);

    const required = Array.isArray(schema.required) ? schema.required : [];
    const body = Object.entries(schema.properties)
      .map(([childName, child]) => {
        const label = required.includes(childName) ? childName : `${childName}?`;
        const rendered = renderShape(child, nameByKey, key);
        // A shape that already has its own line is named by its key, so
        // repeating it would read as "categories: categories".
        return rendered === childName ? label : `${label}: ${rendered}`;
      })
      .join(", ");
    return `{${body}}`;
  }

  if (schema.type === "array") {
    return `array of ${renderShape(schema.items, nameByKey, selfKey)}`;
  }

  // Nullable fields are expressed as a union, e.g. ["integer", "null"].
  if (Array.isArray(schema.type)) return schema.type.join("|");
  return schema.type || "value";
}

function renderArgumentShapes(shapes) {
  if (shapes.size === 0) return "";

  const nameByKey = new Map(
    [...shapes].map(([key, entry]) => [key, entry.name])
  );

  return [...shapes]
    .map(([key, entry]) => {
      const body = renderShape(entry.schema, nameByKey, key);
      return `${entry.name} = ${entry.isArray ? `array of ${body}` : body}`;
    })
    .join("\n");
}

/**
 * Builds the full tool list text: one line per tool, then the argument shapes
 * those lines refer to.
 */
export function buildAppleToolGuide(
  tools,
  { descriptionMaxChars = DEFAULT_DESCRIPTION_MAX_CHARS } = {}
) {
  const list = (Array.isArray(tools) ? tools : [])
    .map(({ function: tool }) => {
      const parameters = tool?.parameters || {};
      const propertyNames = Object.keys(parameters.properties || {});
      const requiredNames = Array.isArray(parameters.required)
        ? parameters.required
        : [];
      const description = String(tool?.description || "").slice(
        0,
        descriptionMaxChars
      );
      const args = propertyNames.length
        ? `${propertyNames.join(", ")}${
            requiredNames.length
              ? ` [required: ${requiredNames.join(", ")}]`
              : ""
          }`
        : "none";

      return `${tool?.name}(${args}): ${description}`;
    })
    .join("\n");

  const shapes = renderArgumentShapes(collectArgumentShapes(tools));
  return shapes ? `${list}\n\nArgument shapes:\n${shapes}` : list;
}
