/// <reference types="chrome" />
import { useState, useEffect } from 'react'

const useSlack = () => {
    const [isSlackTab, setIsSlackTab] = useState(false)

    useEffect(() => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs.length > 0) {
                setIsSlackTab(tabs[0].url?.includes('app.slack.com') ?? false)
            }
        })
    }, [])

    return { isSlackTab }
}

export default useSlack
