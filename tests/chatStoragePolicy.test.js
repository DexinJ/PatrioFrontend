import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_PERSISTED_CHAT_MESSAGES,
  archiveConversationInList,
  attachmentSignatureFor,
  boundRuntimeChatMessages,
  filterConversationsByStatus,
  isArchivedConversation,
  normalizeChatIndex,
  normalizeConversationList,
  prepareChatMessagesForPersistence,
  removeConversationFromList,
  restoreConversationInList,
  setConversationAttachmentUris,
  unionConversationAttachmentUris,
} from "../utils/chatStoragePolicy.js";

test("persistence strips inline image bytes but keeps managed file references", () => {
  const persisted = prepareChatMessagesForPersistence([
    {
      role: "user",
      content: [
        { type: "input_image", image_url: "data:image/jpeg;base64,AAAA" },
      ],
    },
    {
      role: "user",
      content: [
        {
          type: "input_image",
          image_url:
            "file:///documents/pantrio-chat-attachments/user/image.jpg",
        },
      ],
    },
  ]);

  assert.equal(JSON.stringify(persisted).includes("base64"), false);
  assert.equal(persisted[0].content[0].text, "[image]");
  assert.equal(
    persisted[1].content[0].image_url,
    "file:///documents/pantrio-chat-attachments/user/image.jpg"
  );
});

test("temporary web blob URLs are not persisted across restarts", () => {
  const persisted = prepareChatMessagesForPersistence([
    {
      role: "user",
      content: [{ type: "input_image", image_url: "blob:https://app.test/123" }],
    },
  ]);
  assert.equal(persisted[0].content[0].text, "[image]");
  assert.equal(JSON.stringify(persisted).includes("blob:"), false);
});

test("runtime and persisted histories are bounded to the newest messages", () => {
  const source = Array.from({ length: 180 }, (_, index) => ({
    role: "assistant",
    content: [{ type: "output_text", text: `message-${index}` }],
  }));
  const runtime = boundRuntimeChatMessages(source);
  const persisted = prepareChatMessagesForPersistence(source);

  assert.ok(runtime.length < source.length);
  assert.equal(persisted.length, MAX_PERSISTED_CHAT_MESSAGES);
  assert.equal(persisted.at(-1).content[0].text, "message-179");
});

test("runtime bounding reuses sanitized immutable messages", () => {
  const message = {
    id: "stable",
    role: "assistant",
    content: [{ type: "output_text", text: "hello" }],
  };
  const first = boundRuntimeChatMessages([message]);
  const second = boundRuntimeChatMessages([message]);
  assert.equal(second[0], first[0]);
  const withNewMessage = boundRuntimeChatMessages([
    ...first,
    { role: "assistant", content: "next" },
  ]);
  assert.equal(withNewMessage[0], first[0]);
});

test("conversation normalization preserves v2 fields and defaults v1 rows", () => {
  const normalized = normalizeConversationList([
    {
      id: "legacy",
      title: "Old chat",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
    {
      id: "archived",
      title: "Hidden",
      status: "archived",
      archivedAt: "2026-09-01T00:00:00.000Z",
      attachmentUris: ["z://file", "a://file", "z://file", 42],
    },
    {
      id: "malformed-status",
      title: "Odd",
      status: "paused",
      archivedAt: "2026-09-02T00:00:00.000Z",
    },
  ]);

  assert.equal(normalized.length, 3);
  assert.deepEqual(normalized[0], {
    id: "legacy",
    title: "Old chat",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    status: "active",
    archivedAt: null,
    attachmentUris: [],
  });
  assert.equal(normalized[1].status, "archived");
  assert.equal(normalized[1].archivedAt, "2026-09-01T00:00:00.000Z");
  assert.deepEqual(normalized[1].attachmentUris, ["a://file", "z://file"]);
  assert.equal(normalized[2].status, "active");
  assert.equal(normalized[2].archivedAt, null);
});

test("chat index normalization reports version and drops duplicates", () => {
  const legacy = normalizeChatIndex({
    activeConversationId: "a",
    conversations: [{ id: "a", title: "A" }, { id: "a", title: "A2" }],
  });
  assert.equal(legacy.version, 1);
  assert.equal(legacy.conversations.length, 1);

  const v2 = normalizeChatIndex({
    version: 2,
    activeConversationId: "b",
    conversations: [
      { id: "b", title: "B", status: "archived", archivedAt: "2026-09-01T00:00:00.000Z" },
    ],
  });
  assert.equal(v2.version, 2);
  assert.equal(v2.conversations[0].status, "archived");
  assert.equal(isArchivedConversation(v2.conversations[0]), true);
});

test("archive/restore/remove list helpers mutate only the target row", () => {
  const base = [
    { id: "a", title: "A", status: "active", archivedAt: null, attachmentUris: [] },
    { id: "b", title: "B", status: "active", archivedAt: null, attachmentUris: [] },
  ];

  const archived = archiveConversationInList(base, "a", "2026-09-06T00:00:00.000Z");
  assert.equal(archived[0].status, "archived");
  assert.equal(archived[0].archivedAt, "2026-09-06T00:00:00.000Z");
  assert.equal(archived[1], base[1]);
  assert.equal(base[0].status, "active");
  assert.deepEqual(filterConversationsByStatus(archived, "archived").map((x) => x.id), ["a"]);
  assert.deepEqual(filterConversationsByStatus(archived, "active").map((x) => x.id), ["b"]);

  const restored = restoreConversationInList(archived, "a");
  assert.equal(restored[0].status, "active");
  assert.equal(restored[0].archivedAt, null);

  const removed = removeConversationFromList(base, "a");
  assert.deepEqual(removed.map((x) => x.id), ["b"]);
  assert.deepEqual(removeConversationFromList(base, "missing"), base);
});

test("attachment uri helpers dedupe, sort, and union across conversations", () => {
  const base = [
    { id: "a", title: "A", status: "active", archivedAt: null, attachmentUris: [] },
    { id: "b", title: "B", status: "active", archivedAt: null, attachmentUris: [] },
  ];
  const withA = setConversationAttachmentUris(base, "a", [
    "file://z.jpg",
    "file://a.jpg",
    "file://a.jpg",
  ]);
  assert.deepEqual(withA[0].attachmentUris, ["file://a.jpg", "file://z.jpg"]);
  const withB = setConversationAttachmentUris(withA, "b", ["file://m.jpg"]);
  assert.deepEqual(unionConversationAttachmentUris(withB), [
    "file://a.jpg",
    "file://m.jpg",
    "file://z.jpg",
  ]);
  assert.equal(
    attachmentSignatureFor(withA),
    JSON.stringify(["file://a.jpg", "file://z.jpg"])
  );
  assert.notEqual(attachmentSignatureFor(withA), attachmentSignatureFor(withB));
});
