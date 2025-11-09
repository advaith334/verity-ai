import useRecording from '../hooks/useRecording'
import useSlack from '../hooks/useSlack'

const RecorderControl = () => {
    const { 
        isSlackTab, 
        isAuthenticated, 
        isConnecting, 
        connectToSlack, 
        disconnectFromSlack,
        fetchSlackContext
    } = useSlack()

    const { 
        isRecording, 
        repairedTranscription,
        isProcessing,
        error,
        toggleRecording
    } = useRecording({ fetchSlackContext, autoRepair: true })
    
    const isButtonDisabled = !isSlackTab || isProcessing || !isAuthenticated
    const displayTranscription = repairedTranscription

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
                        </div>

                        {/* Error Message */}
                        {error && (
                            <div className="error-message">
                                ⚠️ {error}
                            </div>
                        )}

                        {/* Transcription Result */}
                        {displayTranscription && (
                            <div className="results-container">
                                <div className="transcription-section">
                                    <div className="section-header">
                                        <h3 className="section-title">Transcription</h3>
                                    </div>
                                    <div className={`transcription-text ${repairedTranscription ? 'repaired' : ''}`}>
                                        {displayTranscription}
                                    </div>
                                </div>

                                {isProcessing && (
                                <div className="processing-message">
                                    <span className="spinner">⌛</span>
                                    Processing...
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
