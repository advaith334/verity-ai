import useRecording from '../hooks/useRecording'
import useSlack from '../hooks/useSlack'

const RecorderControl = () => {
    const { 
        isRecording, 
        transcription, 
        lowConfidenceWords,
        isProcessing,
        error,
        toggleRecording
    } = useRecording()
    
    const { isSlackTab, isAuthenticated, isConnecting, connectToSlack, disconnectFromSlack } = useSlack()
    
    const isButtonDisabled = !isSlackTab || isProcessing || !isAuthenticated

    return (
        <div className="recorder-container">
            <div className="recorder-card">
                <h2 className="recorder-title">Verity AI - Voice Recording</h2>
                
                {!isSlackTab && (
                    <div className="error-message">
                        ⚠️ Please navigate to a Slack tab to use this extension
                    </div>
                )}
                
                {/* Connect to Slack Button - Only show when ON Slack tab and not authenticated */}
                {isSlackTab && !isAuthenticated && (
                    <div className="controls-container">
                        <button 
                            onClick={connectToSlack}
                            disabled={isConnecting}
                            className={`connect-slack-button ${isConnecting ? 'disabled' : ''}`}
                        >
                            {isConnecting ? (
                                <>
                                    <span className="spinner">⌛</span>
                                    Connecting...
                                </>
                            ) : (
                                <>
                                    <span className="slack-icon">💬</span>
                                    Connect to Slack
                                </>
                            )}
                        </button>
                    </div>
                )}

                {/* Disconnect Button - Only show when authenticated */}
                {isAuthenticated && (
                    <div className="auth-status">
                        <span className="auth-badge">
                            ✅ Connected
                        </span>
                        <button 
                            onClick={disconnectFromSlack}
                            className="disconnect-button"
                        >
                            Disconnect
                        </button>
                    </div>
                )}
                
                {/* Recording Controls - Only show when authenticated */}
                {isAuthenticated && (
                    <>
                        <div className="controls-container">
                            <button 
                                onClick={toggleRecording}
                                disabled={isButtonDisabled}
                                className={`record-button ${isRecording ? 'recording-active' : ''} ${isButtonDisabled ? 'disabled' : ''}`}
                            >
                                {isRecording ? (
                                    <>
                                        <span className="recording-dot">●</span>
                                        Stop Recording
                                    </>
                                ) : (
                                    <>
                                        <span className="mic-icon">🎤</span>
                                        Start Recording
                                    </>
                                )}
                            </button>
                            
                            {isProcessing && (
                                <div className="processing-message">
                                    <span className="spinner">⌛</span>
                                    Processing audio...
                                </div>
                            )}
                        </div>

                        {/* Error Message */}
                        {error && (
                            <div className="error-message">
                                ⚠️ {error}
                            </div>
                        )}

                        {/* Transcription Result */}
                        {transcription && (
                            <div className="results-container">
                                <div className="transcription-section">
                                    <h3 className="section-title">Transcription</h3>
                                    <div className="transcription-text">
                                        {transcription}
                                    </div>
                                </div>

                                {/* Low Confidence Words */}
                                {lowConfidenceWords.length > 0 && (
                                    <div className="low-confidence-section">
                                        <h3 className="section-title">
                                            ⚠️ Low Confidence Words ({lowConfidenceWords.length})
                                        </h3>
                                        <div className="words-grid">
                                            {lowConfidenceWords.map((item, index) => (
                                                <div key={index} className="word-card">
                                                    <div className="word-text">"{item.word}"</div>
                                                    <div className="confidence-score">
                                                        Confidence: {(item.confidence * 100).toFixed(1)}%
                                                    </div>
                                                    <div className="timestamp">
                                                        {item.start.toFixed(2)}s - {item.end.toFixed(2)}s
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {lowConfidenceWords.length === 0 && (
                                    <div className="success-message">
                                        ✅ All words were transcribed with high confidence!
                                    </div>
                                )}
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    )
}

export default RecorderControl
