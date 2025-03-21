require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { OpenAI } = require("openai");

const app = express();
app.use(express.json());
app.use(cors());

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

// Store conversations for different sessions
let chatSessions = {};  // { sessionId: [{ role: "user", content: "..." }, { role: "assistant", content: "..." }] }

// Endpoint to create a new chat session
app.post("/sessions/new", (req, res) => {
    const sessionId = "session-" + Date.now();
    chatSessions[sessionId] = [
        { role: "system", content: "You are a helpful AI assistant." }
    ];
    res.json({ sessionId });
});

app.post("/chat", async (req, res) => {
    try {
        const { sessionId, message } = req.body;

        // Create a new session if it doesn't exist
        if (!chatSessions[sessionId]) {
            chatSessions[sessionId] = [
                { role: "system", content: "You are a helpful AI assistant." }
            ];
        }

        // Add user message to the conversation
        chatSessions[sessionId].push({ role: "user", content: message });

        // Get AI response
        const response = await openai.chat.completions.create({
            model: "gpt-3.5-turbo",
            messages: chatSessions[sessionId]
        });

        const aiMessage = response.choices[0].message.content;

        // Add AI response to conversation history
        chatSessions[sessionId].push({ role: "assistant", content: aiMessage });

        res.json({ reply: aiMessage, history: chatSessions[sessionId] });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Error generating response" });
    }
});

// Endpoint to list all sessions
app.get("/sessions", (req, res) => {
    res.json({ sessions: Object.keys(chatSessions) });
});

// Endpoint to get a specific chat history
app.get("/chat/:sessionId", (req, res) => {
    const sessionId = req.params.sessionId;
    res.json({ history: chatSessions[sessionId] || [] });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
