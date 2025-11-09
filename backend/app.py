from flask import Flask, request, jsonify, redirect
from flask_cors import CORS
from dotenv import load_dotenv
import os
from openai import OpenAI
import whisper_timestamped as whisper
import requests
from urllib.parse import urlencode
import traceback

load_dotenv()

app = Flask(__name__)
CORS(app)

client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

# getting Slack APIs
slack_client_id = os.getenv("SLACK_CLIENT_ID")
slack_client_secret = os.getenv("SLACK_CLIENT_SECRET")
slack_redirect_uri = os.getenv("SLACK_REDIRECT_URL")

# Debug: Print environment variables on startup
print(f"DEBUG - SLACK_CLIENT_ID: {slack_client_id}")
print(f"DEBUG - SLACK_REDIRECT_URL: {slack_redirect_uri}")

if not slack_redirect_uri:
    print("WARNING: SLACK_REDIRECT_URL is not set in .env file!")

whisper_model = whisper.load_model("base")

@app.route('/transcribe', methods=['POST'])
def transcribe():
    try:
        if 'audio' not in request.files:
            return jsonify({'error': 'No audio file provided'}), 400
        
        audio_file = request.files['audio']
        
        if audio_file.filename == '':
            return jsonify({'error': 'No selected file'}), 400
        
        # Save the uploaded file temporarily
        temp_path = f"temp_{audio_file.filename}"
        audio_file.save(temp_path)
        
        print(f"Saved audio file to {temp_path}")
        print(f"File size: {os.path.getsize(temp_path)} bytes")
        
        # Transcribe with word-level timestamps and confidence scores
        print("Starting transcription...")
        result = whisper.transcribe(whisper_model, temp_path)
        print("Transcription complete!")
        
        # Clean up temp file
        os.remove(temp_path)
        
        # Extract low confidence words (confidence < 0.8)
        low_confidence_words = []
        for segment in result.get('segments', []):
            for word in segment.get('words', []):
                if word.get('confidence', 1.0) < 0.8:
                    low_confidence_words.append({
                        'word': word['text'],
                        'confidence': word['confidence'],
                        'start': word['start'],
                        'end': word['end']
                    })
        
        return jsonify({
            'transcription': result['text'],
            'low_confidence_words': low_confidence_words,
            'full_result': result
        })
    
    except Exception as e:
        print(f"Error during transcription: {str(e)}")
        traceback.print_exc()
        
        # Clean up temp file if it exists
        if 'temp_path' in locals() and os.path.exists(temp_path):
            os.remove(temp_path)
        
        return jsonify({'error': str(e)}), 500

@app.route('/slack/oauth/authorize', methods=['GET'])
def slack_oauth_authorize():
    """Redirect user to Slack OAuth authorization page (user token only)"""
    params = {
        'client_id': slack_client_id,
        'user_scope': 'channels:history,channels:read,users:read,groups:history,groups:read,im:read,im:history,mpim:read,mpim:history,chat:write',
        'redirect_uri': slack_redirect_uri,
    }
    auth_url = f"https://slack.com/oauth/v2/authorize?{urlencode(params)}"
    return redirect(auth_url)

@app.route('/slack/oauth/callback', methods=['GET'])
def slack_oauth_callback():
    """Handle OAuth callback from Slack"""
    code = request.args.get('code')
    
    try:
        # Exchange code for access token
        response = requests.post('https://slack.com/api/oauth.v2.access', data={
            'client_id': slack_client_id,
            'client_secret': slack_client_secret,
            'code': code,
            'redirect_uri': slack_redirect_uri
        })
        
        data = response.json()
        
        print(f"DEBUG - Slack OAuth response: {data}")
        
        # For user-token only apps, the token is in authed_user
        user_token = data.get('authed_user', {}).get('access_token')
        
        # Redirect back with token info as URL parameters
        params = urlencode({
            'access_token': user_token,
            'team_id': data.get('team', {}).get('id'),
            'team_name': data.get('team', {}).get('name'),
            'user_id': data.get('authed_user', {}).get('id')
        })
        
        # Return simple HTML page that will be detected by background script
        return f"""
        <html>
        <head><title>Slack OAuth Success</title></head>
        <body>
            <h1>Connected to Slack successfully!</h1>
            <p>You can close this tab.</p>
            <script>
                window.location.href = window.location.origin + window.location.pathname + '?{params}';
            </script>
        </body>
        </html>
        """
    
    except Exception as e:
        print(f"Error during OAuth: {str(e)}")
        traceback.print_exc()

@app.route('/')
def index():
    return jsonify({'message': 'Hello, World!'})


if __name__ == '__main__':
    app.run(debug=True)
