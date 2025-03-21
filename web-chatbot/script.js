document.addEventListener("DOMContentLoaded", function () {
    const chatbox = document.getElementById("chatbox");
    const userInput = document.getElementById("userInput");
    const sessionList = document.getElementById("sessionList");
    const micButton = document.getElementById("micButton");
    const recordingIndicator = document.getElementById("recordingIndicator");
    const ttsToggle = document.getElementById("ttsToggle");
    const goLiveButton = document.getElementById("goLiveButton");
    const liveChatOverlay = document.getElementById("liveChatOverlay");
    const countdown = document.getElementById("countdown");
    const liveChatUI = document.getElementById("liveChatUI");
    const endLiveChat = document.getElementById("endLiveChat");
    const timer = document.querySelector(".timer");
    const themeToggle = document.querySelector('.theme-button');

    let sessionId = localStorage.getItem("sessionId") || generateSessionId();
    let currentRecognition = null;
    let isRecording = false;
    let isTtsEnabled = localStorage.getItem("ttsEnabled") === "true" || false;
    let isLiveMode = false;
    let liveRecognition = null;
    let timerInterval = null;
    let timeLeft = 10;
    let isAgentSpeaking = false;
    let isListening = false;
    let lastVoiceDetectedTime = 0;
    let voiceCheckInterval = null;
    let isDarkMode = localStorage.getItem('theme') === 'dark';

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
        if (event.code === "Escape" && isLiveMode) {
            endLiveMode(true);
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

        try {
            // Update last chat time on the server
            await fetch(`http://localhost:5000/sessions/${sessionId}/update-time`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" }
            });

            // Send the message to the server
            const response = await fetch("http://localhost:5000/chat", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ message: userMessage, sessionId })
            });

            // Refresh the sessions list to update order
            loadSessions();

            // Display user message in chatbox
            chatbox.innerHTML += `<p class="user-message"><strong>You:</strong> ${userMessage}</p>`;
            userInput.value = "";
            
            // Hide send button since input is now empty
            document.getElementById("sendVoiceButton").classList.add("hidden");

            const data = await response.json();
            const aiMessage = data.reply;

            // Display AI response in chatbox
            chatbox.innerHTML += `<p class="ai-message"><strong>AI:</strong> ${aiMessage}</p>`;
            chatbox.scrollTop = chatbox.scrollHeight; // Auto-scroll to latest message

            // Speak AI response
            speakText(aiMessage);

        } catch (error) {
            console.error("Error sending message:", error);
            chatbox.innerHTML += `<p class="ai-message"><strong>AI:</strong> ❌ Error connecting to server.</p>`;
        }
    }

    // Function to start a new chat
    async function startNewChat() {
        console.log("Starting new chat...");
        
        // Check if current chat is empty
        const chatbox = document.getElementById("chatbox");
        if (chatbox.innerHTML.trim() === "") {
            console.log("Current chat is empty, not creating new chat");
            return;
        }
        
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

    // Function to delete a chat session
    async function deleteSession(sessionToDelete) {
        try {
            const response = await fetch(`http://localhost:5000/sessions/${sessionToDelete}`, {
                method: "DELETE",
                headers: { "Content-Type": "application/json" }
            });
            
            if (response.ok) {
                // If the deleted session was the current one, clear the chat
                if (sessionToDelete === sessionId) {
                    chatbox.innerHTML = "";
                    userInput.value = "";
                    document.getElementById("sendVoiceButton").classList.add("hidden");
                }
                // Refresh the sessions list
                loadSessions();
            } else {
                console.error("Failed to delete session");
            }
        } catch (error) {
            console.error("Error deleting session:", error);
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

        // Format date
        const dateStr = date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric'
        });

        // Return full timestamp
        return `${dateStr} ${timeStr}`;
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
            
            // Sort sessions by last chat time (newest first)
            const sortedSessions = data.sessions.sort((a, b) => {
                // If this is the active session, keep it at the top
                if (a.id === sessionId) return -1;
                if (b.id === sessionId) return 1;
                // Otherwise sort by last chat time
                return b.lastChatTime - a.lastChatTime;
            });

            // Create session buttons
            sortedSessions.forEach(session => {
                const sessionButton = document.createElement("div");
                sessionButton.className = "session-item";
                if (session.id === sessionId) {
                    sessionButton.classList.add("active");
                }
                
                // Create session info div
                const sessionInfo = document.createElement("div");
                sessionInfo.className = "session-info";
                
                // Add title with edit functionality
                const titleDiv = document.createElement("div");
                titleDiv.className = "session-title";
                
                const titleText = document.createElement("div");
                titleText.className = "session-title-text";
                titleText.textContent = session.title;
                titleText.setAttribute('data-original-title', session.title); // Store the current title
                
                // Add timestamp
                const timestampDiv = document.createElement("div");
                timestampDiv.className = "session-timestamp";
                timestampDiv.textContent = formatTimestamp(session.lastChatTime);
                
                // Create actions div
                const actionsDiv = document.createElement("div");
                actionsDiv.className = "session-actions";
                
                // Create edit button
                const editButton = document.createElement("button");
                editButton.className = "edit-session";
                editButton.innerHTML = "✎";
                editButton.onclick = (e) => {
                    e.stopPropagation();
                    
                    // Create input element
                    const input = document.createElement("input");
                    input.type = "text";
                    input.className = "session-title-input";
                    input.value = titleText.textContent; // Use current displayed text
                    
                    // Replace title text with input
                    titleText.textContent = "";
                    titleText.classList.add("editing");
                    titleText.appendChild(input);
                    input.focus();
                    
                    // Handle input events
                    input.onblur = async () => {
                        const newTitle = input.value.trim();
                        if (newTitle && newTitle !== titleText.getAttribute('data-original-title')) {
                            try {
                                const response = await fetch(`http://localhost:5000/sessions/${session.id}/title`, {
                                    method: "PUT",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({ title: newTitle })
                                });
                                
                                if (response.ok) {
                                    titleText.textContent = newTitle;
                                    titleText.setAttribute('data-original-title', newTitle); // Update stored title
                                    titleText.classList.remove("editing");
                                } else {
                                    titleText.textContent = titleText.getAttribute('data-original-title');
                                    titleText.classList.remove("editing");
                                    console.error("Failed to update chat title");
                                }
                            } catch (error) {
                                titleText.textContent = titleText.getAttribute('data-original-title');
                                titleText.classList.remove("editing");
                                console.error("Error updating chat title:", error);
                            }
                        } else {
                            titleText.textContent = titleText.getAttribute('data-original-title');
                            titleText.classList.remove("editing");
                        }
                    };
                    
                    input.onkeydown = (e) => {
                        if (e.key === "Enter") {
                            input.blur();
                        } else if (e.key === "Escape") {
                            titleText.textContent = titleText.getAttribute('data-original-title');
                            titleText.classList.remove("editing");
                        }
                    };
                };
                
                // Create delete button
                const deleteButton = document.createElement("button");
                deleteButton.className = "delete-session";
                deleteButton.innerHTML = "×";
                deleteButton.onclick = async (e) => {
                    e.stopPropagation();
                    if (confirm("Are you sure you want to delete this chat session?")) {
                        try {
                            const response = await fetch(`http://localhost:5000/sessions/${session.id}`, {
                                method: "DELETE",
                                headers: { "Content-Type": "application/json" }
                            });
                            
                            if (response.ok) {
                                if (session.id === sessionId) {
                                    chatbox.innerHTML = "";
                                    userInput.value = "";
                                    document.getElementById("sendVoiceButton").classList.add("hidden");
                                    sessionId = generateSessionId();
                                }
                                loadSessions();
                            } else {
                                console.error("Failed to delete session");
                                alert("Failed to delete session. Please try again.");
                            }
                        } catch (error) {
                            console.error("Error deleting session:", error);
                            alert("Error deleting session. Please try again.");
                        }
                    }
                };
                
                // Add buttons to actions div
                actionsDiv.appendChild(editButton);
                actionsDiv.appendChild(deleteButton);
                
                // Add elements to title div
                titleDiv.appendChild(titleText);
                
                // Add elements to session info
                sessionInfo.appendChild(titleDiv);
                sessionInfo.appendChild(timestampDiv);
                
                // Add click handler for session selection
                sessionInfo.onclick = () => {
                    document.querySelectorAll('.session-item').forEach(item => item.classList.remove('active'));
                    sessionButton.classList.add('active');
                    sessionId = session.id;
                    localStorage.setItem("sessionId", session.id);
                    loadChat(session.id);
                };
                
                // Add elements to session button
                sessionButton.appendChild(sessionInfo);
                sessionButton.appendChild(actionsDiv);
                sessionList.appendChild(sessionButton);
            });
        } catch (error) {
            console.error("Error loading sessions:", error);
            sessionList.innerHTML = '<div class="error">Failed to load sessions</div>';
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
                    elements.statusText.textContent = "🎙️ Listening...";
                    Object.values(elements).forEach(el => el?.classList.add("listening"));
                } else {
                    elements.statusText.textContent = "🎙️ Speak Now";
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

    // Go Live button click handler
    goLiveButton.addEventListener("click", startLiveMode);
    endLiveChat.addEventListener("click", () => endLiveMode(true));

    async function startLiveMode() {
        isLiveMode = true;
        liveChatOverlay.classList.remove("hidden");
        
        // Start countdown
        countdown.classList.remove("hidden");
        liveChatUI.classList.add("hidden");
        
        // Simple countdown
        const countdownNumber = countdown.querySelector(".countdown-number");
        for (let i = 3; i > 0; i--) {
            countdownNumber.textContent = i;
            await new Promise(resolve => setTimeout(resolve, 800));
        }
        
        countdown.classList.add("hidden");
        liveChatUI.classList.remove("hidden");
        
        // Initialize speech recognition
        initializeSpeechRecognition();
        updateLiveChatStatus("speak");
    }

    function initializeSpeechRecognition() {
        try {
            const recognition = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
            liveRecognition = recognition;
            
            recognition.lang = "en-US";
            recognition.continuous = false;
            recognition.interimResults = true;

            recognition.onstart = function() {
                console.log("Recognition started");
                isListening = false;
                isAgentSpeaking = false;
                updateLiveChatStatus("speak");
            };

            recognition.onaudiostart = function() {
                console.log("Audio started");
            };

            recognition.onsoundstart = function() {
                console.log("Sound detected");
                if (!isAgentSpeaking) {
                    isListening = true;
                    lastVoiceDetectedTime = Date.now();
                    updateLiveChatStatus("listening");
                }
            };

            recognition.onsoundend = function() {
                console.log("Sound ended");
                if (!isAgentSpeaking) {
                    isListening = false;
                    updateLiveChatStatus("speak");
                }
            };

            recognition.onresult = async function(event) {
                if (isAgentSpeaking) {
                    console.log("Ignoring result while agent is speaking");
                    return;
                }

                const result = event.results[event.results.length - 1];
                lastVoiceDetectedTime = Date.now();

                if (!result.isFinal) {
                    isListening = true;
                    updateLiveChatStatus("listening");
                    return;
                }

                const transcript = result[0].transcript.trim();
                if (transcript) {
                    console.log("Final transcript:", transcript);
                    recognition.stop();
                    isListening = false;
                    
                    try {
                        console.log("Sending to server...");
                        const response = await fetch("http://localhost:5000/live-chat", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ message: transcript })
                        });

                        const data = await response.json();
                        
                        // Update to agent speaking state
                        isAgentSpeaking = true;
                        isListening = false;
                        updateLiveChatStatus("agent");
                        
                        const speech = new SpeechSynthesisUtterance(data.reply);
                        
                        speech.onstart = function() {
                            console.log("Agent started speaking");
                            isAgentSpeaking = true;
                            isListening = false;
                            updateLiveChatStatus("agent");
                            if (liveRecognition) {
                                liveRecognition.stop();
                            }
                        };

                        speech.onend = function() {
                            console.log("Agent finished speaking");
                            isAgentSpeaking = false;
                            isListening = false;
                            if (isLiveMode) {
                                updateLiveChatStatus("speak");
                                try {
                                    recognition.start();
                                } catch (error) {
                                    console.error("Error restarting recognition:", error);
                                }
                            }
                        };

                        window.speechSynthesis.speak(speech);
                        
                    } catch (error) {
                        console.error("Error in live chat:", error);
                        endLiveMode(true);
                    }
                }
            };

            recognition.onend = function() {
                console.log("Recognition ended");
                if (!isAgentSpeaking && !isListening) {
                    updateLiveChatStatus("speak");
                }
                
                if (isLiveMode && !isAgentSpeaking) {
                    console.log("Restarting recognition");
                    try {
                        recognition.start();
                    } catch (error) {
                        console.error("Error restarting recognition:", error);
                    }
                }
            };

            recognition.onerror = function(event) {
                console.error("Recognition error:", event.error);
                if (event.error !== 'no-speech') {
                    endLiveMode(true);
                }
            };

            recognition.start();
            
        } catch (error) {
            console.error("Error initializing speech recognition:", error);
            endLiveMode(true);
        }
    }

    function updateLiveChatStatus(status) {
        console.log("Updating live status to:", status);
        const statusCircle = document.querySelector(".live-status-circle");
        const statusText = document.querySelector(".live-status-text");
        
        if (!statusCircle || !statusText) {
            console.error("Live status elements not found");
            return;
        }

        // First, remove all status classes
        statusCircle.classList.remove("listening", "agent-speaking");
        statusText.classList.remove("speak", "listening", "agent");
        
        // Update both the class and text together based on status
        switch(status) {
            case "speak":
                statusCircle.style.borderColor = "#ff4b4b";
                statusText.textContent = "Speak Now";
                statusText.classList.add("speak");
                break;
            case "listening":
                statusCircle.classList.add("listening");
                statusText.textContent = "Listening...";
                statusText.classList.add("listening");
                break;
            case "agent":
                statusCircle.classList.add("agent-speaking");
                statusText.textContent = "Agent Speaking";
                statusText.classList.add("agent");
                break;
        }
    }

    function endLiveMode(withAnimation = true) {
        console.log("Ending live mode");
        if (!isLiveMode) return;
        
        isLiveMode = false;
        isAgentSpeaking = false;
        isListening = false;
        
        if (voiceCheckInterval) {
            clearInterval(voiceCheckInterval);
            voiceCheckInterval = null;
        }
        
        window.speechSynthesis.cancel();
        
        if (liveRecognition) {
            liveRecognition.stop();
            liveRecognition = null;
        }
        
        if (withAnimation) {
            liveChatOverlay.classList.add("exiting");
            setTimeout(() => {
                liveChatOverlay.classList.remove("exiting");
                liveChatOverlay.classList.add("hidden");
                liveChatUI.classList.add("hidden");
            }, 300);
        } else {
            liveChatOverlay.classList.add("hidden");
            liveChatUI.classList.add("hidden");
        }
    }

    // Initialize theme state
    updateThemeState();

    // Theme toggle click handler
    themeToggle.addEventListener("click", () => {
        isDarkMode = !isDarkMode;
        localStorage.setItem('theme', isDarkMode ? 'dark' : 'light');
        updateThemeState();
    });

    function updateThemeState() {
        document.documentElement.setAttribute('data-theme', isDarkMode ? 'dark' : 'light');
        themeToggle.title = `Switch to ${isDarkMode ? 'light' : 'dark'} mode`;
        
        // Update theme icon
        themeToggle.innerHTML = isDarkMode 
            ? '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"></path></svg>'
            : '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"></path></svg>';
    }

    // Search functionality
    const searchButton = document.getElementById('searchButton');
    const searchContainer = document.getElementById('searchContainer');
    const searchInput = document.getElementById('searchInput');
    const searchInfo = document.querySelector('.search-info');
    let isSearchActive = false;

    searchButton.addEventListener('click', () => {
        isSearchActive = !isSearchActive;
        searchContainer.classList.toggle('active', isSearchActive);
        searchInfo.classList.toggle('visible', isSearchActive);
        if (isSearchActive) {
            searchInput.focus();
        } else {
            searchInput.value = '';
            performSearch(''); // Clear search
        }
    });

    function highlightText(text, searchTerm) {
        if (!searchTerm) return text;
        const regex = new RegExp(`(${searchTerm})`, 'gi');
        return text.replace(regex, '<span class="highlight">$1</span>');
    }

    function performSearch(searchTerm) {
        const sessionItems = document.querySelectorAll('.session-item');
        let matchCount = 0;
        
        sessionItems.forEach(item => {
            const titleElement = item.querySelector('.session-title-text');
            const currentTitle = titleElement.textContent;
            
            if (!searchTerm) {
                // Reset to original state
                item.classList.remove('search-match', 'search-hidden');
                item.style.order = '';
                item.style.display = ''; // Show all items
            } else {
                const titleMatch = currentTitle.toLowerCase().includes(searchTerm.toLowerCase());
                
                if (titleMatch) {
                    matchCount++;
                    titleElement.innerHTML = highlightText(currentTitle, searchTerm);
                    item.classList.add('search-match');
                    item.classList.remove('search-hidden');
                    item.style.order = '-1'; // Move matching items to top
                    item.style.display = 'flex'; // Show matching items
                } else {
                    titleElement.textContent = currentTitle;
                    item.classList.remove('search-match');
                    item.classList.add('search-hidden');
                    item.style.order = '1'; // Move non-matching items to bottom
                    item.style.display = 'none'; // Hide non-matching items
                }
            }
        });

        // Update results count
        const resultsCountElement = document.querySelector('.results-count');
        if (searchTerm) {
            resultsCountElement.textContent = `${matchCount} result${matchCount !== 1 ? 's' : ''}`;
        } else {
            resultsCountElement.textContent = '0 results';
        }
    }

    let searchTimeout;
    searchInput.addEventListener('input', (e) => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            performSearch(e.target.value.trim());
        }, 200); // Debounce search for better performance
    });

    // Clear search when clicking outside
    document.addEventListener('click', (e) => {
        if (!searchContainer.contains(e.target) && !searchButton.contains(e.target)) {
            isSearchActive = false;
            searchContainer.classList.remove('active');
            searchInfo.classList.remove('visible');
            searchInput.value = '';
            performSearch('');
        }
    });

    // Update new chat button click handler
    document.getElementById('newChatButton').addEventListener('click', startNewChat);
});
