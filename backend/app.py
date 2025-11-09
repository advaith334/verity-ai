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
        'user_scope': 'channels:history,channels:read,users:read,groups:history,groups:read,im:read,im:history,mpim:read,mpim:history',
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
    
    except Exception as e:
        print(f"Error during OAuth: {str(e)}")
        traceback.print_exc()

@app.route('/slack/context', methods=['GET'])
def slack_context():
    """Fetch Slack context: team info, users, and channel messages"""
    auth_header = request.headers.get('Authorization')
    channel_id = request.args.get('channel_id')
    
    if not auth_header or not auth_header.startswith('Bearer '):
        return jsonify({'error': 'Missing or invalid authorization header'}), 401
    
    access_token = auth_header.split('Bearer ')[1]
    
    try:
        # Get users list
        users_response = requests.get('https://slack.com/api/users.list', headers={
            'Authorization': f'Bearer {access_token}'
        })
        users_data = users_response.json()
        
        # Check for rate limiting
        if users_response.status_code == 429:
            retry_after = users_response.headers.get('Retry-After', '60')
            return jsonify({'error': 'rate_limited', 'retry_after': retry_after}), 429
        
        if users_data.get('error') == 'rate_limited':
            return jsonify({'error': 'rate_limited'}), 429
        
        # Extract user names
        users = []
        if users_data.get('ok'):
            users = [
                {
                    'id': user['id'],
                    'name': user.get('real_name') or user.get('name'),
                    'display_name': user.get('profile', {}).get('display_name') or user.get('name')
                }
                for user in users_data.get('members', [])
                if not user.get('deleted') and not user.get('is_bot')
            ]
        
        # Get channel messages if channel_id provided
        messages = []
        if channel_id:
            messages_response = requests.get('https://slack.com/api/conversations.history', 
                params={'channel': channel_id, 'limit': 50},
                headers={'Authorization': f'Bearer {access_token}'}
            )
            messages_data = messages_response.json()
            
            # Check for rate limiting
            if messages_response.status_code == 429:
                retry_after = messages_response.headers.get('Retry-After', '60')
                return jsonify({'error': 'rate_limited', 'retry_after': retry_after}), 429
            
            if messages_data.get('error') == 'rate_limited':
                return jsonify({'error': 'rate_limited'}), 429
            
            if messages_data.get('ok'):
                messages = [
                    {
                        'text': msg.get('text'),
                        'user': msg.get('user'),
                        'ts': msg.get('ts'),
                        'type': msg.get('type')
                    }
                    for msg in messages_data.get('messages', [])
                    if msg.get('type') == 'message'
                ]
        
        return jsonify({
            'users': users,
            'messages': messages,
            'channel_id': channel_id
        })
    
    except Exception as e:
        print(f"Error fetching Slack context: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

@app.route('/')
def index():
    return jsonify({'message': 'Hello, World!'})


if __name__ == '__main__':
    app.run(debug=True)
