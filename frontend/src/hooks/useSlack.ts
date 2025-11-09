/// <reference types="chrome" />
import { useState, useEffect } from 'react'
import { NGROK_URL } from '../constants'

const SLACK_WORKSPACES_KEY = 'slack_workspaces'

// Extract workspace ID from Slack URL (e.g., https://app.slack.com/client/T09RQDJ01L4/...)
const extractWorkspaceId = (url: string): string | null => {
    const match = url.match(/app\.slack\.com\/client\/(T[A-Z0-9]+)/)
    return match ? match[1] : null
}

const useSlack = () => {
    const [isSlackTab, setIsSlackTab] = useState(false)
    const [isAuthenticated, setIsAuthenticated] = useState(false)
    const [isConnecting, setIsConnecting] = useState(false)
    const [accessToken, setAccessToken] = useState<string | null>(null)
    const [currentWorkspaceId, setCurrentWorkspaceId] = useState<string | null>(null)
    const [teamName, setTeamName] = useState<string | null>(null)

    // Check if we're on a Slack tab and extract workspace ID
    useEffect(() => {
        const checkSlackTab = () => {
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                if (tabs.length > 0 && tabs[0].url) {
                    const url = tabs[0].url
                    const isSlack = url.includes('app.slack.com')
                    setIsSlackTab(isSlack)
                    
                    if (isSlack) {
                        const workspaceId = extractWorkspaceId(url)
                        setCurrentWorkspaceId(workspaceId)
                        console.log('Current workspace ID:', workspaceId)
                    } else {
                        setCurrentWorkspaceId(null)
                    }
                }
            })
        }
        
        checkSlackTab()
        
        // Listen for tab updates to detect workspace changes
        const tabUpdateListener = (_tabId: number, changeInfo: any) => {
            if (changeInfo.url) {
                checkSlackTab()
            }
        }
        
        chrome.tabs.onUpdated.addListener(tabUpdateListener)
        
        return () => {
            chrome.tabs.onUpdated.removeListener(tabUpdateListener)
        }
    }, [])

    // Check for token when workspace changes
    useEffect(() => {
        if (!currentWorkspaceId) {
            setIsAuthenticated(false)
            setAccessToken(null)
            setTeamName(null)
            return
        }

        chrome.storage.local.get([SLACK_WORKSPACES_KEY], (result) => {
            const workspaces = result[SLACK_WORKSPACES_KEY] || {}
            const workspaceData = workspaces[currentWorkspaceId]
            
            if (workspaceData && workspaceData.access_token) {
                setAccessToken(workspaceData.access_token)
                setTeamName(workspaceData.team_name)
                setIsAuthenticated(true)
                console.log(`✅ Token found for workspace: ${workspaceData.team_name} (${currentWorkspaceId})`)
            } else {
                setAccessToken(null)
                setTeamName(null)
                setIsAuthenticated(false)
                console.log(`❌ No token found for workspace: ${currentWorkspaceId}`)
            }
        })
    }, [currentWorkspaceId])

    // Listen for storage changes (when background script saves credentials)
    useEffect(() => {
        const storageListener = (changes: any) => {
            if (changes[SLACK_WORKSPACES_KEY] && currentWorkspaceId) {
                const newWorkspaces = changes[SLACK_WORKSPACES_KEY].newValue || {}
                const workspaceData = newWorkspaces[currentWorkspaceId]
                
                if (workspaceData) {
                    console.log('Workspace credentials updated')
                    setAccessToken(workspaceData.access_token)
                    setTeamName(workspaceData.team_name)
                    setIsAuthenticated(true)
                    setIsConnecting(false)
                }
            }
        }

        chrome.storage.onChanged.addListener(storageListener)
        
        return () => {
            chrome.storage.onChanged.removeListener(storageListener)
        }
    }, [currentWorkspaceId])

    const connectToSlack = () => {
        setIsConnecting(true)
        // Open OAuth authorization URL in new tab
        const authUrl = `${NGROK_URL}/slack/oauth/authorize`
        chrome.tabs.create({ url: authUrl })
    }

    const disconnectFromSlack = () => {
        if (!currentWorkspaceId) return
        
        chrome.storage.local.get([SLACK_WORKSPACES_KEY], (result) => {
            const workspaces = result[SLACK_WORKSPACES_KEY] || {}
            delete workspaces[currentWorkspaceId]
            
            chrome.storage.local.set({ [SLACK_WORKSPACES_KEY]: workspaces }, () => {
                console.log(`Removed credentials for workspace: ${currentWorkspaceId}`)
                setAccessToken(null)
                setTeamName(null)
                setIsAuthenticated(false)
            })
        })
    }

    return { 
        isSlackTab, 
        isAuthenticated, 
        isConnecting,
        accessToken,
        currentWorkspaceId,
        teamName,
        connectToSlack,
        disconnectFromSlack
    }
}

export default useSlack

