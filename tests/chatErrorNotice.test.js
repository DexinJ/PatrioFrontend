import assert from "node:assert/strict";
import test from "node:test";

import {
  RETRY_MODE_BLOCKED,
  RETRY_MODE_FULL,
  RETRY_MODE_TEXT_ONLY,
  noticeToneForErrorCode,
  planRetrySend,
  removeNotice,
  replaceTrailingNotice,
  retryPayloadFromMessages,
} from "../utils/chatErrorNotice.js";

function notice(id) {
  return {
    id,
    role: "assistant",
    isError: true,
    errorCode: null,
    content: [
      {
        type: "output_text",
        text: "Pantrio AI could not complete that request.",
      },
    ],
  };
}

test("partial results use the warning tone", () => {
  assert.equal(
    noticeToneForErrorCode("RECIPE_RECOMMENDATION_TIMEOUT"),
    "warning"
  );
  assert.equal(noticeToneForErrorCode("UPSTREAM_UNAVAILABLE"), "error");
  assert.equal(noticeToneForErrorCode(null), "error");
  assert.equal(noticeToneForErrorCode(undefined), "error");
});

test("the retry payload comes from the user turn before the notice", () => {
  const messages = [
    { role: "user", content: [{ type: "input_text", text: "first" }] },
    { role: "assistant", content: [{ type: "output_text", text: "answer" }] },
    { role: "user", content: [{ type: "input_text", text: "second" }] },
    notice("notice-1"),
  ];

  assert.deepEqual(retryPayloadFromMessages(messages, "notice-1"), {
    text: "second",
    imageUri: "",
    imageRequestUri: "",
  });
});

// The payload carries the transcript's own image reference, which for a chat
// photo is the durable managed attachment path - never the base64 the model
// needs. Turning that back into a request URI is the caller's job
// (api/chatAttachments.js#toRequestImageUri) and is planned below.
test("an image turn keeps its photo in the retry payload", () => {
  const messages = [
    {
      role: "user",
      content: [
        { type: "input_text", text: "what is this?" },
        {
          type: "input_image",
          image_url:
            "file:///documents/pantrio-chat-attachments/user/a.jpg",
        },
      ],
    },
    notice("notice-1"),
  ];

  assert.deepEqual(retryPayloadFromMessages(messages, "notice-1"), {
    text: "what is this?",
    imageUri: "file:///documents/pantrio-chat-attachments/user/a.jpg",
    imageRequestUri: "file:///documents/pantrio-chat-attachments/user/a.jpg",
  });
});

test("a photo turn is re-sent with the materialised data URL", () => {
  const payload = {
    text: "what is this?",
    imageUri: "file:///documents/pantrio-chat-attachments/user/a.jpg",
    imageRequestUri: "file:///documents/pantrio-chat-attachments/user/a.jpg",
  };

  assert.deepEqual(planRetrySend(payload, "data:image/jpeg;base64,AAA"), {
    mode: RETRY_MODE_FULL,
    text: "what is this?",
    imageRequestUri: "data:image/jpeg;base64,AAA",
  });
  // An already-materialised data URL is passed straight through.
  assert.equal(
    planRetrySend(
      { text: "", imageUri: "data:image/jpeg;base64,BBB" },
      "data:image/jpeg;base64,BBB"
    ).mode,
    RETRY_MODE_FULL
  );
});

test("a photo that cannot be read back falls back to its text", () => {
  const plan = planRetrySend(
    {
      text: "what is this?",
      imageUri: "file:///documents/pantrio-chat-attachments/user/gone.jpg",
    },
    ""
  );

  assert.equal(plan.mode, RETRY_MODE_TEXT_ONLY);
  assert.equal(plan.text, "what is this?");
  assert.equal(plan.imageRequestUri, "");
});

test("an image-only turn with no readable bytes is refused", () => {
  const plan = planRetrySend(
    {
      text: "",
      imageUri: "file:///documents/pantrio-chat-attachments/user/gone.jpg",
    },
    ""
  );

  assert.equal(plan.mode, RETRY_MODE_BLOCKED);
  assert.equal(plan.imageRequestUri, "");
});

test("a turn with nothing left to send is refused", () => {
  assert.equal(planRetrySend(null, "").mode, RETRY_MODE_BLOCKED);
  assert.equal(planRetrySend({ text: "   ", imageUri: "" }, "").mode, RETRY_MODE_BLOCKED);
});

test("a photo the app could not persist is not retryable", () => {
  const messages = [
    { role: "user", content: [{ type: "input_text", text: "[image]" }] },
    notice("notice-1"),
  ];

  assert.equal(retryPayloadFromMessages(messages, "notice-1"), null);
});

test("only the newest notice is retryable", () => {
  const messages = [
    { role: "user", content: [{ type: "input_text", text: "first" }] },
    notice("notice-1"),
    { role: "user", content: [{ type: "input_text", text: "second" }] },
    notice("notice-2"),
  ];

  assert.equal(
    retryPayloadFromMessages(messages, "notice-2")?.text,
    "second"
  );
  assert.equal(retryPayloadFromMessages(messages, "notice-1"), null);
});

test("tool chatter is skipped when looking for the failed turn", () => {
  const messages = [
    { role: "user", content: [{ type: "input_text", text: "real turn" }] },
    { role: "user", text: "[fromTool] internal note" },
    notice("notice-1"),
  ];

  assert.equal(
    retryPayloadFromMessages(messages, "notice-1")?.text,
    "real turn"
  );
});

test("a repeated failure replaces the notice for that turn", () => {
  const messages = [
    { role: "user", content: [{ type: "input_text", text: "turn" }] },
    notice("notice-1"),
  ];

  const next = replaceTrailingNotice(messages, notice("notice-2"));
  assert.equal(next.length, 2);
  assert.equal(next[1].id, "notice-2");
  assert.equal(next[0], messages[0]);
});

test("a notice that does not follow the last user turn is never replaced", () => {
  const messages = [
    { role: "user", content: [{ type: "input_text", text: "turn" }] },
    { role: "assistant", content: [{ type: "output_text", text: "answer" }] },
    notice("notice-1"),
  ];

  const next = replaceTrailingNotice(messages, notice("notice-2"));
  assert.equal(next.length, 4);
  assert.equal(next[2].id, "notice-1");
  assert.equal(next[3].id, "notice-2");
});

test("dismiss removes only the matching notice", () => {
  const messages = [
    { role: "user", content: [{ type: "input_text", text: "turn" }] },
    notice("notice-1"),
    { role: "user", content: [{ type: "input_text", text: "next" }] },
    notice("notice-2"),
  ];

  const next = removeNotice(messages, "notice-1");
  assert.equal(next.length, 3);
  assert.equal(
    next.some((message) => message.id === "notice-1"),
    false
  );
  assert.equal(
    next.some((message) => message.id === "notice-2"),
    true
  );
  assert.equal(removeNotice(messages, "missing"), messages);
});
