/// <reference types="chrome" />
import { useState, useEffect } from 'react'
import { NGROK_URL } from '../constants'

const SLACK_WORKSPACES_KEY = 'slack_workspaces'

// Extract workspace ID from Slack URL (e.g., https://app.slack.com/client/T09RQDJ01L4/C123...)
const extractWorkspaceId = (url: string): string | null => {
    const match = url.match(/app\.slack\.com\/client\/(T[A-Z0-9]+)/)
    return match ? match[1] : null
}

// Extract channel ID from Slack URL (e.g., https://app.slack.com/client/T09RQDJ01L4/C123ABC456)
const extractChannelId = (url: string): string | null => {
    const match = url.match(/app\.slack\.com\/client\/T[A-Z0-9]+\/([CDG][A-Z0-9]+)/)
    return match ? match[1] : null
}

const useSlack = () => {
    const [isSlackTab, setIsSlackTab] = useState(false)
    const [isAuthenticated, setIsAuthenticated] = useState(false)
    const [isConnecting, setIsConnecting] = useState(false)
    const [accessToken, setAccessToken] = useState<string | null>(null)
    const [currentWorkspaceId, setCurrentWorkspaceId] = useState<string | null>(null)
    const [currentChannelId, setCurrentChannelId] = useState<string | null>(null)
    const [teamName, setTeamName] = useState<string | null>(null)
    const [slackTeamName, setSlackTeamName] = useState<string | null>(null)
    const [slackUsers, setSlackUsers] = useState<any[]>([])
    const [slackMessages, setSlackMessages] = useState<any[]>([])
    const [slackContextCache, setSlackContextCache] = useState<any>(null)
    const [lastFetchTime, setLastFetchTime] = useState<number>(0)

    // Check if we're on a Slack tab and extract workspace ID and channel ID
    useEffect(() => {
        const checkSlackTab = () => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                if (tabs.length > 0 && tabs[0].url) {
                    const url = tabs[0].url
                    const isSlack = url.includes('app.slack.com')
                    setIsSlackTab(isSlack)
                    
                    if (isSlack) {
                        const workspaceId = extractWorkspaceId(url)
                        const channelId = extractChannelId(url)
                        setCurrentWorkspaceId(workspaceId)
                        setCurrentChannelId(channelId)
                        console.log('Current workspace ID:', workspaceId)
                        console.log('Current channel ID:', channelId)
                    } else {
                        setCurrentWorkspaceId(null)
                        setCurrentChannelId(null)
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

    // Mark cache as stale when channel changes (but don't delete it)
    useEffect(() => {
        if (currentChannelId) {
            console.log('Channel changed, marking cache as stale')
            // Set lastFetchTime to 0 to force refresh on next fetch
            // but keep cached data in case API fails or is rate limited --> this was rate limiter is handled in the backend
            setLastFetchTime(0)
        }
    }, [currentChannelId])

    const fetchSlackContext = async (forceRefresh: boolean = false) => {
        if (!accessToken) {
            console.error('No access token available')
            return null
        }

        // Check cache (5 minutes expiry)
        const CACHE_DURATION = 5 * 60 * 1000 // 5 minutes
        const now = Date.now()
        
        if (!forceRefresh && slackContextCache && (now - lastFetchTime < CACHE_DURATION)) {
            console.log('Using cached Slack context')
            return slackContextCache
        }

        try {
            console.log(`Fetching Slack context for channel: ${currentChannelId || 'none'}`)
            
            // Build URL with channel ID if available
            const url = new URL(`${NGROK_URL}/slack/context`)
            if (currentChannelId) {
                url.searchParams.append('channel_id', currentChannelId)
            }
            
            const response = await fetch(url.toString(), {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${accessToken}`
                }
            })
            
            // Handle rate limiting - return cached data if available
            if (response.status === 429) {
                console.warn('⚠️ Rate limited by Slack API')
                const retryAfter = response.headers.get('Retry-After')
                if (retryAfter) {
                    console.warn(`Retry after: ${retryAfter} seconds`)
                }
                
                // Return cached data if available, don't invalidate
                if (slackContextCache) {
                    console.log('Using cached data due to rate limit')
                    return slackContextCache
                }
                
                return null
            }
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`)
            }
            
            const data = await response.json()
            
            // Check if Slack API returned an error (e.g., rate_limited)
            if (data.error) {
                if (data.error === 'rate_limited') {
                    console.warn('⚠️ Rate limited by Slack API')
                    // Return cached data, don't invalidate
                    if (slackContextCache) {
                        console.log('Using cached data due to rate limit')
                        return slackContextCache
                    }
                }
                throw new Error(`Slack API error: ${data.error}`)
            }
            
            // Only update cache and state on successful response
            setSlackTeamName(data.team_name)
            setSlackUsers(data.users || [])
            setSlackMessages(data.messages || [])
            
            // Update cache only on success
            setSlackContextCache(data)
            setLastFetchTime(now)
            
            console.log('✅ Slack context fetched successfully')
            console.log(`- Team: ${data.team_name}`)
            console.log(`- Users: ${data.users?.length || 0}`)
            console.log(`- Messages: ${data.messages?.length || 0}`)
            
            return data
        } catch (error) {
            console.error('Error fetching Slack context:', error)
            // On error, return cached data if available
            if (slackContextCache) {
                console.log('Using cached data due to error')
                return slackContextCache
            }
            return null
        }
    }

    return { 
        isSlackTab, 
        isAuthenticated, 
        isConnecting,
        accessToken,
        currentWorkspaceId,
        currentChannelId,
        teamName,
        connectToSlack,
        disconnectFromSlack,
        fetchSlackContext,
        slackTeamName,
        slackUsers,
        slackMessages,
    }
}

export default useSlack

