// script.js — full, robust chat script with streaming, dynamic textarea, cursor, and safe aborts.

const chatForm = document.getElementById("chat-form");
const chatBox = document.getElementById("chat-box");
const userInput = document.getElementById("user-input");
const chatList = document.getElementById("chat-list");
const chatHeader = document.getElementById("chat-header");
const newChatBtn = document.getElementById("new-chat");
const sendButton = chatForm.querySelector('button[type="submit"]');
const internetOption = document.getElementById("internet-option");

let chats = [];
let activeChatId = null;
// controller for in-flight fetch so we can abort if user creates a new chat or switches
let activeFetchController = null;

/**
 * Display-only formatting:
 * Insert a visible newline after sentence-ending punctuation (.!?)
 * while preserving any existing newlines from the streamer.
 *
 * NOTE: This only affects presentation. msg.text itself is NOT modified.
 */
function formatForDisplay(text) {
  if (text === undefined || text === null) return "";
  const normalized = String(text).replace(/\r\n/g, "\n");
  return normalized.replace(/([.?!])\s+/g, "$1\n");
}

function createChat(title = "New Chat") {
  // If there's an active streaming request, abort it before creating a new chat
  if (activeFetchController) {
    try { activeFetchController.abort(); } catch (e) { /* ignore */ }
    activeFetchController = null;
  }

  const id = Date.now().toString();
  const chat = { id, title, messages: [], internetEnabled: false }; // track per-chat internet preference optionally
  chats.unshift(chat);
  renderChats();
  setActiveChat(id);
}

function renderChats() {
  chatList.innerHTML = "";
  chats.forEach((chat) => {
    const li = document.createElement("li");
    li.className = "chat-item" + (chat.id === activeChatId ? " active" : "");
    li.innerHTML = `
      <span class="chat-title" contenteditable="true">${chat.title}</span>
      <button class="delete-chat" title="Delete chat">&#10006;</button>
    `;

    // clicking title activates chat
    li.querySelector(".chat-title").addEventListener("click", () => setActiveChat(chat.id));

    // editing title
    li.querySelector(".chat-title").addEventListener("blur", (e) => {
      chat.title = e.target.textContent.trim() || "Untitled Chat";
      renderChats();
    });

    // delete chat
    li.querySelector(".delete-chat").addEventListener("click", (e) => {
      e.stopPropagation();
      // If deleting the active chat, abort any active streaming
      if (activeChatId === chat.id && activeFetchController) {
        try { activeFetchController.abort(); } catch (err) {}
        activeFetchController = null;
      }
      chats = chats.filter((c) => c.id !== chat.id);
      if (activeChatId === chat.id) {
        activeChatId = chats.length ? chats[0].id : null;
        renderMessages();
      }
      renderChats();
    });

    chatList.appendChild(li);
  });
}

function setActiveChat(id) {
  // If switching chats while a stream is in progress, abort it
  if (activeFetchController) {
    try { activeFetchController.abort(); } catch (e) {}
    activeFetchController = null;
  }

  activeChatId = id;
  const chat = chats.find((c) => c.id === id);
  if (chat) {
    chatHeader.textContent = `💬 ${chat.title}`;
    // sync internet toggle to the chat's state (if you want per-chat persistence)
    if (typeof chat.internetEnabled !== "undefined") {
      internetOption.checked = !!chat.internetEnabled;
    } else {
      internetOption.checked = false;
    }
  } else {
    chatHeader.textContent = "💬 Chat with AILion";
    internetOption.checked = false;
  }
  renderChats();
  renderMessages();
}

function renderMessages() {
  chatBox.innerHTML = "";
  const chat = chats.find((c) => c.id === activeChatId);
  if (!chat) return;

  chat.messages.forEach((msg) => {
    const div = document.createElement("div");
    div.className = "message";

    const strong = document.createElement("strong");
    strong.textContent = `${msg.sender}:`;
    div.appendChild(strong);

    // text span (we'll update this in-place during streaming)
    const textSpan = document.createElement("span");
    textSpan.className = "message-text";
    textSpan.textContent = formatForDisplay(msg.text || "");
    div.appendChild(textSpan);

    chatBox.appendChild(div);
  });

  scrollChatToBottom();
}

function scrollChatToBottom() {
  chatBox.scrollTop = chatBox.scrollHeight;
}

/* ======================
   Input / textarea utils
   ====================== */

// Auto-resize textarea on input.
// Keeps the height dynamic while typing, respects maxHeight CSS if present.
function autoResizeInput() {
  userInput.style.height = "auto";
  // Limit to natural scrollHeight to expand; CSS's max-height will prevent overflow if set
  userInput.style.height = userInput.scrollHeight + "px";
}

// Submit on Enter, allow Shift+Enter for newline
function handleTextareaKeydown(e) {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault(); // prevent newline
    // Trigger normal form submit (this will run validation and our handler)
    chatForm.requestSubmit();
  }
}

/* Attach input/keydown handlers */
userInput.addEventListener("input", autoResizeInput);
userInput.addEventListener("keydown", handleTextareaKeydown);

/* ======================
   Form submit / streaming
   ====================== */

chatForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  // grab raw text (keep internal newlines)
  const msgText = userInput.value;
  if (!msgText || !activeChatId) return;

  // read the internet toggle — we also store it on chat for per-chat persistence
  const internetEnabled = internetOption.checked;
  const chat = chats.find((c) => c.id === activeChatId);
  if (chat) chat.internetEnabled = internetEnabled;

  // disable send button immediately and visually
  sendButton.disabled = true;
  sendButton.style.opacity = 0.5;
  sendButton.style.cursor = "not-allowed";

  // find active chat and append user message
  chat.messages.push({ sender: "You", text: msgText });
  renderMessages();

  // reset textarea
  userInput.value = "";
  autoResizeInput();

  // create ai placeholder message (raw text kept in aiMsg.text as it's streamed)
  const aiMsg = { sender: "AILion", text: "" };
  chat.messages.push(aiMsg);
  renderMessages();

  // get references to the last message's text span (we will update this in-place)
  const lastMsgDiv = chatBox.querySelector(".message:last-child");
  const lastMsgTextSpan = lastMsgDiv ? lastMsgDiv.querySelector(".message-text") : null;

  // create and append typing cursor element (CSS handles blink)
  let cursorElem = null;
  if (lastMsgDiv && !lastMsgDiv.querySelector(".typing-cursor")) {
    cursorElem = document.createElement("span");
    cursorElem.className = "typing-cursor";
    lastMsgDiv.appendChild(cursorElem);
  }

  // prepare to fetch streamed response
  const controller = new AbortController();
  activeFetchController = controller;

  try {
    const res = await fetch("/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: msgText, internet: internetEnabled }),
      signal: controller.signal,
    });

    if (!res.body) throw new Error("No response body");

    const reader = res.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let done = false;

    while (!done) {
      const { value, done: streamDone } = await reader.read();
      if (streamDone) {
        done = true;
        break;
      }
      const chunk = decoder.decode(value, { stream: true });
      // Append raw chunk to stored message text
      aiMsg.text += chunk;

      // Update visible text in-place. Keep cursor element as a sibling so updating text does not remove it.
      if (lastMsgTextSpan) {
        lastMsgTextSpan.textContent = formatForDisplay(aiMsg.text);
        // ensure cursor is last child
        if (cursorElem && lastMsgDiv && cursorElem.parentNode !== lastMsgDiv) {
          lastMsgDiv.appendChild(cursorElem);
        }
        scrollChatToBottom();
      }
    }

    // streaming finished - remove cursor and final render
    if (cursorElem && cursorElem.parentNode) cursorElem.remove();
    if (lastMsgTextSpan) {
      lastMsgTextSpan.textContent = formatForDisplay(aiMsg.text);
    }

    // store final raw text (already in aiMsg.text)
  } catch (err) {
    // If the request was aborted, keep any partial text that arrived.
    if (err && err.name === "AbortError") {
      // nothing extra — leave partial aiMsg.text visible
    } else {
      // network / server error — show an error message in that placeholder
      aiMsg.text = "⚠️ Error connecting to server.";
      // re-render messages (safe)
      renderMessages();
    }
  } finally {
    // ensure we clear any active controller
    if (activeFetchController === controller) activeFetchController = null;

    // remove any leftover cursor if it's still present
    try { if (cursorElem && cursorElem.parentNode) cursorElem.remove(); } catch (e) {}

    // re-enable send button
    sendButton.disabled = false;
    sendButton.style.opacity = 1;
    sendButton.style.cursor = "auto";

    // ensure chat scroll updated and stored aiMsg preserved
    renderMessages();
  }
});

/* New chat button */
newChatBtn.addEventListener("click", () => createChat());

/* Initialize one empty chat */
createChat();
