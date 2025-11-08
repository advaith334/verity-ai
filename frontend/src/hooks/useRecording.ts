import { useState, useRef } from "react"

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

const useRecording = () => {
    const [isRecording, setIsRecording] = useState(false)
    const [transcription, setTranscription] = useState<string | null>(null)
    const [lowConfidenceWords, setLowConfidenceWords] = useState<LowConfidenceWord[]>([])
    const [isProcessing, setIsProcessing] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const mediaRecorderRef = useRef<MediaRecorder | null>(null)
    const audioChunksRef = useRef<Blob[]>([])

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

            const response = await fetch('http://localhost:5000/transcribe', {
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
        } catch (error) {
            console.error('Error transcribing audio:', error)
            setError('Failed to transcribe audio. Please try again.')
        } finally {
            setIsProcessing(false)
        }
    }

    return { 
        isRecording, 
        transcription, 
        lowConfidenceWords,
        isProcessing,
        error,
        toggleRecording,
        startRecording,
        stopRecording
    }
}

export default useRecording
