/// <reference types="chrome" />

const SLACK_WORKSPACES_KEY = 'slack_workspaces'

chrome.runtime.onInstalled.addListener(() => {
    console.log('Extension installed')
})

// Listen for OAuth callback and save credentials per workspace
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (changeInfo.url && changeInfo.url.includes('/slack/oauth/callback')) {
        const url = new URL(changeInfo.url)
        const params = new URLSearchParams(url.search)
        
        console.log('OAuth callback detected:', changeInfo.url)
        
        if (params.has('access_token')) {
            const accessToken = params.get('access_token')
            const teamId = params.get('team_id')
            const teamName = params.get('team_name')
            
            if (!teamId) {
                console.error('No team_id in OAuth response')
                return
            }
            
            console.log(`Saving credentials for workspace: ${teamName} (${teamId})`)
            
            // Get existing workspaces and append/update this one
            chrome.storage.local.get([SLACK_WORKSPACES_KEY], (result) => {
                const workspaces = result[SLACK_WORKSPACES_KEY] || {}
                
                // Add or update this workspace
                workspaces[teamId] = {
                    access_token: accessToken,
                    team_id: teamId,
                    team_name: teamName,
                    connected_at: new Date().toISOString()
                }
                
                // Save updated workspaces object
                chrome.storage.local.set({ [SLACK_WORKSPACES_KEY]: workspaces }, () => {
                    console.log('✅ Workspace credentials saved successfully!')
                    console.log(`Workspace: ${teamName} (${teamId})`)
                    console.log(`Total workspaces: ${Object.keys(workspaces).length}`)
                    
                    // Close the OAuth tab after a short delay
                    setTimeout(() => {
                        chrome.tabs.remove(tabId)
                    }, 1000)
                })
            })
        } else if (params.has('error')) {
            console.error('OAuth error:', params.get('error'))
            
            // Close the OAuth tab after showing error
            setTimeout(() => {
                chrome.tabs.remove(tabId)
            }, 3000)
        }
    }
})
