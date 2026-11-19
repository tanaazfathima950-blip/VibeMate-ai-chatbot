# app.py - VibeMate 2.0 backend (Flask)

import base64
import binascii
import os
import re

from dotenv import load_dotenv
from flask import Flask, jsonify, render_template, request
from mysql.connector import Error as DBError

import ai
import db

# Read the secret settings from the .env file
load_dotenv()

# Create the Flask application
app = Flask(__name__)

# Settings
app.config["SECRET_KEY"] = os.getenv("SECRET_KEY", "change-this-in-env-file")
app.config["MAX_CONTENT_LENGTH"] = 10 * 1024 * 1024  # 10 MB per request

# ---------------------------------------------------------
# Rules used to check what the browser sends us
# ---------------------------------------------------------
ALLOWED_MODES = {"chat", "study", "coding", "fun", "mood", "entertainment"}
MAX_MESSAGE_LENGTH = 4000
MAX_IMAGE_CHARS = 8 * 1024 * 1024   # a 5 MB image becomes about 6.7 million characters
MAX_IMAGE_BYTES = 6 * 1024 * 1024   # size of the image after decoding
MAX_HISTORY_ITEMS = 50              # how many saved chats the list returns
MAX_CONTEXT_MESSAGES = 20           # how many earlier messages the AI remembers
ALLOWED_IMAGE_PREFIXES = (
    "data:image/png;base64,",
    "data:image/jpeg;base64,",
    "data:image/webp;base64,",
    "data:image/gif;base64,",
)


def decode_image(data_url):
    """
    Turn an image sent as a data URL into (mime_type, bytes).
    Checks that it is correctly encoded, not too big, and that the first
    bytes of the file really match the claimed image type.
    Raises ValueError with a friendly message if anything is wrong.
    """
    header, _, encoded = data_url.partition(",")
    mime_type = header[len("data:"):].split(";")[0]

    try:
        raw = base64.b64decode(encoded, validate=True)
    except (binascii.Error, ValueError):
        raise ValueError("The image could not be read. Please try another one.")

    if not raw:
        raise ValueError("The image is empty.")
    if len(raw) > MAX_IMAGE_BYTES:
        raise ValueError("The image is too large (maximum 5 MB).")

    looks_real = {
        "image/png": raw.startswith(b"\x89PNG\r\n\x1a\n"),
        "image/jpeg": raw.startswith(b"\xff\xd8\xff"),
        "image/gif": raw.startswith((b"GIF87a", b"GIF89a")),
        "image/webp": raw[:4] == b"RIFF" and raw[8:12] == b"WEBP",
    }
    if not looks_real.get(mime_type, False):
        raise ValueError("That file does not look like a real image.")

    return mime_type, raw


def validate_chat_request(data):
    """
    Check the data sent to /api/chat.
    Returns (clean_data, None) if everything is fine,
    or (None, "error message") if something is wrong.
    """
    if not isinstance(data, dict):
        return None, "Request must be valid JSON."

    message = data.get("message", "")
    mode = data.get("mode", "chat")
    image = data.get("image")
    conversation_id = data.get("conversation_id")

    # Message must be text
    if not isinstance(message, str):
        return None, "Message must be text."
    message = message.strip()
    if len(message) > MAX_MESSAGE_LENGTH:
        return None, f"Message is too long (maximum {MAX_MESSAGE_LENGTH} characters)."

    # Mode must be one we know
    if mode not in ALLOWED_MODES:
        return None, "Unknown mode."

    # Image (optional) must be a supported, real picture and not too big
    image_data = None
    if image is not None:
        if not isinstance(image, str) or not image.startswith(ALLOWED_IMAGE_PREFIXES):
            return None, "Image must be a PNG, JPEG, WEBP or GIF file."
        if len(image) > MAX_IMAGE_CHARS:
            return None, "Image is too large."
        try:
            image_data = decode_image(image)
        except ValueError as image_error:
            return None, str(image_error)

    # Conversation id (optional) must be a positive whole number
    if conversation_id is not None:
        if (isinstance(conversation_id, bool)
                or not isinstance(conversation_id, int)
                or conversation_id < 1):
            return None, "Invalid conversation id."

    # Need at least a message or an image
    if message == "" and image_data is None:
        return None, "Please type a message or attach an image."

    return {
        "message": message,
        "mode": mode,
        "image_data": image_data,        # None, or (mime_type, bytes)
        "conversation_id": conversation_id,
    }, None


def make_title(message):
    """Make a short chat title from the first message."""
    if not message:
        return "Image chat"
    title = re.sub(r"\s+", " ", message).strip()
    if len(title) > 60:
        title = title[:57] + "..."
    return title


def database_error(error):
    """One friendly answer for every database problem."""
    app.logger.error("Database error: %s", error)
    return jsonify({
        "error": "The database is not available. Please check that MySQL is running."
    }), 500


# ---------------------------------------------------------
# Page route: opens the VibeMate app in the browser
# ---------------------------------------------------------
@app.route("/")
def home():
    return render_template("index.html")


# ---------------------------------------------------------
# Health check: used to test that the server is running
# ---------------------------------------------------------
@app.route("/api/health")
def health():
    return jsonify({"status": "ok", "app": "VibeMate 2.0"})


# ---------------------------------------------------------
# Chat route: asks Gemini, saves the chat and returns the reply
# ---------------------------------------------------------
@app.route("/api/chat", methods=["POST"])
def chat():
    data = request.get_json(silent=True)
    cleaned, error = validate_chat_request(data)

    if error:
        return jsonify({"error": error}), 400

    has_image = cleaned["image_data"] is not None

    try:
        # 1. If the browser sent a chat id, make sure that chat exists
        #    and load the earlier messages (the AI's memory)
        conversation_id = cleaned["conversation_id"]
        history = []

        if conversation_id is not None:
            existing = db.fetch_one(
                "SELECT id FROM conversations WHERE id = %s", (conversation_id,)
            )
            if existing is None:
                return jsonify({"error": "This conversation no longer exists. Please start a new chat."}), 404

            history = db.fetch_all(
                "SELECT role, content, has_image FROM messages "
                "WHERE conversation_id = %s ORDER BY id DESC LIMIT %s",
                (conversation_id, MAX_CONTEXT_MESSAGES),
            )
            history.reverse()   # oldest first

        # 2. Ask Gemini first (nothing is saved if the AI fails)
        try:
            reply = ai.generate_reply(
                cleaned["message"],
                cleaned["mode"],
                image=cleaned["image_data"],
                history=history,
            )
        except ai.AIError as ai_error:
            app.logger.error("AI error: %s", ai_error.details)
            return jsonify({"error": ai_error.user_message}), ai_error.status

        # 3. The AI answered, so now save the chat
        #    (the picture itself is not stored, only the fact that there was one)
        if conversation_id is None:
            conversation_id = db.execute(
                "INSERT INTO conversations (title, mode) VALUES (%s, %s)",
                (make_title(cleaned["message"]), cleaned["mode"]),
            )

        user_text = cleaned["message"] or "(image)"
        db.execute(
            "INSERT INTO messages (conversation_id, role, content, has_image) "
            "VALUES (%s, 'user', %s, %s)",
            (conversation_id, user_text, 1 if has_image else 0),
        )
        db.execute(
            "INSERT INTO messages (conversation_id, role, content, has_image) "
            "VALUES (%s, 'bot', %s, 0)",
            (conversation_id, reply),
        )

        # 4. Update the chat's last-used time and mode
        db.execute(
            "UPDATE conversations SET mode = %s, updated_at = CURRENT_TIMESTAMP "
            "WHERE id = %s",
            (cleaned["mode"], conversation_id),
        )

    except DBError as db_error:
        return database_error(db_error)

    return jsonify({
        "reply": reply,
        "mode": cleaned["mode"],
        "conversation_id": conversation_id,
    })


# ---------------------------------------------------------
# History route 1: list the saved chats (newest first)
# ---------------------------------------------------------
@app.route("/api/history", methods=["GET"])
def list_history():
    try:
        rows = db.fetch_all(
            "SELECT id, title, mode, updated_at FROM conversations "
            "ORDER BY updated_at DESC, id DESC LIMIT %s",
            (MAX_HISTORY_ITEMS,),
        )
    except DBError as db_error:
        return database_error(db_error)

    for row in rows:
        row["updated_at"] = row["updated_at"].isoformat()

    return jsonify({"conversations": rows})


# ---------------------------------------------------------
# History route 2: get one chat with all its messages
# ---------------------------------------------------------
@app.route("/api/history/<int:conversation_id>", methods=["GET"])
def get_conversation(conversation_id):
    try:
        conversation = db.fetch_one(
            "SELECT id, title, mode FROM conversations WHERE id = %s",
            (conversation_id,),
        )
        if conversation is None:
            return jsonify({"error": "Conversation not found."}), 404

        messages = db.fetch_all(
            "SELECT id, role, content, has_image, created_at FROM messages "
            "WHERE conversation_id = %s ORDER BY id ASC",
            (conversation_id,),
        )
    except DBError as db_error:
        return database_error(db_error)

    for message in messages:
        message["has_image"] = bool(message["has_image"])
        message["created_at"] = message["created_at"].isoformat()

    return jsonify({"conversation": conversation, "messages": messages})


# ---------------------------------------------------------
# History route 3: delete one chat (its messages go with it)
# ---------------------------------------------------------
@app.route("/api/history/<int:conversation_id>", methods=["DELETE"])
def delete_conversation(conversation_id):
    try:
        existing = db.fetch_one(
            "SELECT id FROM conversations WHERE id = %s", (conversation_id,)
        )
        if existing is None:
            return jsonify({"error": "Conversation not found."}), 404

        db.execute("DELETE FROM conversations WHERE id = %s", (conversation_id,))
    except DBError as db_error:
        return database_error(db_error)

    return jsonify({"deleted": True, "id": conversation_id})


# ---------------------------------------------------------
# Error handlers: friendly messages instead of ugly error pages
# ---------------------------------------------------------
@app.errorhandler(404)
def not_found(error):
    if request.path.startswith("/api/"):
        return jsonify({"error": "This API route does not exist."}), 404
    return "Page not found", 404


@app.errorhandler(405)
def wrong_method(error):
    return jsonify({"error": "Wrong request method for this route."}), 405


@app.errorhandler(413)
def too_large(error):
    return jsonify({"error": "The file or message is too large."}), 413


@app.errorhandler(500)
def server_error(error):
    return jsonify({"error": "Something went wrong on the server."}), 500


# ---------------------------------------------------------
# Start the server (only when this file is run directly)
# ---------------------------------------------------------
if __name__ == "__main__":
    app.run(debug=True)