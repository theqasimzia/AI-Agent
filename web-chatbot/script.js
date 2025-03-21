document.addEventListener("DOMContentLoaded", function () {
    const chatbox = document.getElementById("chatbox");
    const userInput = document.getElementById("userInput");
    const sessionList = document.getElementById("sessionList");
    const micButton = document.getElementById("micButton");
    const recordingIndicator = document.getElementById("recordingIndicator");
    const ttsToggle = document.getElementById("ttsToggle");

    let sessionId = localStorage.getItem("sessionId") || generateSessionId();
    let currentRecognition = null;
    let isRecording = false;
    let isTtsEnabled = localStorage.getItem("ttsEnabled") === "true" || false;

    // Auto-resize textarea as user types
    function autoResizeTextarea() {
        userInput.style.height = 'auto';
        userInput.style.height = (userInput.scrollHeight) + 'px';
    }

    // Initialize textarea height
    autoResizeTextarea();

    // Add input and change event listeners for auto-resize
    userInput.addEventListener('input', autoResizeTextarea);
    userInput.addEventListener('change', autoResizeTextarea);

    // Handle global keyboard shortcuts
    document.addEventListener("keydown", function(event) {
        // Space to toggle listening (only if not typing in a text field)
        if (event.code === "Space" && !event.target.matches('textarea, input[type="text"]')) {
            event.preventDefault();
            if (isRecording) {
                stopListening();
            } else {
                startListening();
            }
        }
        // Escape to stop listening
        if (event.code === "Escape" && isRecording) {
            event.preventDefault();
            stopListening();
        }
    });

    // Handle input-specific keyboard shortcuts
    userInput.addEventListener("keydown", function(event) {
        // Enter to send message
        if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            // If there's text, send the message
            if (userInput.value.trim() !== "") {
                sendMessage();
                // If recording is active, reset recognition to start fresh
                if (isRecording && currentRecognition) {
                    try {
                        currentRecognition.stop();
                        currentRecognition.start();
                    } catch (error) {
                        console.error("Error resetting recognition:", error);
                    }
                }
            }
        }
    });

    // Function to generate a unique session ID
    function generateSessionId() {
        const newSessionId = "session-" + Date.now();
        localStorage.setItem("sessionId", newSessionId);
        return newSessionId;
    }

    // Add input event listener for showing/hiding send button
    userInput.addEventListener('input', function() {
        const sendVoiceButton = document.getElementById("sendVoiceButton");
        if (this.value.trim()) {
            sendVoiceButton.classList.remove("hidden");
        } else {
            sendVoiceButton.classList.add("hidden");
        }
    });

    async function sendMessage() {
        let userMessage = userInput.value.trim();
        if (!userMessage) return;

        // Display user message in chatbox
        chatbox.innerHTML += `<p class="user-message"><strong>You:</strong> ${userMessage}</p>`;
        userInput.value = "";
        
        // Hide send button since input is now empty
        document.getElementById("sendVoiceButton").classList.add("hidden");

        try {
            // Send user message with session ID to backend
            const response = await fetch("http://localhost:5000/chat", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ sessionId, message: userMessage })
            });

            const data = await response.json();
            const aiMessage = data.reply;

            // Display AI response in chatbox
            chatbox.innerHTML += `<p class="ai-message"><strong>AI:</strong> ${aiMessage}</p>`;
            chatbox.scrollTop = chatbox.scrollHeight; // Auto-scroll to latest message

            // Speak AI response
            speakText(aiMessage);

        } catch (error) {
            chatbox.innerHTML += `<p class="ai-message"><strong>AI:</strong> ❌ Error connecting to server.</p>`;
            console.error("Error:", error);
        }
    }

    // Function to start a new chat
    async function startNewChat() {
        console.log("Starting new chat...");
        try {
            // Create new session on the server
            const response = await fetch("http://localhost:5000/sessions/new", {
                method: "POST",
                headers: { "Content-Type": "application/json" }
            });
            console.log("Server response:", response);
            const data = await response.json();
            console.log("New session data:", data);
            
            // Update session ID
            sessionId = data.sessionId;
            localStorage.setItem("sessionId", sessionId);
            
            // Clear chat
            chatbox.innerHTML = "";
            
            // Clear input
            userInput.value = "";
            
            // Hide send button
            document.getElementById("sendVoiceButton").classList.add("hidden");
            
            // Refresh session list
            loadSessions();
            
            // Reset any recording state
            if (isRecording) {
                stopListening();
            }
        } catch (error) {
            console.error("Error creating new chat:", error);
            alert("Failed to create new chat. Please try again.");
        }
    }

    // Function to load previous chat history
    async function loadChat(sessionId) {
        console.log("Loading chat for session:", sessionId);
        chatbox.innerHTML = ""; // Clear chatbox
        try {
            const response = await fetch(`http://localhost:5000/chat/${sessionId}`);
            console.log("Chat history response:", response);
            const data = await response.json();
            console.log("Chat history data:", data);
            
            if (!data.history || !Array.isArray(data.history)) {
                console.error("Invalid chat history format:", data);
                return;
            }
            
            data.history.forEach(msg => {
                if (msg.role === "system") return; // Skip system messages
                let sender = msg.role === "user" ? "user-message" : "ai-message";
                chatbox.innerHTML += `<p class="${sender}"><strong>${msg.role === "user" ? "You" : "AI"}:</strong> ${msg.content}</p>`;
            });
            
            // Scroll to bottom
            chatbox.scrollTop = chatbox.scrollHeight;
        } catch (error) {
            console.error("Error loading chat:", error);
            chatbox.innerHTML = '<p class="ai-message"><strong>System:</strong> Failed to load chat history.</p>';
        }
    }

    // Function to load all sessions
    async function loadSessions() {
        console.log("Loading sessions...");
        try {
            const response = await fetch("http://localhost:5000/sessions");
            console.log("Sessions response:", response);
            const data = await response.json();
            console.log("Sessions data:", data);
            
            // Clear existing sessions
            sessionList.innerHTML = "";
            
            // Sort sessions by timestamp (newest first)
            const sortedSessions = data.sessions.sort((a, b) => {
                const timestampA = parseInt(a.split('-')[1]);
                const timestampB = parseInt(b.split('-')[1]);
                return timestampB - timestampA;
            });
            
            // Add sessions to the list
            sortedSessions.forEach(id => {
                let sessionBtn = document.createElement("button");
                const timestamp = id.split('-')[1];
                
                // Create title and timestamp elements
                const titleSpan = document.createElement("span");
                titleSpan.className = "chat-title";
                titleSpan.textContent = `Chat ${formatTimestamp(timestamp)}`;
                
                const timeSpan = document.createElement("span");
                timeSpan.className = "chat-time";
                timeSpan.textContent = formatTimestamp(timestamp, true);
                
                sessionBtn.appendChild(titleSpan);
                sessionBtn.appendChild(timeSpan);
                
                // Add active class if this is the current session
                if (id === sessionId) {
                    sessionBtn.classList.add('active');
                }
                
                sessionBtn.onclick = () => {
                    // Remove active class from all buttons
                    document.querySelectorAll('.sessions-list button').forEach(btn => {
                        btn.classList.remove('active');
                    });
                    // Add active class to clicked button
                    sessionBtn.classList.add('active');
                    sessionId = id;
                    localStorage.setItem("sessionId", id);
                    loadChat(id);
                };
                sessionList.appendChild(sessionBtn);
            });
        } catch (error) {
            console.error("Error loading sessions:", error);
            alert("Failed to load chat sessions. Please refresh the page.");
        }
    }

    // Enhanced timestamp formatting
    function formatTimestamp(timestamp, includeTime = false) {
        const date = new Date(parseInt(timestamp));
        const now = new Date();
        const diff = now - date;
        const seconds = Math.floor(diff / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);

        // Format time
        const timeStr = date.toLocaleTimeString('en-US', { 
            hour: 'numeric', 
            minute: '2-digit',
            hour12: true 
        });

        // If includeTime is false, just return the time
        if (!includeTime) {
            return timeStr;
        }

        // For the detailed timestamp
        if (days > 7) {
            return date.toLocaleDateString('en-US', { 
                month: 'short', 
                day: 'numeric',
                hour: 'numeric',
                minute: '2-digit'
            });
        } else if (days > 0) {
            return `${days}d ago`;
        } else if (hours > 0) {
            return `${hours}h ago`;
        } else if (minutes > 0) {
            return `${minutes}m ago`;
        } else {
            return 'Just now';
        }
    }

    // Load previous chat session
    loadChat(sessionId);
    loadSessions();

    window.sendMessage = sendMessage;
    window.startNewChat = startNewChat;

    // Function to start listening
    function startListening() {
        const recordingStatus = document.getElementById("recordingStatus");
        const statusText = recordingStatus.querySelector(".status-text");
        const userInput = document.getElementById("userInput");
        const sendVoiceButton = document.getElementById("sendVoiceButton");

        // If already recording, stop first
        if (isRecording) {
            stopListening();
            return;
        }

        // Clean up any existing recognition session
        if (currentRecognition) {
            try {
                currentRecognition.stop();
            } catch (error) {
                console.error("Error stopping existing recognition:", error);
            }
            currentRecognition = null;
        }

        try {
            const recognition = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
            currentRecognition = recognition;
            
            recognition.lang = "en-US";
            recognition.continuous = false;
            recognition.interimResults = true;

            let lastSoundTime = Date.now();
            let soundCheckInterval;
            let isSpeaking = false;
            let accumulatedText = '';  // Track accumulated text
            let isProcessingResult = false;  // Flag to prevent overlapping processing

            // Function to update UI for speaking state
            function updateUIForSpeaking(speaking) {
                const elements = {
                    status: recordingStatus,
                    statusText: statusText,
                    soundWaves: document.querySelector(".sound-waves"),
                    input: userInput
                };

                if (speaking) {
                    statusText.textContent = "🎙️ Listening...";
                    Object.values(elements).forEach(el => el?.classList.add("listening"));
                } else {
                    statusText.textContent = "🎙️ Speak Now";
                    Object.values(elements).forEach(el => el?.classList.remove("listening"));
                }
                userInput.focus();
            }

            // Function to check for silence
            function startSoundCheck() {
                if (soundCheckInterval) clearInterval(soundCheckInterval);
                soundCheckInterval = setInterval(() => {
                    const timeSinceLastSound = Date.now() - lastSoundTime;
                    if (timeSinceLastSound > 1000 && isSpeaking) {  // Reduced from 1500ms to 1000ms for faster response
                        isSpeaking = false;
                        updateUIForSpeaking(false);
                    }
                }, 100);
            }

            recognition.onstart = function() {
                isRecording = true;
                micButton.classList.add("recording");
                userInput.classList.add("recording");
                recordingStatus.classList.remove("hidden");
                updateUIForSpeaking(false);
                startSoundCheck();  // Start checking for sound
                // Keep any existing text in the input
                accumulatedText = userInput.value.trim();
                userInput.focus();
            };

            recognition.onsoundstart = function() {
                lastSoundTime = Date.now();
                if (!isSpeaking) {
                    isSpeaking = true;
                    updateUIForSpeaking(true);
                }
                userInput.focus();
            };

            recognition.onsoundend = function() {
                lastSoundTime = Date.now();
                // Don't immediately update UI, let the interval handle it
                userInput.focus();
            };

            recognition.onaudiostart = function() {
                lastSoundTime = Date.now();
                // Keep focus on input
                userInput.focus();
            };

            recognition.onresult = function(event) {
                if (isProcessingResult) return;
                isProcessingResult = true;

                lastSoundTime = Date.now();
                if (!isSpeaking) {
                    isSpeaking = true;
                    updateUIForSpeaking(true);
                }

                const result = event.results[event.results.length - 1];
                const transcript = result[0].transcript.trim();

                // Combine with accumulated text
                if (accumulatedText) {
                    userInput.value = accumulatedText + ' ' + transcript;
                } else {
                    userInput.value = transcript;
                }

                // Clean up multiple spaces and trim
                userInput.value = userInput.value.replace(/\s+/g, ' ').trim();

                // If this is a final result, update accumulated text
                if (result.isFinal) {
                    accumulatedText = userInput.value;
                }

                // Update UI
                autoResizeTextarea();
                if (userInput.value.trim()) {
                    sendVoiceButton.classList.remove("hidden");
                } else {
                    sendVoiceButton.classList.add("hidden");
                }

                isProcessingResult = false;  // Reset processing flag
                userInput.focus();
            };

            recognition.onerror = function(event) {
                console.error("Speech recognition error:", event.error);
                if (event.error === 'no-speech') {
                    // Just continue listening on no-speech error
                    return;
                }
                // For other errors, stop listening
                if (soundCheckInterval) {
                    clearInterval(soundCheckInterval);
                }
                stopListening();
            };

            recognition.onend = function() {
                if (soundCheckInterval) {
                    clearInterval(soundCheckInterval);
                }
                
                // Only restart if we're still supposed to be recording
                if (isRecording) {
                    setTimeout(() => {  // Add small delay before restarting
                        try {
                            recognition.start();
                        } catch (error) {
                            console.error("Error restarting recognition:", error);
                            stopListening();
                        }
                    }, 100);
                }
            };

            recognition.start();
        } catch (error) {
            console.error("Error starting speech recognition:", error);
            stopListening();
        }
    }

    // Function to stop listening
    function stopListening() {
        if (!isRecording) return;
        
        isRecording = false;
        micButton.classList.remove("recording");
        userInput.classList.remove("recording");
        document.getElementById("recordingStatus").classList.add("hidden");
        
        if (currentRecognition) {
            try {
                currentRecognition.stop();
            } catch (error) {
                console.error("Error stopping recognition:", error);
            }
            currentRecognition = null;
        }
    }

    // Make functions available globally
    window.startListening = startListening;
    window.stopListening = stopListening;

    // Send voice message function
    async function sendVoiceMessage() {
        let userMessage = userInput.value.trim();
        if (!userMessage) return;
    
        // Display user message in chatbox
        chatbox.innerHTML += `<p class="user-message"><strong>You:</strong> ${userMessage}</p>`;
        userInput.value = "";
        document.getElementById("sendVoiceButton").classList.add("hidden");
    
        try {
            // Send user message with session ID to backend
            const response = await fetch("http://localhost:5000/chat", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ sessionId, message: userMessage })
            });

            const data = await response.json();
            const aiMessage = data.reply;

            // Display AI response in chatbox
            chatbox.innerHTML += `<p class="ai-message"><strong>AI:</strong> ${aiMessage}</p>`;
            chatbox.scrollTop = chatbox.scrollHeight; // Auto-scroll to latest message

            // Speak AI response
            speakText(aiMessage);

        } catch (error) {
            chatbox.innerHTML += `<p class="ai-message"><strong>AI:</strong> ❌ Error connecting to server.</p>`;
            console.error("Error:", error);
        }
    }
    
    window.sendVoiceMessage = sendVoiceMessage;
    

    // 🔊 TEXT-TO-SPEECH: AI replies in voice
    function speakText(text) {
        if (!isTtsEnabled) return; // Don't speak if TTS is disabled
        
        const speech = new SpeechSynthesisUtterance();
        speech.text = text;
        speech.lang = "en-US";
        speech.volume = 1;
        speech.rate = 1;
        speech.pitch = 1;
        window.speechSynthesis.speak(speech);
    }

    // Initialize TTS toggle state
    updateTtsToggleState();

    // TTS toggle click handler
    ttsToggle.addEventListener("click", function() {
        isTtsEnabled = !isTtsEnabled;
        localStorage.setItem("ttsEnabled", isTtsEnabled);
        updateTtsToggleState();
    });

    function updateTtsToggleState() {
        if (isTtsEnabled) {
            ttsToggle.classList.add("active");
            ttsToggle.title = "Text-to-Speech: On";
        } else {
            ttsToggle.classList.remove("active");
            ttsToggle.title = "Text-to-Speech: Off";
        }
    }
});
