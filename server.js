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
let chatSessions = {};  // { sessionId: { messages: [], lastChatTime: timestamp, title: string } }

// Endpoint to create a new chat session
app.post("/sessions/new", (req, res) => {
    const sessionId = "session-" + Date.now();
    chatSessions[sessionId] = {
        messages: [{ role: "system", content: "You are a helpful AI assistant." }],
        lastChatTime: Date.now(),
        title: "New Chat"
    };
    res.json({ sessionId });
});

app.post("/chat", async (req, res) => {
    try {
        const { sessionId, message } = req.body;

        // Create a new session if it doesn't exist
        if (!chatSessions[sessionId]) {
            chatSessions[sessionId] = {
                messages: [{ role: "system", content: "You are a helpful AI assistant." }],
                lastChatTime: Date.now(),
                title: "New Chat"
            };
        }

        // Update last chat time
        chatSessions[sessionId].lastChatTime = Date.now();

        // Add user message to the conversation
        chatSessions[sessionId].messages.push({ role: "user", content: message });

        // Get AI response
        const response = await openai.chat.completions.create({
            model: "gpt-3.5-turbo",
            messages: chatSessions[sessionId].messages
        });

        const aiMessage = response.choices[0].message.content;

        // Add AI response to conversation history
        chatSessions[sessionId].messages.push({ role: "assistant", content: aiMessage });

        res.json({ 
            reply: aiMessage, 
            history: chatSessions[sessionId].messages,
            lastChatTime: chatSessions[sessionId].lastChatTime
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Error generating response" });
    }
});

// Endpoint to list all sessions
app.get("/sessions", (req, res) => {
    const sessionData = Object.entries(chatSessions).map(([id, data]) => ({
        id,
        lastChatTime: data.lastChatTime,
        title: data.title
    }));
    res.json({ sessions: sessionData });
});

// Endpoint to get a specific chat history
app.get("/chat/:sessionId", (req, res) => {
    const sessionId = req.params.sessionId;
    const session = chatSessions[sessionId];
    if (!session) {
        return res.json({ history: [] });
    }
    res.json({ 
        history: session.messages,
        lastChatTime: session.lastChatTime,
        title: session.title
    });
});

// Endpoint to update session title
app.put("/sessions/:sessionId/title", (req, res) => {
    try {
        const { sessionId } = req.params;
        const { title } = req.body;

        if (!sessionId || !chatSessions[sessionId]) {
            return res.status(404).json({ error: "Session not found" });
        }

        chatSessions[sessionId].title = title;
        res.json({ 
            success: true,
            sessionId,
            title
        });
    } catch (error) {
        console.error("Error updating session title:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});

// Live chat endpoint
app.post("/live-chat", async (req, res) => {
    try {
        const { message } = req.body;

        // Get AI response
        const response = await openai.chat.completions.create({
            model: "gpt-3.5-turbo",
            messages: [
                { role: "system", content: "You are a helpful AI assistant in a live voice chat. Keep responses concise and natural for speech." },
                { role: "user", content: message }
            ]
        });

        const aiMessage = response.choices[0].message.content;
        res.json({ reply: aiMessage });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Error generating response" });
    }
});

// Endpoint to delete a chat session
app.delete("/sessions/:sessionId", (req, res) => {
    try {
        const sessionId = req.params.sessionId;
        console.log("Attempting to delete session:", sessionId);
        
        if (!sessionId) {
            console.error("No session ID provided");
            return res.status(400).json({ error: "No session ID provided" });
        }

        if (!chatSessions[sessionId]) {
            console.error("Session not found:", sessionId);
            return res.status(404).json({ error: "Session not found" });
        }

        // Delete the session
        delete chatSessions[sessionId];
        console.log("Session deleted successfully:", sessionId);
        
        res.json({ 
            success: true, 
            message: "Session deleted successfully",
            sessionId: sessionId
        });
    } catch (error) {
        console.error("Error deleting session:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
