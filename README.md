# Chat App

A real-time chat application built with React (frontend) and Node.js with Socket.io (backend).

## Project Structure

```
chat-app/
├── client/                 # React frontend
│   ├── public/
│   ├── src/
│   │   ├── components/     # React components
│   │   │   ├── ChatBox.js
│   │   │   ├── Message.js
│   │   │   └── Sidebar.js
│   │   ├── App.js          # Main app with Socket.io connection
│   │   ├── App.css
│   │   └── index.js
│   └── package.json
├── server/                 # Node.js backend
│   ├── models/
│   │   ├── User.js         # User schema
│   │   └── Message.js      # Message schema
│   ├── routes/
│   │   ├── auth.js         # Authentication routes
│   │   └── messages.js     # Message routes
│   └── index.js            # Express & Socket.io setup
├── package.json            # Root dependencies
└── README.md
```

## Getting Started

### Prerequisites
- Node.js v14+
- npm or yarn

### Installation

1. **Install server dependencies:**
   ```bash
   npm install
   ```

2. **Install client dependencies:**
   ```bash
   cd client
   npm install
   cd ..
   ```

### Running the Application

1. **Start the server:**
   ```bash
   npm run dev
   ```
   The server will run on `http://localhost:4000`

2. **In a new terminal, start the client:**
   ```bash
   cd client
   npm start
   ```
   The app will open at `http://localhost:3000`

## Features

- Real-time messaging using Socket.io
- User authentication (register/login)
- Online users list
- Message history
- Password hashing with bcryptjs
- JWT authentication tokens

## Technologies Used

**Frontend:**
- React
- Socket.io Client
- Axios

**Backend:**
- Express.js
- Socket.io
- MongoDB (Mongoose)
- bcryptjs
- jsonwebtoken

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register a new user
- `POST /api/auth/login` - Login user

### Messages
- `GET /api/messages/:senderId/:receiverId` - Get messages between users
- `POST /api/messages/send` - Send a message
- `PATCH /api/messages/:messageId/read` - Mark message as read

## Socket Events

**Client → Server:**
- `join` - User joins the chat
- `send_message` - Send a message

**Server → Client:**
- `receive_message` - Receive a message
- `users_list` - Get list of online users

## Notes

- Update MongoDB connection string in `server/index.js`
- Set `JWT_SECRET` in environment variables for production
- Configure CORS origins as needed
