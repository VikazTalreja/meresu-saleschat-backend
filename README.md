# Backend - Chat Application

## Overview
This is the backend part of a real-time chat application, built with Node.js and Express. It handles real-time communication using Socket.io and integrates with the Groq API for AI-powered conversation analysis and response generation.

## Features
- Real-time communication with Socket.io
- Integration with Groq API for AI chat responses
- Parsing of AI responses into structured options
- Goal-oriented conversation processing
- CORS configuration for secure cross-origin requests

## Setup Instructions
1. **Navigate to the backend directory**
   ```bash
   cd backend
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure Environment Variables**
   Create a `.env` file in the backend directory with the following variables:
   ```
   GROQ_API_KEY=your_groq_api_key_here
   PORT=5000
   FRONTEND_URL=http://localhost:3000
   ```

4. **Run the server**
   ```bash
   node index.js
   ```
   The server will run on [http://localhost:5000](http://localhost:5000) by default.

## Code Flow and Variables Explanation

### Server Setup
The backend initializes an Express server with Socket.io integration and configures CORS to allow connections from the frontend:
```javascript
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const axios = require('axios');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
    methods: ["GET", "POST"]
  }
});
```

### Socket.io Event Handling
The server listens for various events from connected clients:
- `connection`: Handles new client connections
- `disconnect`: Manages client disconnections
- `chat-message`: Processes incoming chat messages and goals
- `request-parsed-options`: Responds to requests for previously parsed option
### Key Functions
- `queryDeepseek(userMessage)`: Sends the conversation context and goal to the Groq API and returns the AI response
- `parseOptions(text)`: Parses the AI response to extract structured options with scores
- `extractJsonFromText(text)`: Helper function to extract JSON data from the AI response

### Environment Variables
- `GROQ_API_KEY`: API key for accessing the Groq AI service
- `PORT`: The port on which the server runs
- `FRONTEND_URL`: The URL of the frontend application for CORS configuration

### Data Flow
1. Client connects to the server via Socket.io
2. Client sends chat messages and goal to the server
3. Server processes the messages and goal using the Groq API
4. Server parses the AI response into structured options
5. Server sends the parsed options back to the client
6. Client displays the options and updates the UI

### System Prompt
The backend uses a carefully crafted system prompt to guide the AI in generating appropriate responses:
```javascript
const systemPrompt = `You are a helpful assistant that analyzes conversations between a customer and a sales representative.
${goal ? `The conversation goal is: "${goal}". Keep this goal in mind when generating options.` : ''}
Based on the conversation so far, generate 3-5 options for what the sales representative could say next.
Each option should be different in approach or content.
For each option, assign a score from 0.0 to 1.0 indicating how effective you think it would be.
...`;
```

## Usage
- The server listens for chat messages containing conversation context and goals
- It processes these inputs through the Groq API to generate intelligent responses
- It parses the responses into structured options with effectiveness scores
- It emits these parsed options back to the client for display

## Technologies Used
- Node.js
- Express
- Socket.io for real-time communication
- Axios for HTTP requests
- Groq API for AI-powered conversation analysis
- dotenv for environment variable management

## License
This project is licensed under the MIT License. 