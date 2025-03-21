// Load environment variables from .env file
require("dotenv").config();

// Import OpenAI package to interact with the AI
const { OpenAI } = require("openai");

// Import readline-sync to take user input from the console
const readlineSync = require("readline-sync");

// Create an OpenAI instance using your API key from .env file
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY, // API key is stored securely in .env
});

// Store conversation history
let conversationHistory = [
  { role: "system", content: "You are a helpful AI assistant." }
];

// Function to start the chatbot
async function askChatGPT() {
  console.log("🤖 AI Chatbot is ready! Type your question or 'exit' to quit.");

  while (true) {
    // Get user input from the console
    const userInput = readlineSync.question("\nYou: ");

    // Check if the user wants to exit
    if (userInput.toLowerCase() === "exit") {
      console.log("Goodbye! 👋"); // Farewell message
      break; // Stop the loop and exit the chatbot
    }

    try {
      // Add user input to conversation history
      conversationHistory.push({ role: "user", content: userInput });

      // Send the conversation history to OpenAI
      const response = await openai.chat.completions.create({
        model: "gpt-3.5-turbo", // AI model to use
        messages: conversationHistory, // Send entire conversation
      });

      // Get AI's response
      const aiMessage = response.choices[0].message.content;

      // Add AI's response to conversation history
      conversationHistory.push({ role: "assistant", content: aiMessage });

      // Print AI's response in the console
      console.log("\n🤖 ChatGPT:", aiMessage);
    } catch (error) {
      // If an error occurs, show an error message instead of crashing
      console.error("\n❌ Oops! Something went wrong.");
      console.error("Error details:", error.message);
    }
  }
}

// Call the function to start the chatbot
askChatGPT();
