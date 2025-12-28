# Verity AI

Verity AI is a two-part system that lets you capture short voice notes from a Chrome extension popup, transcribe them with Whisper, and enrich the transcript with Slack context before presenting the final text back in the popup. The backend is a Flask application that handles transcription and Slack OAuth, while the frontend is a Vite/React extension that manages recording, authentication, and display.

---

## System Architecture

### Frontend (Chrome Extension)
- **Popup UI (React/Vite):** Provides a glassmorphic dark-mode interface with a single record button. It shows the final, auto-repaired transcription only when Slack context has been applied, keeping the window height as small as possible.
- **Recording Hook:** Uses the MediaRecorder API to capture audio chunks, post them to the backend, and automatically trigger the repair flow once the transcription arrives.
- **Slack Hook:** Manages Slack authentication per workspace, extracts workspace/channel IDs from the active tab URL, caches Slack context for 5 minutes, and handles rate limiting (falls back to cached data when necessary).
- **Background Service Worker:** Listens for the Slack OAuth callback tab, extracts the token/team info from the query parameters, stores credentials in `chrome.storage.local`, and closes the tab automatically.
- **Build:** Vite bundles the popup, content, and background scripts into the `frontend/build` directory. The extension manifest points to these compiled assets.

### Backend (Flask)
- **Endpoints:**
  - `/transcribe` — Accepts an audio file, runs Whisper (via `whisper_timestamped`) to get transcription plus per-word confidences.
  - `/repair_low_confidence_words` — Uses OpenAI’s `gpt-4o-mini` to correct only low-confidence words. The prompt constrains replacements to names found in Slack context, ensuring the assistant cannot hallucinate different people.
  - `/slack/oauth/authorize` & `/slack/oauth/callback` — Handle Slack OAuth for user tokens. The callback returns a small HTML page that embeds the access token in the URL for the extension to capture, then auto-closes the tab.
  - `/slack/context` — Given an access token (and optional channel), fetches workspace users plus the latest 10 channel messages. Responses are cached on the frontend for 5 minutes.
- **Whisper:** The backend loads the `base` model from `whisper_timestamped`, which wraps OpenAI’s Whisper checkpoints and augments them with word-level timestamps.
- **OpenAI Guardrails:** Similarity checks (difflib) ensure only names that match Slack users are available for replacement. Temperature is kept low (`0.3`) to make the model deterministic.

### Data Flow
1. User hits “Start Recording” → popup captures audio → uploads to `/transcribe`.
2. Backend returns transcription + low-confidence words → frontend displays a spinner while it fetches Slack context.
3. Frontend posts transcription + Slack context to `/repair_low_confidence_words`.
4. Backend returns the repaired text → popup renders the final transcription and clears low-confidence UI.
5. Slack tokens are stored per workspace in `chrome.storage.local` so switching teams reuses the correct credentials.

---

## Token Usage Optimizations
- **Selective Repair:** Only low-confidence words are sent to OpenAI for correction, reducing prompt length.
- **Context Caching:** Slack context is cached on the frontend for 5 minutes. Rate-limit responses fall back to the cached snapshot instead of repeatedly calling the backend or OpenAI.
- **Guarded Prompt:** The repair prompt includes a short authorized replacement list derived from Slack names, avoiding lengthy transcripts in the repair step.
- **Low Temperature:** Using a low temperature (`0.3`) prevents repeated interactions when the model outputs inconsistent names.

---

## Installation & Running

### Prerequisites
- Python 3.11 (or compatible) for the backend.
- Node.js 18+ (recommended) for the frontend build.
- Slack app credentials (`SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET`, `SLACK_REDIRECT_URL`).
- OpenAI API key (`OPENAI_API_KEY`).

### Backend Setup
```bash
cd backend
python -m venv venv
source venv/bin/activate    # Windows: venv\Scripts\activate
pip install -r ../requirements.txt

# Set environment variables (example)
export OPENAI_API_KEY="sk-..."
export SLACK_CLIENT_ID="..."
export SLACK_CLIENT_SECRET="..."
export SLACK_REDIRECT_URL="https://your-ngrok-domain.ngrok-free.dev/slack/oauth/callback"

python app.py
```

The backend defaults to `http://127.0.0.1:5000`.

### Frontend Setup
```bash
cd frontend
npm install
npm run build
```

Load the Chrome extension by visiting `chrome://extensions`, enabling **Developer mode**, choosing **Load unpacked**, and pointing to `frontend/build`.

### Ngrok / HTTPS
Slack requires a publicly accessible HTTPS redirect. Use a tunnel (e.g., ngrok) pointing to your local backend and update `SLACK_REDIRECT_URL` plus the frontend’s `NGROK_URL` constant accordingly.

---

Once the backend and extension are running, navigate to a Slack workspace in Chrome, open the popup, connect to Slack, and start recording. The final transcript will appear after the repair step completes.

