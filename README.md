# Real-Time Chat Application

A React and Socket.IO chat prototype with MongoDB message persistence and Cloudinary image uploads. This repository is an evolving portfolio project; it is **not yet suitable for real users or sensitive conversations**.

## Current implementation

- React client with a Socket.IO connection.
- Express and Socket.IO server.
- MongoDB persistence for the messages handled by the active server entry point.
- Message creation and broadcast, typing indicators, read-state events, and message deletion.
- Image upload through Cloudinary.
- Basic user and message Mongoose models.

## Architecture

```text
React client
  ├── HTTP: message history and image upload
  └── Socket.IO: send/receive, typing, read and delete events
             |
             v
Express + Socket.IO server
  ├── MongoDB / Mongoose
  └── Cloudinary image storage
```

## Tech stack

| Area | Technology |
|---|---|
| Client | React, Axios, Socket.IO Client |
| Server | Node.js, Express, Socket.IO |
| Database | MongoDB, Mongoose |
| Media | Multer, Cloudinary |
| Authentication-related packages | bcryptjs, jsonwebtoken |

## Run locally

### Requirements

- Node.js and npm
- MongoDB instance
- Cloudinary account for image uploads

### 1. Install server dependencies

From the repository root:

```bash
npm install
```

Create a root `.env` file:

```dotenv
PORT=5000
MONGO_URL=mongodb://127.0.0.1:27017/chat_app
CORS_ORIGIN=http://localhost:3000
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
```

Start the server:

```bash
npm run dev
```

### 2. Install and start the client

In a second terminal:

```bash
cd client
npm install
npm start
```

The current client expects the API and Socket.IO server at `http://localhost:5000` and runs on `http://localhost:3000`.

## Active server endpoints and events

| Type | Name | Purpose |
|---|---|---|
| HTTP | `GET /messages` | Load message history |
| HTTP | `POST /upload` | Upload an image |
| HTTP | `DELETE /messages/:id` | Delete a message |
| Socket | `send_message` | Submit a message |
| Socket | `receive_message` | Broadcast a saved message |
| Socket | `typing`, `stop_typing` | Typing indicators |
| Socket | `mark_as_read`, `message_read` | Read-state updates |
| Socket | `message_deleted` | Notify clients of deletion |

## Important engineering status

The active `server/index.js` entry point does not currently mount the separate authentication and message route modules. The current socket flow also trusts client-supplied sender information and broadcasts messages globally.

Before using this application beyond a local demo, the following work is required:

- Authenticate Socket.IO connections and derive sender identity from the verified session.
- Enforce conversation membership and message-level authorization on every read, write and delete.
- Replace global message broadcasts with authorized conversation rooms.
- Add request validation, rate limits, upload size/type enforcement and safe error responses.
- Add pagination, indexes, integration tests and a deployment-aware client API URL.
- Configure secrets through the hosting provider; never commit credentials.

Do not use real personal, confidential or sensitive message data with the current implementation.

## Roadmap

- [ ] Integrate and test authentication in the active server entry point.
- [ ] Add private conversation and membership authorization.
- [ ] Harden Socket.IO event validation and room handling.
- [ ] Add automated API and realtime integration tests.
- [ ] Add production deployment configuration and genuine application screenshots.

## Maintainer

**Matiur Rahaman** · [GitHub](https://github.com/matiur25580)
