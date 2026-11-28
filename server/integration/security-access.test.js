const test = require("node:test");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const path = require("node:path");
const { io } = require("socket.io-client");

const PORT = 5100 + (process.pid % 500);
const BASE_URL = `http://127.0.0.1:${PORT}`;
const JWT_SECRET = "integration-test-secret-with-more-than-32-characters";
const databaseName = `chat_security_test_${process.pid}`;
const configuredMongoUrl = process.env.TEST_MONGO_URL || "mongodb://127.0.0.1:27017";
const mongoUrl = `${configuredMongoUrl.replace(/\/$/, "")}/${databaseName}`;
let serverProcess;
const sockets = [];

async function waitForServer() {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (serverProcess.exitCode !== null) {
      throw new Error(`Server exited before becoming ready (code ${serverProcess.exitCode}).`);
    }
    try {
      const response = await fetch(`${BASE_URL}/api/auth/me`);
      if (response.status === 401) return;
    } catch (_error) {
      // The server is still connecting to MongoDB or opening its listener.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Timed out waiting for the test API to start.");
}

async function request(pathname, { token, method = "GET", body } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const response = await fetch(`${BASE_URL}${pathname}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let data;
  try { data = text ? JSON.parse(text) : null; } catch (_error) { data = text; }
  return { status: response.status, data };
}

async function register(username) {
  const response = await request("/api/auth/register", {
    method: "POST",
    body: {
      username,
      email: `${username}@example.test`,
      password: "test-password-12345",
    },
  });
  assert.equal(response.status, 201, JSON.stringify(response.data));
  return response.data;
}

function connectSocket(token) {
  return new Promise((resolve, reject) => {
    const socket = io(BASE_URL, {
      auth: token ? { token } : {},
      reconnection: false,
      timeout: 5000,
      transports: ["websocket"],
    });
    sockets.push(socket);
    socket.once("connect", () => resolve(socket));
    socket.once("connect_error", (error) => {
      socket.disconnect();
      reject(error);
    });
  });
}

function expectSocketRejected(token) {
  return new Promise((resolve, reject) => {
    const socket = io(BASE_URL, {
      auth: token ? { token } : {},
      reconnection: false,
      timeout: 5000,
      transports: ["websocket"],
    });
    sockets.push(socket);
    socket.once("connect", () => {
      socket.disconnect();
      reject(new Error("An unauthenticated socket unexpectedly connected."));
    });
    socket.once("connect_error", () => {
      socket.disconnect();
      resolve();
    });
  });
}

function emitAck(socket, event, payload) {
  return new Promise((resolve, reject) => {
    socket.timeout(5000).emit(event, payload, (error, response) => {
      if (error) return reject(error);
      return resolve(response);
    });
  });
}

test("HTTP and Socket.IO enforce authentication, membership and sender ownership", async (t) => {
  assert.ok(process.env.TEST_MONGO_URL, "TEST_MONGO_URL must point to the CI MongoDB service");
  serverProcess = spawn(process.execPath, [path.join(__dirname, "..", "index.js")], {
    cwd: path.join(__dirname, "..", ".."),
    env: {
      ...process.env,
      PORT: String(PORT),
      MONGO_URL: mongoUrl,
      JWT_SECRET,
      CORS_ORIGIN: BASE_URL,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let serverOutput = "";
  serverProcess.stdout.on("data", (chunk) => { serverOutput += chunk.toString(); });
  serverProcess.stderr.on("data", (chunk) => { serverOutput += chunk.toString(); });

  try {
    await waitForServer();

    const unauthenticatedHistory = await request("/api/conversations");
    assert.equal(unauthenticatedHistory.status, 401);
    const unauthenticatedUpload = await request("/upload?conversationId=000000000000000000000001", { method: "POST" });
    assert.equal(unauthenticatedUpload.status, 401);
    await expectSocketRejected();

    const suffix = String(process.pid);
    const alice = await register(`alice_${suffix}`);
    const bob = await register(`bob___${suffix}`);
    const mallory = await register(`mallory_${suffix}`);

    const create = await request("/api/conversations", {
      token: alice.token,
      method: "POST",
      body: { username: bob.user.username },
    });
    assert.equal(create.status, 200, JSON.stringify(create.data));
    const conversationId = create.data.conversation._id;
    assert.ok(conversationId);

    const memberHistory = await request(`/api/conversations/${conversationId}/messages`, { token: bob.token });
    assert.equal(memberHistory.status, 200);
    const outsiderHistory = await request(`/api/conversations/${conversationId}/messages`, { token: mallory.token });
    assert.equal(outsiderHistory.status, 404);
    const outsiderUpload = await request(`/upload?conversationId=${conversationId}`, {
      token: mallory.token,
      method: "POST",
    });
    assert.equal(outsiderUpload.status, 404);

    const aliceSocket = await connectSocket(alice.token);
    const bobSocket = await connectSocket(bob.token);
    const mallorySocket = await connectSocket(mallory.token);

    assert.deepEqual(await emitAck(aliceSocket, "join_conversation", conversationId), { ok: true });
    assert.deepEqual(await emitAck(bobSocket, "join_conversation", conversationId), { ok: true });
    const outsiderJoin = await emitAck(mallorySocket, "join_conversation", conversationId);
    assert.equal(outsiderJoin.ok, false);

    const received = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Conversation member did not receive the message.")), 5000);
      bobSocket.once("receive_message", (message) => {
        clearTimeout(timeout);
        resolve(message);
      });
    });
    const sent = await emitAck(aliceSocket, "send_message", {
      conversationId,
      sender: "forged-admin",
      content: "private conversation test",
    });
    assert.equal(sent.ok, true);
    const message = await received;
    assert.equal(message.sender, alice.user.username);
    assert.notEqual(message.sender, "forged-admin");
    assert.equal(String(message.conversationId), String(conversationId));

    const outsiderSend = await emitAck(mallorySocket, "send_message", {
      conversationId,
      sender: alice.user.username,
      content: "unauthorized injection",
    });
    assert.equal(outsiderSend.ok, false);

    const participantDelete = await request(`/messages/${sent.messageId}`, {
      token: bob.token,
      method: "DELETE",
    });
    assert.equal(participantDelete.status, 404);

    const outsiderDelete = await request(`/messages/${sent.messageId}`, {
      token: mallory.token,
      method: "DELETE",
    });
    assert.equal(outsiderDelete.status, 404);

    mallorySocket.emit("mark_as_read", { messageId: sent.messageId, conversationId });
    await new Promise((resolve) => setTimeout(resolve, 150));
    const afterUnauthorizedRead = await request(
      `/api/conversations/${conversationId}/messages`,
      { token: bob.token }
    );
    assert.equal(afterUnauthorizedRead.status, 200);
    assert.equal(afterUnauthorizedRead.data[0].read, false);

    bobSocket.emit("mark_as_read", { messageId: sent.messageId, conversationId });
    let afterAuthorizedRead;
    const readDeadline = Date.now() + 3000;
    do {
      await new Promise((resolve) => setTimeout(resolve, 100));
      afterAuthorizedRead = await request(
        `/api/conversations/${conversationId}/messages`,
        { token: bob.token }
      );
    } while (afterAuthorizedRead.data?.[0]?.read !== true && Date.now() < readDeadline);
    assert.equal(afterAuthorizedRead.status, 200);
    assert.equal(afterAuthorizedRead.data[0].read, true);

    const ownerDelete = await request(`/messages/${sent.messageId}`, {
      token: alice.token,
      method: "DELETE",
    });
    assert.equal(ownerDelete.status, 200);
  } catch (error) {
    error.message += `\nTest server output:\n${serverOutput}`;
    throw error;
  } finally {
    for (const socket of sockets) socket.disconnect();
    if (serverProcess && serverProcess.exitCode === null) {
      serverProcess.kill("SIGTERM");
      await new Promise((resolve) => {
        const timer = setTimeout(resolve, 3000);
        serverProcess.once("exit", () => {
          clearTimeout(timer);
          resolve();
        });
      });
    }
  }
});
