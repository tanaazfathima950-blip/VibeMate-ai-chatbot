# VibeMate 2.0 – AI Best Friend Chatbot

**Your mood. Your space. Your AI companion.**

VibeMate is a college mini-project: a web-based AI chatbot with six chat modes, voice input and output, image understanding and saved chat history.

Developed by Tanaaz Fathima, Department of Information Science & Engineering, AMC Engineering College.

## Features

1. **Smart Chat** – real AI conversations that remember the chat
2. **Study Buddy** – simple explanations, examples and assignment help
3. **Coding Assistant** – code generation, explanation and debugging
4. **Fun Mode** – jokes, riddles and small games
5. **Mood Support** – a friendly, supportive listener
6. **Entertainment Assistant** – movie, series and music suggestions
7. **Voice Assistant** – speak your message and hear the reply (Web Speech API)
8. **Image Upload** – ask questions about a picture
9. **Chat History** – saved in MySQL, open or delete any chat
10. **Clear Chat** – removes the open conversation
11. **Responsive Design** – works on laptop and mobile
12. **Settings** – theme, text size, read replies aloud, Enter to send

## Tech Stack

| Part | Technology |
|---|---|
| Frontend | HTML5, CSS3, JavaScript |
| Backend | Python, Flask |
| AI | Google Gemini API (Google Gen AI SDK) |
| Database | MySQL |
| Voice | Browser Web Speech API |

## Project Structure

```
VibeMate/
├── app.py              Flask server and API routes
├── ai.py               Gemini connection, memory, retries and errors
├── modes.py            Instructions for each chat mode
├── db.py               MySQL helper functions
├── requirements.txt    Python packages
├── .env.example        Template for the secret settings
├── database/
│   └── schema.sql      MySQL tables
├── templates/
│   └── index.html      Main page
├── static/
│   ├── css/style.css   Styling
│   └── js/script.js    Frontend logic
└── docs/               Report and diagrams
```

## How to Run

**Requirements:** Python 3.9 or newer, MySQL 8 with MySQL Workbench, Google Chrome or Edge, and a free Gemini API key from https://aistudio.google.com/apikey

1. **Download the project** and open the folder in VS Code.

2. **Create and activate a virtual environment** (Windows PowerShell):
   ```
   python -m venv venv
   venv\Scripts\Activate.ps1
   ```

3. **Install the packages:**
   ```
   pip install -r requirements.txt
   ```

4. **Create the database.** In MySQL Workbench, open `database/schema.sql` and run it. Then create a MySQL user for the app (choose your own password):
   ```sql
   CREATE USER 'vibemate_user'@'localhost' IDENTIFIED BY 'choose-a-strong-password';
   GRANT SELECT, INSERT, UPDATE, DELETE ON vibemate.* TO 'vibemate_user'@'localhost';
   FLUSH PRIVILEGES;
   ```

5. **Create the `.env` file.** Copy `.env.example` to a new file named `.env` and fill in your own values. Create a random `SECRET_KEY` with:
   ```
   python -c "import secrets; print(secrets.token_hex(32))"
   ```

6. **Start the server:**
   ```
   python app.py
   ```

7. Open **http://127.0.0.1:5000** in Chrome or Edge.

## Security Notes

- The Gemini key and the database password are kept in `.env`, which is excluded from Git, and are never sent to the browser.
- All SQL queries use placeholders (parameterized queries) to prevent SQL injection.
- Messages and images are validated on the server (size, type, and the real file signature of images).
- Chat text is shown with safe HTML escaping.

## Limitations

- Pictures are not stored, only a flag saying a message had an image.
- The free Gemini tier has rate limits, so very quick messages can get a "too many requests" reply.
- Voice input needs internet and works best in Chrome or Edge.
- The app runs in Flask debug mode for development and is not meant for public hosting.
- AI answers can be wrong. Please double-check important information.

## Important Note About Mood Support

Mood Support is a friendly AI companion, not a medical or therapy tool. If you or someone you know is in serious distress, please contact a trusted person or call the free Tele-MANAS helpline in India at **14416** (24x7).

## Author

Tanaaz Fathima – B.E. Information Science & Engineering, AMC Engineering College