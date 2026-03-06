# AI Study Assistant for Visually Impaired Students

This project is a fully offline-capable web application that helps visually impaired students study using voice commands and local AI (Ollama).

## Features

- **Runs completely offline** once Python, this app, and Ollama are installed.
- **5 functional pages** in a single-page, accessible UI:
  - Home
  - Study Documents
  - Ask Questions
  - Progress Dashboard
  - Settings & Help
- **TXT upload** and storage on the backend.
- **Reads documents aloud** using the Web Speech API (text-to-speech).
- **Summarize, explain, and Q&A** using a local Ollama model (no API keys).
- **Voice navigation** using the Web Speech API (speech recognition).
- **Accessibility features**:
  - High-contrast mode
  - Adjustable font size
  - Keyboard navigation with access keys (1–5)
  - ARIA live regions for status and AI responses
- **Progress tracking** stored in the browser (localStorage).

## Prerequisites

- Python 3.10 or later
- Node or any HTTP server is optional (you can open `frontend/index.html` directly in a browser).
- [Ollama](https://ollama.com/) installed and running locally.

## Backend Setup (FastAPI + Ollama)

1. Open a terminal in the project root:

   ```bash
   cd backend
   python -m venv .venv
   .venv\Scripts\activate  # On Windows PowerShell
   pip install -r requirements.txt
   ```

2. Make sure Ollama is installed and running, and pull the model:

   ```bash
   ollama pull qwen2.5:1.5b
   ollama serve
   ```

   The backend expects Ollama at:

   ```python
   OLLAMA_URL = "http://localhost:11434/api/generate"
   OLLAMA_MODEL = "qwen2.5:1.5b"
   ```

3. Start the FastAPI server:

   ```bash
   uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000
   ```

   API endpoints:

   - `GET /api/health` – health check
   - `GET /api/documents` – list TXT documents
   - `POST /api/documents` – upload a TXT document
   - `GET /api/documents/{id}` – get document content
   - `POST /api/documents/{id}/summarize` – summarize with Ollama
   - `POST /api/documents/{id}/explain` – explain simply with Ollama
   - `POST /api/qa` – answer questions about a document with Ollama

## Frontend Setup

1. Open `frontend/index.html` in a modern browser (Chrome or Edge recommended).
   - Or serve the folder with any static server, for example:

   ```bash
   cd frontend
   python -m http.server 8080
   ```

   Then visit `http://localhost:8080/` in your browser.

2. Make sure the backend is running on `http://localhost:8000`. The frontend expects the API at:

   ```js
   const API_BASE = "http://localhost:8000/api";
   ```

## Using the App

- **Navigation**:
  - Use the navigation bar buttons, or
  - Press access keys `1`–`5` for the five pages, or
  - Turn on voice control and say commands like “Go to home”, “Go to study”, “Go to questions”, “Go to dashboard”, or “Go to settings”.

- **Study Documents**:
  - Upload `.txt` files.
  - Select a document and load it.
  - Click **Read Aloud** to hear the content (Web Speech API).
  - Click **Summarize with AI** or **Explain Simply** to call Ollama.

- **Ask Questions**:
  - Make sure a document is selected and loaded.
  - Type a question and click **Ask with AI**. The question is answered using the selected document as context via Ollama.

- **Progress Dashboard**:
  - Shows:
    - Documents uploaded
    - Summaries requested
    - Explanations requested
    - Questions asked
    - Estimated listening time in minutes
  - Progress is stored locally in the browser (no server storage).

- **Settings & Help**:
  - Toggle high contrast.
  - Increase or decrease base font size.
  - See a list of supported voice commands and keyboard navigation tips.

## Notes

- All AI features use **only Ollama** running locally; no external APIs or keys.
- The app is intended to work offline after installation, assuming:
  - The browser can access the local frontend files.
  - The Python backend and Ollama are running on the same machine with no internet required.

