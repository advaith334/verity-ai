from flask import Flask, request, jsonify
from flask_cors import CORS
from dotenv import load_dotenv
import os
from openai import OpenAI
import whisper_timestamped as whisper

load_dotenv()

app = Flask(__name__)
CORS(app)

client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

# getting Slack APIs
slack_client_id = os.getenv("SLACK_CLIENT_ID")
slack_client_secret = os.getenv("SLACK_CLIENT_SECRET")
slack_redirect_uri = os.getenv("SLACK_REDIRECT_URI")

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
        import traceback
        traceback.print_exc()
        
        # Clean up temp file if it exists
        if 'temp_path' in locals() and os.path.exists(temp_path):
            os.remove(temp_path)
        
        return jsonify({'error': str(e)}), 500

@app.route('/')
def index():
    return jsonify({'message': 'Hello, World!'})


if __name__ == '__main__':
    app.run(debug=True)
