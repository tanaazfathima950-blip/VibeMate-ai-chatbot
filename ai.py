# ai.py - VibeMate 2.0 Gemini helper (Google Gen AI SDK)

import os
import time

from dotenv import load_dotenv
from google import genai
from google.genai import errors, types

from modes import MODE_NAMES, MODE_PROMPTS

# Read the settings from the .env file
load_dotenv()

API_KEY = os.getenv("GEMINI_API_KEY")
MODEL_NAME = os.getenv("GEMINI_MODEL", "gemini-3.5-flash-lite")
TIMEOUT_MS = 45000        # stop waiting after 45 seconds (images can take longer)
MAX_ATTEMPTS = 2          # try again once if Google is busy
RETRY_WAIT = 1.5          # seconds to wait before the second try
MAX_HISTORY_CHARS = 3000  # each old message is cut to this length

# ---------------------------------------------------------
# VibeMate's personality (hidden instruction sent with every question)
# ---------------------------------------------------------
BASE_PROMPT = (
    "You are VibeMate, a warm, friendly and supportive AI best friend for college students. "
    "Talk in simple, clear English like a kind friend, not like a textbook. "
    "Keep answers focused and not too long unless the user asks for detail. "
    "Remember what was said earlier in this conversation and use it when it helps. "
    "Use **double asterisks** to make important words bold. "
    "When you write code, always put it inside a triple-backtick code block. "
    "Do not use markdown headings (#) or tables. For lists, use short lines starting with a dash."
)

IMAGE_NOTE = (
    "The user attached an image to their latest message. Look at it carefully and answer "
    "their question about it. If they did not ask anything, describe what you see in simple words. "
    "You can read text, explain diagrams, charts and slides, understand screenshots of code or errors, "
    "and help with problems shown in the picture. "
    "If the image is blurry or unclear, say so honestly and do not guess. "
    "Do not try to identify real people from their faces; you can describe what they are doing "
    "or wearing instead."
)

_client = None


class AIError(Exception):
    """An AI problem with a friendly message that is safe to show to the user."""

    def __init__(self, user_message, status=503, details=""):
        super().__init__(details or user_message)
        self.user_message = user_message
        self.status = status
        self.details = details or user_message


class EmptyAnswerError(Exception):
    """Gemini answered with nothing (for example, the answer was blocked)."""


def get_client():
    """Create the Gemini client once and reuse it."""
    global _client
    if not API_KEY:
        raise RuntimeError("GEMINI_API_KEY is missing in the .env file.")
    if _client is None:
        _client = genai.Client(
            api_key=API_KEY,
            http_options=types.HttpOptions(timeout=TIMEOUT_MS),
        )
    return _client


def build_contents(message, history=None, image=None):
    """
    Turn the saved chat history plus the new message into the list that
    Gemini expects: our messages are role "user", VibeMate's are role "model".
    image is None or a pair (mime_type, bytes) that belongs to the NEW message.
    """
    contents = []

    for item in history or []:
        role = "user" if item["role"] == "user" else "model"
        text = (item["content"] or "")[:MAX_HISTORY_CHARS]
        if role == "user" and item.get("has_image"):
            text += " [The user attached an image with this message.]"
        if text:
            contents.append(
                types.Content(role=role, parts=[types.Part(text=text)])
            )

    # The conversation must start with a user message
    while contents and contents[0].role != "user":
        contents.pop(0)

    # Finally, the new message from the user (with the picture, if there is one)
    parts = []
    if image is not None:
        mime_type, image_bytes = image
        parts.append(types.Part.from_bytes(data=image_bytes, mime_type=mime_type))
    parts.append(types.Part(text=message))

    contents.append(types.Content(role="user", parts=parts))
    return contents


def build_instruction(mode, has_image=False):
    """Combine the base personality with the instructions of the chosen mode."""
    instruction = BASE_PROMPT
    instruction += " The user is currently in " + MODE_NAMES.get(mode, "Smart Chat") + " mode."

    mode_prompt = MODE_PROMPTS.get(mode, "")
    if mode_prompt:
        instruction += " " + mode_prompt

    if has_image:
        instruction += " " + IMAGE_NOTE
    return instruction


def ask_gemini(contents, system_instruction=None):
    """Send the conversation to Gemini and return the answer as text."""
    client = get_client()
    config = types.GenerateContentConfig(system_instruction=system_instruction)

    response = client.models.generate_content(
        model=MODEL_NAME,
        contents=contents,
        config=config,
    )

    if not response.text:
        raise EmptyAnswerError("Gemini returned an empty answer.")
    return response.text


def generate_reply(message, mode="chat", image=None, history=None):
    """
    Get VibeMate's reply for a message, using the earlier messages of the
    same chat as memory. image is None or a pair (mime_type, bytes).
    Retries once if Google is busy.
    Raises AIError (with a friendly message) if the reply cannot be produced.
    """
    if message:
        text = message
    elif image is not None:
        text = "Please look at this image and tell me what you see, in simple words."
    else:
        text = "Hello"

    contents = build_contents(text, history, image)
    instruction = build_instruction(mode, has_image=image is not None)

    last_error = None

    for attempt in range(1, MAX_ATTEMPTS + 1):
        try:
            return ask_gemini(contents, instruction)

        except EmptyAnswerError as error:
            raise AIError(
                "I could not answer that one. Could you try asking it in a different way?",
                status=422, details=str(error))

        except RuntimeError as error:
            raise AIError(
                "the AI key is missing. Please add GEMINI_API_KEY to the .env file.",
                status=500, details=str(error))

        except errors.ClientError as error:
            code = getattr(error, "code", 400)
            if code == 429:
                raise AIError(
                    "I am getting too many requests right now. Please wait a minute and try again.",
                    status=429, details=str(error))
            if code == 404:
                raise AIError(
                    "the AI model name is not available. Please check GEMINI_MODEL in the .env file.",
                    status=500, details=str(error))
            raise AIError(
                "there is a problem with the AI settings or the image. Please check the Gemini key and model in the .env file.",
                status=500, details=str(error))

        except errors.ServerError as error:
            # Google is busy or too slow (503, 504...). Worth trying again.
            last_error = error

        except Exception as error:
            # Network problems, timeouts... Also worth trying again.
            last_error = error

        if attempt < MAX_ATTEMPTS:
            time.sleep(RETRY_WAIT)

    raise AIError(
        "the AI is busy right now. Please try again in a few seconds.",
        status=503, details=repr(last_error))


def list_usable_models():
    """Return the names of the models your key can use for text generation."""
    names = []
    for model in get_client().models.list():
        actions = getattr(model, "supported_actions", None) or []
        if "generateContent" in actions:
            names.append(model.name.replace("models/", ""))
    return names


# ---------------------------------------------------------
# Test: run  python ai.py  to check that image understanding works
# It makes a plain red picture and asks Gemini for its colour.
# ---------------------------------------------------------
if __name__ == "__main__":
    from io import BytesIO

    from PIL import Image

    print("Model:", MODEL_NAME)

    buffer = BytesIO()
    Image.new("RGB", (64, 64), (220, 30, 30)).save(buffer, format="PNG")
    test_image = ("image/png", buffer.getvalue())

    try:
        print(generate_reply("What colour is this image? Answer in one short sentence.", "chat", image=test_image))
    except AIError as error:
        print("AI problem:", error.user_message)
        print("Details:", error.details)