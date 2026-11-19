/* =========================================================
   VibeMate 2.0 - script.js
   Frontend logic: modes, chat display, image preview, settings,
   voice assistant, chat history, loading states, error handling
   and communication with the Flask backend
   ========================================================= */

/* ---------- 1. Find all the elements we need ---------- */
const sidebar = document.getElementById("sidebar");
const menuBtn = document.getElementById("menuBtn");
const newChatBtn = document.getElementById("newChatBtn");
const clearChatBtn = document.getElementById("clearChatBtn");
const modeButtons = document.querySelectorAll(".mode-btn");
const modeTitle = document.getElementById("modeTitle");
const modeSubtitle = document.getElementById("modeSubtitle");
const historyList = document.getElementById("historyList");

const welcomeScreen = document.getElementById("welcomeScreen");
const suggestionsBox = document.getElementById("suggestions");
const chatBox = document.getElementById("chatBox");

const userInput = document.getElementById("userInput");
const sendBtn = document.getElementById("sendBtn");
const micBtn = document.getElementById("micBtn");
const imageBtn = document.getElementById("imageBtn");
const imageInput = document.getElementById("imageInput");
const imagePreview = document.getElementById("imagePreview");
const previewImg = document.getElementById("previewImg");
const removeImageBtn = document.getElementById("removeImageBtn");

const settingsBtn = document.getElementById("settingsBtn");
const settingsModal = document.getElementById("settingsModal");
const closeSettingsBtn = document.getElementById("closeSettingsBtn");
const themeSelect = document.getElementById("themeSelect");
const fontSizeSelect = document.getElementById("fontSizeSelect");
const speakToggle = document.getElementById("speakToggle");
const enterToggle = document.getElementById("enterToggle");

/* ---------- 2. App state (values that change while using the app) ---------- */
let currentMode = "chat";
let currentConversationId = null;  // id of the saved chat (null = new chat not saved yet)
let selectedImage = null;          // the chosen image, stored as a data URL
let isWaiting = false;             // true while we wait for the AI reply
let historyLoadedOnce = false;     // used to show "Loading chats..." only the first time

const MAX_IMAGE_MB = 5;
const REQUEST_TIMEOUT_MS = 100000; // give up waiting for a reply after 100 seconds
const DEFAULT_PLACEHOLDER = userInput.placeholder;
const SEND_ICON = '<i class="fa-solid fa-paper-plane"></i>';
const SPINNER_ICON = '<i class="fa-solid fa-spinner fa-spin"></i>';

/* ---------- 3. Mode information ---------- */
const MODES = {
    chat: {
        title: "Smart Chat",
        subtitle: "Talk about anything with your AI best friend",
        prompts: [
            { icon: "fa-book-open", text: "Explain recursion in simple words", prompt: "Explain recursion in simple words with an example" },
            { icon: "fa-code", text: "Write a Python program to reverse a string", prompt: "Write a Python program to reverse a string and explain it" },
            { icon: "fa-face-laugh-beam", text: "Tell me a funny joke", prompt: "Tell me a funny joke to make my day better" },
            { icon: "fa-heart-pulse", text: "I feel stressed about exams", prompt: "I am feeling stressed about my exams. Can you cheer me up?" }
        ]
    },
    study: {
        title: "Study Buddy",
        subtitle: "Simple explanations and help with assignments",
        prompts: [
            { icon: "fa-book-open", text: "Explain normalization in DBMS", prompt: "Explain normalization in DBMS with simple examples" },
            { icon: "fa-graduation-cap", text: "Difference between process and thread", prompt: "What is the difference between a process and a thread?" },
            { icon: "fa-list-check", text: "Make a study plan for 3 days", prompt: "Make a 3-day study plan for my Operating Systems exam" },
            { icon: "fa-lightbulb", text: "Explain OSI model easily", prompt: "Explain the OSI model in an easy way with real-life examples" }
        ]
    },
    coding: {
        title: "Coding Assistant",
        subtitle: "Write, explain and debug code",
        prompts: [
            { icon: "fa-code", text: "Write a Python function for prime numbers", prompt: "Write a Python function to check whether a number is prime and explain it" },
            { icon: "fa-bug", text: "Help me debug my code", prompt: "I will paste my code. Please find the bug and explain how to fix it." },
            { icon: "fa-database", text: "Write a SQL query with JOIN", prompt: "Explain SQL INNER JOIN with a simple example query" },
            { icon: "fa-terminal", text: "Explain what an API is", prompt: "Explain what an API is in simple words with an example" }
        ]
    },
    fun: {
        title: "Fun Mode",
        subtitle: "Jokes, riddles and small games",
        prompts: [
            { icon: "fa-face-laugh-beam", text: "Tell me a programming joke", prompt: "Tell me a funny programming joke" },
            { icon: "fa-circle-question", text: "Give me a riddle", prompt: "Give me a fun riddle and wait for my answer" },
            { icon: "fa-dice", text: "Play a word guessing game", prompt: "Let's play a word guessing game. You think of a word and I will guess" },
            { icon: "fa-masks-theater", text: "Would you rather question", prompt: "Ask me a fun 'Would you rather' question" }
        ]
    },
    mood: {
        title: "Mood Support",
        subtitle: "A kind friend to talk to when you need it",
        prompts: [
            { icon: "fa-heart-pulse", text: "I feel stressed about exams", prompt: "I am feeling stressed about my exams. Can you cheer me up?" },
            { icon: "fa-cloud-sun", text: "I need some motivation", prompt: "I am feeling low on motivation today. Can you help me get going?" },
            { icon: "fa-spa", text: "Help me relax for a minute", prompt: "Guide me through a short relaxing breathing exercise" },
            { icon: "fa-face-smile", text: "Tell me something positive", prompt: "Tell me something positive to brighten my day" }
        ]
    },
    entertainment: {
        title: "Entertainment",
        subtitle: "Movie and music suggestions picked for you",
        prompts: [
            { icon: "fa-film", text: "Suggest a feel-good movie", prompt: "Suggest 5 feel-good movies I can watch this weekend" },
            { icon: "fa-music", text: "Songs to relax and study", prompt: "Suggest some calm songs I can listen to while studying" },
            { icon: "fa-tv", text: "Recommend a web series", prompt: "Recommend a good web series with a short reason for each" },
            { icon: "fa-headphones", text: "Create a happy playlist", prompt: "Create a happy 10-song playlist for me" }
        ]
    }
};

/* ---------- 4. Helper functions ---------- */

// Scroll the chat down to the newest message
function scrollToBottom() {
    chatBox.scrollTop = chatBox.scrollHeight;
}

// Turn plain text into safe HTML (so nobody can inject HTML or scripts)
function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
}

// Turn AI text into formatted HTML: code blocks, bold text and line breaks.
// Text is escaped first, so it is always safe.
function renderText(text) {
    const parts = text.split("```");
    let html = "";

    parts.forEach((part, index) => {
        if (index % 2 === 1) {
            // Odd parts are code blocks. Remove an optional language name on the first line.
            const code = part.replace(/^[a-zA-Z0-9+#-]*\n/, "");
            html += "<pre><code>" + escapeHtml(code.trim()) + "</code></pre>";
        } else {
            let normal = escapeHtml(part);
            normal = normal.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
            normal = normal.replace(/\n/g, "<br>");
            html += normal;
        }
    });
    return html;
}

// Show the chat area and hide the welcome screen
function showChatArea() {
    welcomeScreen.classList.add("hidden");
    chatBox.classList.remove("hidden");
}

// Show the welcome screen and hide the chat area
function showWelcome() {
    chatBox.classList.add("hidden");
    welcomeScreen.classList.remove("hidden");
}

// Show a small popup message at the top right (type: "info", "error" or "success")
function showToast(message, type = "info") {
    let box = document.getElementById("toastBox");
    if (!box) {
        box = document.createElement("div");
        box.id = "toastBox";
        box.className = "toast-box";
        document.body.appendChild(box);
    }

    const toast = document.createElement("div");
    toast.className = "toast " + type;
    toast.textContent = message;
    box.appendChild(toast);

    setTimeout(() => {
        toast.classList.add("hide");
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

// Turn the send button into a spinner while we wait for a reply
function setSendingState(isSending) {
    sendBtn.disabled = isSending;
    micBtn.disabled = isSending;
    sendBtn.innerHTML = isSending ? SPINNER_ICON : SEND_ICON;
}

/* ---------- 5. Building messages ---------- */

// Add one message bubble. role is "user" or "bot".
// options: { isError: true, onRetry: function } for failed replies.
function addMessage(role, text, imageSrc = null, options = {}) {
    showChatArea();

    const message = document.createElement("div");
    message.className = "message " + role;

    const avatar = document.createElement("div");
    avatar.className = "avatar";
    avatar.innerHTML = role === "user"
        ? '<i class="fa-solid fa-user"></i>'
        : '<i class="fa-solid fa-heart"></i>';

    const bubble = document.createElement("div");
    bubble.className = "bubble";
    if (options.isError) bubble.classList.add("error");

    if (imageSrc) {
        const img = document.createElement("img");
        img.src = imageSrc;
        img.alt = "Uploaded image";
        bubble.appendChild(img);
    }

    const content = document.createElement("div");
    // User text is shown as plain text. Bot text can contain formatted code.
    if (role === "user") {
        content.textContent = text;
    } else {
        content.innerHTML = renderText(text);
    }
    bubble.appendChild(content);

    // A "Try again" button for failed replies
    if (options.onRetry) {
        const retryBtn = document.createElement("button");
        retryBtn.className = "retry-btn";
        retryBtn.innerHTML = '<i class="fa-solid fa-rotate-right"></i> Try again';
        retryBtn.addEventListener("click", () => {
            if (isWaiting) return;
            message.remove();      // remove the error bubble
            options.onRetry();     // ask again
        });
        bubble.appendChild(retryBtn);
    }

    message.appendChild(avatar);
    message.appendChild(bubble);
    chatBox.appendChild(message);
    scrollToBottom();
    return message;
}

// Show the three bouncing dots while the AI is "thinking"
function showTyping() {
    showChatArea();

    const message = document.createElement("div");
    message.className = "message bot";
    message.id = "typingMessage";
    message.innerHTML =
        '<div class="avatar"><i class="fa-solid fa-heart"></i></div>' +
        '<div class="bubble"><div class="typing"><span></span><span></span><span></span></div></div>';
    chatBox.appendChild(message);
    scrollToBottom();
}

function hideTyping() {
    const typing = document.getElementById("typingMessage");
    if (typing) typing.remove();
}

/* ---------- 6. Voice: spoken replies (speech synthesis) ---------- */
const canSpeak = "speechSynthesis" in window;
let preferredVoice = null;

// Pick an English voice (Indian English if the computer has one)
function pickVoice() {
    if (!canSpeak) return;
    const voices = window.speechSynthesis.getVoices();
    preferredVoice =
        voices.find(voice => voice.lang === "en-IN") ||
        voices.find(voice => voice.lang.startsWith("en")) ||
        null;
}

if (canSpeak) {
    pickVoice();
    window.speechSynthesis.onvoiceschanged = pickVoice;
}

// Remove things that sound bad when read aloud
function cleanForSpeech(text) {
    let clean = text.replace(/```[\s\S]*?```/g, ". The code is on the screen. ");
    clean = clean.replace(/\*\*/g, "");
    clean = clean.replace(/`/g, "");
    clean = clean.replace(/^\s*[-*]\s+/gm, "");
    clean = clean.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, "");
    clean = clean.replace(/\s+/g, " ").trim();
    return clean;
}

function stopSpeaking() {
    if (canSpeak) window.speechSynthesis.cancel();
}

// Read a reply aloud, in short pieces (long text can stop in some browsers)
function speakText(text) {
    if (!canSpeak) return;
    stopSpeaking();

    const clean = cleanForSpeech(text).slice(0, 2000);
    if (!clean) return;

    const sentences = clean.match(/[^.!?]+[.!?]*/g) || [clean];
    const pieces = [];
    let current = "";

    sentences.forEach(sentence => {
        if ((current + sentence).length > 180 && current) {
            pieces.push(current);
            current = sentence;
        } else {
            current += sentence;
        }
    });
    if (current) pieces.push(current);

    pieces.forEach(piece => {
        const utterance = new SpeechSynthesisUtterance(piece.trim());
        utterance.lang = preferredVoice ? preferredVoice.lang : "en-IN";
        if (preferredVoice) utterance.voice = preferredVoice;
        utterance.rate = 1;
        window.speechSynthesis.speak(utterance);
    });
}

/* ---------- 7. Talking to the Flask backend ---------- */
// Sends the message, mode, image and chat id to /api/chat and returns the reply text.
// If anything goes wrong, it throws an Error with a friendly message.
// error.retryable tells us whether a "Try again" button makes sense.
async function getBotReply(message, mode, image) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    let response;

    try {
        response = await fetch("/api/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            signal: controller.signal,
            body: JSON.stringify({
                message: message,
                mode: mode,
                image: image,
                conversation_id: currentConversationId
            })
        });
    } catch (networkError) {
        const timedOut = networkError.name === "AbortError";
        const error = new Error(timedOut
            ? "the reply is taking too long. Please try again."
            : "I cannot reach the VibeMate server. Please check that it is running.");
        error.retryable = true;
        throw error;
    } finally {
        clearTimeout(timer);
    }

    // Read the JSON answer (if the server sent something else, keep it empty)
    let data = {};
    try {
        data = await response.json();
    } catch (parseError) {
        data = {};
    }

    // The server answered with an error (for example 400, 404 or 500)
    if (!response.ok) {
        // The open chat was deleted somewhere else: start a new saved chat next time
        if (response.status === 404 && currentConversationId !== null) {
            currentConversationId = null;
            markActiveHistory();
            loadHistory();
            const gone = new Error("this chat no longer exists, so I will start a new one. Press Try again.");
            gone.retryable = true;
            throw gone;
        }

        const error = new Error(data.error || "The server returned an error. Please try again.");
        error.retryable = response.status !== 400;   // a rejected message will not work if repeated
        throw error;
    }

    // Remember which saved chat this conversation belongs to
    if (data.conversation_id) {
        currentConversationId = data.conversation_id;
    }

    return data.reply;
}

/* ---------- 8. Sending a message ---------- */

// Ask for a reply to a message that is already shown on the screen.
// "Try again" calls this function again with the same message and image.
async function requestReply(text, image, viaVoice) {
    isWaiting = true;
    setSendingState(true);
    showTyping();

    try {
        const reply = await getBotReply(text, currentMode, image);
        hideTyping();
        addMessage("bot", reply);

        // Refresh the saved chats list (a new chat appears, or the order changes)
        loadHistory();

        // Read the reply aloud if the user spoke, or if the setting is on
        if (viaVoice || speakToggle.checked) {
            speakText(reply);
        }
    } catch (error) {
        hideTyping();
        const retry = error.retryable ? () => requestReply(text, image, viaVoice) : null;
        addMessage(
            "bot",
            "Sorry, " + (error.message || "something went wrong. Please try again."),
            null,
            { isError: true, onRetry: retry }
        );
        console.error(error);
    }

    isWaiting = false;
    setSendingState(false);
    userInput.focus();
}

// viaVoice is true when the message was spoken, so the reply is read aloud too
function sendMessage(textFromCard = null, viaVoice = false) {
    if (isWaiting) return;

    const text = (textFromCard !== null ? textFromCard : userInput.value).trim();

    // Do nothing if there is no text and no image
    if (text === "" && !selectedImage) return;

    stopSpeaking();
    const imageToSend = selectedImage;

    // 1. Show the user's message
    addMessage("user", text || "(image)", imageToSend);

    // 2. Clear the input box and the image preview
    userInput.value = "";
    userInput.style.height = "auto";
    clearSelectedImage();

    // 3. Ask for the reply
    requestReply(text, imageToSend, viaVoice);
}

/* ---------- 9. Voice: speaking to VibeMate (speech recognition) ---------- */
const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null;
let isListening = false;
let voiceText = "";
let voiceFailed = false;

function resetMicLook() {
    isListening = false;
    micBtn.classList.remove("listening");
    micBtn.title = "Speak your message";
    userInput.placeholder = DEFAULT_PLACEHOLDER;
}

function showPlaceholderHint(message) {
    userInput.placeholder = message;
    setTimeout(() => {
        if (!isListening) userInput.placeholder = DEFAULT_PLACEHOLDER;
    }, 3500);
}

function startListening() {
    if (!SpeechRecognitionAPI) {
        showToast("Voice input is not supported in this browser. Please use Google Chrome or Microsoft Edge.", "error");
        return;
    }
    if (isWaiting) return;

    stopSpeaking();

    recognition = new SpeechRecognitionAPI();
    recognition.lang = "en-IN";          // Indian English
    recognition.interimResults = true;   // show words while the user is speaking
    recognition.continuous = false;      // stop after the user finishes a sentence
    recognition.maxAlternatives = 1;

    voiceText = "";
    voiceFailed = false;

    recognition.onstart = () => {
        isListening = true;
        micBtn.classList.add("listening");
        micBtn.title = "Stop listening";
        userInput.placeholder = "Listening... speak now";
    };

    recognition.onresult = (event) => {
        let heard = "";
        for (let i = 0; i < event.results.length; i++) {
            heard += event.results[i][0].transcript;
        }
        voiceText = heard;
        userInput.value = heard;
        userInput.dispatchEvent(new Event("input"));   // grow the text box
    };

    recognition.onerror = (event) => {
        if (event.error === "no-speech" || event.error === "aborted") return;

        voiceFailed = true;
        if (event.error === "not-allowed" || event.error === "service-not-allowed") {
            showToast("The microphone is blocked. Click the icon next to the address bar, allow the microphone, then try again.", "error");
        } else if (event.error === "audio-capture") {
            showToast("No microphone was found. Please connect a microphone and try again.", "error");
        } else if (event.error === "network") {
            showToast("Voice input needs an internet connection. Please check your connection and try again.", "error");
        } else {
            console.error("Speech recognition error:", event.error);
            showPlaceholderHint("Voice input did not work. Please try again.");
        }
    };

    recognition.onend = () => {
        resetMicLook();

        if (voiceFailed) return;

        if (voiceText.trim() !== "") {
            sendMessage(null, true);   // send what was heard and read the reply aloud
        } else {
            showPlaceholderHint("I did not hear anything. Tap the mic and try again.");
        }
    };

    try {
        recognition.start();
    } catch (error) {
        console.error(error);
        resetMicLook();
    }
}

micBtn.addEventListener("click", () => {
    if (isListening && recognition) {
        recognition.stop();    // finish now, and send what was heard
    } else {
        startListening();
    }
});

/* ---------- 10. Modes and suggestion cards ---------- */

// Fill the welcome screen with suggestion cards for a mode
function loadSuggestions(mode) {
    suggestionsBox.innerHTML = "";

    MODES[mode].prompts.forEach(item => {
        const card = document.createElement("button");
        card.className = "suggestion-card";
        card.innerHTML = '<i class="fa-solid ' + item.icon + '"></i><span></span>';
        card.querySelector("span").textContent = item.text;

        card.addEventListener("click", () => sendMessage(item.prompt));
        suggestionsBox.appendChild(card);
    });
}

// Switch to another mode
function setMode(mode) {
    currentMode = mode;

    modeButtons.forEach(btn => {
        btn.classList.toggle("active", btn.dataset.mode === mode);
    });

    modeTitle.textContent = MODES[mode].title;
    modeSubtitle.textContent = MODES[mode].subtitle;
    loadSuggestions(mode);

    // On small screens, close the sidebar after choosing
    sidebar.classList.remove("open");
}

modeButtons.forEach(btn => {
    btn.addEventListener("click", () => setMode(btn.dataset.mode));
});

/* ---------- 11. New chat and clear chat ---------- */

// Empty the screen and get ready for a new conversation (the old chat stays saved)
function resetChat() {
    stopSpeaking();
    chatBox.innerHTML = "";
    currentConversationId = null;   // the next message starts a new saved chat
    showWelcome();
    userInput.value = "";
    userInput.style.height = "auto";
    clearSelectedImage();
    markActiveHistory();
    sidebar.classList.remove("open");
}

newChatBtn.addEventListener("click", resetChat);

// Delete a saved chat on the server. Returns true if it worked (or was already gone).
async function removeConversation(id) {
    try {
        const response = await fetch("/api/history/" + id, { method: "DELETE" });
        // 404 means it was already deleted, which is fine
        return response.ok || response.status === 404;
    } catch (error) {
        console.error(error);
        return false;
    }
}

// Clear Chat: wipe the screen AND delete the open chat from the saved chats
clearChatBtn.addEventListener("click", async () => {
    // Nothing to clear
    if (currentConversationId === null && chatBox.children.length === 0) return;

    if (isWaiting) {
        showToast("Please wait until VibeMate finishes replying.", "info");
        return;
    }

    const isSaved = currentConversationId !== null;
    const question = isSaved
        ? "Clear this conversation?\n\nIt will also be deleted from your saved chats."
        : "Clear the current conversation?";

    if (!confirm(question)) return;

    if (isSaved) {
        const deleted = await removeConversation(currentConversationId);
        if (!deleted) {
            showToast("Could not delete the chat. Please try again.", "error");
            return;
        }
    }

    resetChat();
    loadHistory();
});

/* ---------- 12. Chat history (saved chats in the sidebar) ---------- */

// Highlight the chat that is open right now
function markActiveHistory() {
    historyList.querySelectorAll(".history-item").forEach(row => {
        row.classList.toggle("active", Number(row.dataset.id) === currentConversationId);
    });
}

// Draw the list of saved chats
function renderHistory(conversations) {
    historyList.innerHTML = "";

    if (conversations.length === 0) {
        historyList.innerHTML = '<p class="history-empty">No saved chats yet</p>';
        return;
    }

    conversations.forEach(item => {
        const row = document.createElement("div");
        row.className = "history-item";
        row.dataset.id = item.id;
        if (item.id === currentConversationId) row.classList.add("active");

        const title = document.createElement("span");
        title.textContent = item.title;
        title.title = item.title;

        const deleteBtn = document.createElement("button");
        deleteBtn.title = "Delete this chat";
        deleteBtn.innerHTML = '<i class="fa-solid fa-trash-can"></i>';

        row.appendChild(title);
        row.appendChild(deleteBtn);

        row.addEventListener("click", () => openConversation(item.id));
        deleteBtn.addEventListener("click", (event) => {
            event.stopPropagation();   // do not open the chat when deleting it
            deleteConversation(item.id, item.title);
        });

        historyList.appendChild(row);
    });
}

// Ask the server for the saved chats and show them
async function loadHistory() {
    // Show a loading text only the first time (so the list does not flicker later)
    if (!historyLoadedOnce) {
        historyList.innerHTML = '<p class="history-empty">Loading chats...</p>';
    }

    try {
        const response = await fetch("/api/history");
        if (!response.ok) throw new Error("Could not load history");
        const data = await response.json();
        historyLoadedOnce = true;
        renderHistory(data.conversations || []);
    } catch (error) {
        console.error(error);
        historyList.innerHTML = '<p class="history-empty">Could not load saved chats</p>';
    }
}

// Open a saved chat and show all its messages
async function openConversation(id) {
    if (isWaiting) return;
    stopSpeaking();

    let data;
    try {
        const response = await fetch("/api/history/" + id);
        data = await response.json();
        if (!response.ok) throw new Error(data.error || "Could not open this chat.");
    } catch (error) {
        showToast(error.message || "Could not open this chat.", "error");
        loadHistory();
        return;
    }

    chatBox.innerHTML = "";
    userInput.value = "";
    userInput.style.height = "auto";
    clearSelectedImage();

    currentConversationId = data.conversation.id;

    // Switch to the mode this chat was saved in
    if (MODES[data.conversation.mode]) {
        setMode(data.conversation.mode);
    }

    if (data.messages.length === 0) {
        showWelcome();
    }

    data.messages.forEach(item => {
        let shown = item.content;

        // Pictures are not stored, so show a small note instead
        if (item.role === "user" && item.has_image) {
            shown = "\uD83D\uDDBC\uFE0F Image attached" +
                    (item.content !== "(image)" ? "\n" + item.content : "");
        }
        addMessage(item.role === "user" ? "user" : "bot", shown);
    });

    scrollToBottom();
    markActiveHistory();
    sidebar.classList.remove("open");
}

// Delete a saved chat from the sidebar after asking the user
async function deleteConversation(id, title) {
    // Do not delete the open chat while VibeMate is still replying to it
    if (isWaiting && id === currentConversationId) {
        showToast("Please wait until VibeMate finishes replying.", "info");
        return;
    }

    if (!confirm('Delete this chat?\n\n"' + title + '"')) return;

    const deleted = await removeConversation(id);
    if (!deleted) {
        showToast("Could not delete the chat. Please try again.", "error");
        return;
    }

    // If the deleted chat was open, go back to the welcome screen
    if (id === currentConversationId) {
        resetChat();
    }
    loadHistory();
}

/* ---------- 13. Input box behaviour ---------- */

// Make the text box grow as the user types
userInput.addEventListener("input", () => {
    userInput.style.height = "auto";
    userInput.style.height = Math.min(userInput.scrollHeight, 140) + "px";
});

// Enter sends the message (Shift+Enter makes a new line)
userInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey && enterToggle.checked) {
        event.preventDefault();
        sendMessage();
    }
});

sendBtn.addEventListener("click", () => sendMessage());

/* ---------- 14. Image upload ---------- */
imageBtn.addEventListener("click", () => imageInput.click());

imageInput.addEventListener("change", () => {
    const file = imageInput.files[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
        showToast("Please choose an image file (PNG, JPG, etc.).", "error");
        imageInput.value = "";
        return;
    }
    if (file.size > MAX_IMAGE_MB * 1024 * 1024) {
        showToast("The image is too large. Please choose one under " + MAX_IMAGE_MB + " MB.", "error");
        imageInput.value = "";
        return;
    }

    // Read the file and show a small preview
    const reader = new FileReader();
    reader.onload = () => {
        selectedImage = reader.result;
        previewImg.src = selectedImage;
        imagePreview.classList.remove("hidden");
    };
    reader.onerror = () => {
        showToast("Could not read that image. Please try another one.", "error");
        clearSelectedImage();
    };
    reader.readAsDataURL(file);
});

function clearSelectedImage() {
    selectedImage = null;
    imageInput.value = "";
    previewImg.src = "";
    imagePreview.classList.add("hidden");
}

removeImageBtn.addEventListener("click", clearSelectedImage);

/* ---------- 15. Settings (saved in the browser) ---------- */
const DEFAULT_SETTINGS = { theme: "light", fontSize: "medium", speak: false, enterToSend: true };

function loadSettings() {
    try {
        const saved = JSON.parse(localStorage.getItem("vibemateSettings"));
        return Object.assign({}, DEFAULT_SETTINGS, saved);
    } catch (error) {
        return Object.assign({}, DEFAULT_SETTINGS);
    }
}

function saveSettings() {
    const settings = {
        theme: themeSelect.value,
        fontSize: fontSizeSelect.value,
        speak: speakToggle.checked,
        enterToSend: enterToggle.checked
    };
    localStorage.setItem("vibemateSettings", JSON.stringify(settings));
    applySettings(settings);
}

function applySettings(settings) {
    document.body.setAttribute("data-theme", settings.theme);
    document.body.setAttribute("data-font", settings.fontSize);
}

// Put the saved values into the Settings window and apply them
const startSettings = loadSettings();
themeSelect.value = startSettings.theme;
fontSizeSelect.value = startSettings.fontSize;
speakToggle.checked = startSettings.speak;
enterToggle.checked = startSettings.enterToSend;
applySettings(startSettings);

[themeSelect, fontSizeSelect, speakToggle, enterToggle].forEach(control => {
    control.addEventListener("change", saveSettings);
});

settingsBtn.addEventListener("click", () => settingsModal.classList.remove("hidden"));
closeSettingsBtn.addEventListener("click", () => settingsModal.classList.add("hidden"));

// Close the window when clicking the dark area outside it
settingsModal.addEventListener("click", (event) => {
    if (event.target === settingsModal) settingsModal.classList.add("hidden");
});

// Close the window with the Escape key
document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") settingsModal.classList.add("hidden");
});

/* ---------- 16. Mobile menu button ---------- */
menuBtn.addEventListener("click", () => sidebar.classList.toggle("open"));

/* ---------- 17. Internet connection messages ---------- */
window.addEventListener("offline", () => {
    showToast("You are offline. AI replies and voice need an internet connection.", "error");
});
window.addEventListener("online", () => {
    showToast("You are back online.", "success");
});

/* ---------- 18. Start the app ---------- */
setMode("chat");
loadHistory();

/* ---------- 19. Close the mobile sidebar when tapping outside it ---------- */
document.querySelector(".main").addEventListener("click", (event) => {
    // Ignore clicks on the menu button itself (it already toggles the sidebar)
    if (event.target.closest("#menuBtn")) return;

    if (sidebar.classList.contains("open")) {
        sidebar.classList.remove("open");
    }
});