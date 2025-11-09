import { useState, useRef, useEffect } from "react"
import { NGROK_URL } from '../constants'

export interface LowConfidenceWord {
    word: string
    confidence: number
    start: number
    end: number
}

interface TranscriptionResult {
    transcription: string
    low_confidence_words: LowConfidenceWord[]
}

interface RepairResult {
    success: boolean
    original_transcription: string
    repaired_transcription: string
    words_repaired: number
}

interface UseRecordingProps {
    fetchSlackContext?: () => Promise<any>
    autoRepair?: boolean
}

const useRecording = ({ fetchSlackContext, autoRepair = true }: UseRecordingProps = {}) => {
    const [isRecording, setIsRecording] = useState(false)
    const [transcription, setTranscription] = useState<string | null>(null)
    const [repairedTranscription, setRepairedTranscription] = useState<string | null>(null)
    const [lowConfidenceWords, setLowConfidenceWords] = useState<LowConfidenceWord[]>([])
    const [isProcessing, setIsProcessing] = useState(false)
    const [isRepairing, setIsRepairing] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const mediaRecorderRef = useRef<MediaRecorder | null>(null)
    const audioChunksRef = useRef<Blob[]>([])
    const hasAutoRepaired = useRef(false)

    const startRecording = async () => {
        try {
            setError(null)
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
            const mediaRecorder = new MediaRecorder(stream)
            
            mediaRecorderRef.current = mediaRecorder
            audioChunksRef.current = []

            mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    audioChunksRef.current.push(event.data)
                }
            }

            mediaRecorder.onstop = async () => {
                const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' })
                await sendAudioToBackend(audioBlob)
                
                // Stop all tracks to release microphone
                stream.getTracks().forEach(track => track.stop())
            }

            mediaRecorder.start()
            setIsRecording(true)
        } catch (error) {
            console.error('Error starting recording:', error)
            setError('Failed to start recording. Please check microphone permissions.')
        }
    }

    const stopRecording = async () => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
            mediaRecorderRef.current.stop()
            setIsRecording(false)
        }
    }

    const toggleRecording = async () => {
        if (isRecording) {
            await stopRecording()
        } else {
            await startRecording()
        }
    }

    const sendAudioToBackend = async (audioBlob: Blob) => {
        setIsProcessing(true)
        setError(null)

        try {
            const formData = new FormData()
            formData.append('audio', audioBlob, 'recording.webm')

            const response = await fetch(`${NGROK_URL}/transcribe`, {
                method: 'POST',
                body: formData,
            })

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`)
            }

            const data: TranscriptionResult = await response.json()
            setTranscription(data.transcription)
            console.log('transcription: ', data.transcription)
            setLowConfidenceWords(data.low_confidence_words)
            console.log('low confidence words: ', data.low_confidence_words)
            
            // Reset repaired transcription when new transcription is created
            setRepairedTranscription(null)
            hasAutoRepaired.current = false
        } catch (error) {
            console.error('Error transcribing audio:', error)
            setError('Failed to transcribe audio. Please try again.')
        } finally {
            setIsProcessing(false)
        }
    }

    // Auto-repair effect: triggers when transcription is complete with low confidence words
    useEffect(() => {
        const shouldAutoRepair = 
            autoRepair && 
            transcription && 
            lowConfidenceWords.length > 0 && 
            !repairedTranscription && 
            !hasAutoRepaired.current &&
            !isProcessing &&
            !isRepairing &&
            fetchSlackContext

        if (shouldAutoRepair) {
            hasAutoRepaired.current = true
            
            const autoRepairTranscription = async () => {
                try {
                    console.log('🤖 Auto-repairing transcription...')
                    const context = await fetchSlackContext!()
                    if (context) {
                        await repairTranscription(context)
                    } else {
                        console.warn('Failed to fetch Slack context for auto-repair')
                    }
                } catch (error) {
                    console.error('Auto-repair failed:', error)
                }
            }

            autoRepairTranscription()
        }
    }, [transcription, lowConfidenceWords, repairedTranscription, isProcessing, isRepairing, autoRepair, fetchSlackContext])

    const repairTranscription = async (slackContext: any) => {
        if (!transcription || !lowConfidenceWords || lowConfidenceWords.length === 0) {
            console.log('No transcription or low confidence words to repair')
            return
        }

        setIsRepairing(true)
        setError(null)

        try {
            console.log('🔧 Repairing transcription with Slack context...')
            
            const response = await fetch(`${NGROK_URL}/repair_low_confidence_words`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    transcription: transcription,
                    low_confidence_words: lowConfidenceWords,
                    slack_context: slackContext
                })
            })

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`)
            }

            const data: RepairResult = await response.json()
            
            if (data.success) {
                setRepairedTranscription(data.repaired_transcription)
                console.log('✅ Transcription repaired successfully')
                console.log('Original:', data.original_transcription)
                console.log('Repaired:', data.repaired_transcription)
            } else {
                throw new Error('Repair failed')
            }
        } catch (error) {
            console.error('❌ Error repairing transcription:', error)
            setError('Failed to repair transcription. Using original.')
        } finally {
            setIsRepairing(false)
        }
    }

    return { 
        isRecording, 
        transcription,
        repairedTranscription,
        lowConfidenceWords,
        isProcessing,
        isRepairing,
        error,
        toggleRecording,
        startRecording,
        stopRecording
    }
}

export default useRecording
