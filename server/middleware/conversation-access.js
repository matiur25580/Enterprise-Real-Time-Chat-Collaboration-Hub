// Keep membership checks consistent across HTTP and Socket.IO handlers.
function isConversationMember(conversation, userId) {
  if (!conversation || !userId || !Array.isArray(conversation.participants)) return false;
  const expected = String(userId);
  return conversation.participants.some((participant) => {
    const id = participant && typeof participant === "object" && participant._id
      ? participant._id
      : participant;
    return id != null && String(id) === expected;
  });
}

module.exports = { isConversationMember };
