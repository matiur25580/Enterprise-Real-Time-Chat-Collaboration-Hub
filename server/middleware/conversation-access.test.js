const test = require("node:test");
const assert = require("node:assert/strict");
const { isConversationMember } = require("./conversation-access");

test("allows only an account listed as a conversation participant", () => {
  const conversation = { participants: ["user-a", "user-b"] };
  assert.equal(isConversationMember(conversation, "user-a"), true);
  assert.equal(isConversationMember(conversation, "user-b"), true);
  assert.equal(isConversationMember(conversation, "user-c"), false);
});

test("supports populated participant documents", () => {
  const conversation = { participants: [{ _id: "user-a" }, { _id: "user-b" }] };
  assert.equal(isConversationMember(conversation, "user-a"), true);
  assert.equal(isConversationMember(conversation, "user-c"), false);
});

test("fails closed for missing conversations, users, or membership data", () => {
  assert.equal(isConversationMember(null, "user-a"), false);
  assert.equal(isConversationMember({ participants: ["user-a"] }, null), false);
  assert.equal(isConversationMember({ participants: null }, "user-a"), false);
});
