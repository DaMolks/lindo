import { DofusWindow, HTMLIFrameElementWithDofus } from '@/dofus-window'
import { useGameContext } from '@/providers'
import { useStores } from '@/store'
import { Game } from '@/store/game-store/game'
import { useI18nContext } from '@lindo/i18n'
import { reaction } from 'mobx'
import React, { memo, useEffect, useRef, useState } from 'react'
import { useGameManager } from './use-game-manager'

export interface GameScreenProps {
  game: Game
}

// eslint-disable-next-line react/display-name
export const GameScreen = memo(({ game }: GameScreenProps) => {
  const gameContext = useGameContext()
  const rootStore = useStores()
  const { LL } = useI18nContext()
  const gameManager = useGameManager({
    game,
    rootStore,
    LL
  })
  const iframeGameRef = useRef<HTMLIFrameElementWithDofus>(null)
  const [gameWindow, setGameWindow] = useState<DofusWindow | null>(null)
  const [authCodeReady, setAuthCodeReady] = useState<string | null>(null)
  
  // Effect to handle protocol authentication code
  useEffect(() => {
    // Subscribe to protocol auth events
    const unsubscribe = window.lindoAPI.subscribeToProtocolAuth((authCode) => {
      console.log(`[GameScreen] Received auth code: ${authCode}`)
      
      if (iframeGameRef.current?.contentWindow) {
        // If the game window is already available, process the authCode immediately
        handleAuthCode(authCode, iframeGameRef.current.contentWindow)
      } else {
        // Otherwise, store it for when the game loads
        setAuthCodeReady(authCode)
      }
    })
    
    return () => {
      unsubscribe()
    }
  }, [])
  
  // Function to handle authentication with the received code
  const handleAuthCode = (authCode: string, dWindow: DofusWindow) => {
    try {
      console.log(`[GameScreen] Processing auth code in game window: ${authCode}`)
      
      // Check if the window is initialized and login screen is available
      if (dWindow && dWindow.gui && dWindow.gui.loginScreen) {
        // We simulate a script injection and connection
        const script = document.createElement('script')
        script.textContent = `
          try {
            console.log("Authenticating with code: ${authCode}");
            // This is the part that would need to be customized based on how Dofus handles these auth codes
            
            // For example, it might be something like:
            if (window.gui && window.gui.loginScreen) {
              // Set connection method to use the auth code
              window.gui.loginScreen._connectMethodType = "auth";
              
              // Call the appropriate auth method with the code
              // This is where you'd need to investigate what actual method is used
              if (typeof window.gui.loginScreen.connectWithAuthCode === 'function') {
                window.gui.loginScreen.connectWithAuthCode("${authCode}");
              } else if (typeof window.gui.loginScreen._loginWithAuthCode === 'function') {
                window.gui.loginScreen._loginWithAuthCode("${authCode}");
              } else {
                // Try to use the auth code with the login function directly
                window.gui.loginScreen._login("", "", false, "${authCode}");
              }
            }
          } catch (err) {
            console.error("Error during auth:", err);
          }
        `
        
        // Insert the script into the game iframe
        const iframeDoc = iframeGameRef.current?.contentDocument || iframeGameRef.current?.contentWindow?.document
        if (iframeDoc) {
          iframeDoc.body.appendChild(script)
          // Clean up
          setTimeout(() => {
            iframeDoc.body.removeChild(script)
          }, 100)
        }
      }
    } catch (error) {
      console.error('[GameScreen] Error processing auth code:', error)
    }
  }

  useEffect(() => {
    return reaction(
      () => rootStore.gameStore.selectedGame,
      (selectedGame) => {
        if (selectedGame?.id === game.id) {
          setTimeout(() => {
            iframeGameRef.current?.focus()
          }, 100)
        }
      },
      { fireImmediately: true }
    )
  }, [])

  const handleLoad = () => {
    if (iframeGameRef.current) {
      const gameWindow = iframeGameRef.current.contentWindow
      setGameWindow(gameWindow)

      // If we have an auth code ready, process it
      if (authCodeReady) {
        handleAuthCode(authCodeReady, gameWindow)
        setAuthCodeReady(null)
      }

      // only for debug purpose
      gameWindow.findSingleton = (searchKey: string, window: DofusWindow) => {
        const singletons = Object.values(window.singletons.c)

        const results = singletons.filter(({ exports }) => {
          if (!!exports.prototype && searchKey in exports.prototype) {
            return true
          } else if (searchKey in exports) {
            return true
          } else return false
        })

        if (results.length > 1) {
          window.lindoAPI.logger.error(
            `[MG] Singleton searcher found multiple results for key "${searchKey}". Returning all of them.`
          )()
          return results
        }

        return results.pop()
      }

      // can't use SQL Database in modern iframe
      gameWindow.openDatabase = undefined
      gameWindow.initDofus(() => {
        window.lindoAPI.logger.info('initDofus done')()
        gameManager.init(gameWindow)
      })
    }
  }

  return (
    <iframe
      id={`iframe-game-${game.id}`}
      ref={iframeGameRef}
      onLoad={handleLoad}
      style={{ border: 'none', width: '100%', height: '100%' }}
      src={gameContext.gameSrc}
    />
  )
})
