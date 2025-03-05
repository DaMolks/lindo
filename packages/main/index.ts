import { app } from 'electron'
import { Application } from './application'
import { setupRootStore } from './store'
import { setupTitlebar } from 'custom-electron-titlebar/main'
import { logger } from './logger'
import { electronLocalshortcut } from '@hfelix/electron-localshortcut'
import { getCurrentKeyboardLayout, getKeyMap } from 'native-keymap'

// prevent chrome using cpu instead of the gpu
app.commandLine.appendSwitch('ignore-gpu-blacklist', 'true')

// prevent throttling when window is not focus
app.commandLine.appendSwitch('disable-site-isolation-trials')
app.commandLine.appendSwitch('disable-renderer-backgrounding')
app.commandLine.appendSwitch('disable-background-timer-throttling')

// more webgl and less black screen (default is probably 16, maybe...)
app.commandLine.appendSwitch('max-active-webgl-contexts', '32')

electronLocalshortcut.setKeyboardLayout(getCurrentKeyboardLayout(), getKeyMap())

// Set application name for Windows 10+ notifications
if (process.platform === 'win32') app.setAppUserModelId(app.getName())

// Register as handler for dofustouch:// protocol
if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient('dofustouch', process.execPath, [process.argv[1]])
  }
} else {
  app.setAsDefaultProtocolClient('dofustouch')
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
  process.exit(0)
}

// Handle the protocol. In this case, we choose to show an existing game window or create a new one.
function handleProtocolUrl(url: string) {
  logger.debug(`Protocol URL received: ${url}`)
  // Example: dofustouch://authorized/?code=xxxxx
  // Extract the authorization code from URL
  const authCode = url.match(/code=([^&]+)/)
  if (authCode && authCode[1]) {
    // Pass the authorization code to game windows
    if (Application.instance) {
      Application.instance.handleAuthCode(authCode[1])
    }
  }
}

// Handle the protocol activation for macOS
app.on('open-url', (event, url) => {
  event.preventDefault()
  handleProtocolUrl(url)
})

// Handle second-instance which can contain the protocol url from user clicks
app.on('second-instance', (event, commandLine) => {
  logger.debug('App -> second-instance')
  
  // Handle protocol urls on Windows/Linux which are part of the commandLine
  const protocolUrl = commandLine.find(arg => arg.startsWith('dofustouch://'))
  if (protocolUrl) {
    handleProtocolUrl(protocolUrl)
  }
  
  if (Application.instance) {
    // Focus on the main window if the user tried to open another
    Application.instance.focusMainWindow()
  }
})

app.whenReady().then(async () => {
  logger.debug('App -> whenReady')
  setupTitlebar()
  const store = await setupRootStore()
  await Application.init(store)
  Application.instance.run()
  
  // Handle protocol urls on Windows/Linux which might be part of process.argv
  const protocolUrl = process.argv.find(arg => arg.startsWith('dofustouch://'))
  if (protocolUrl) {
    handleProtocolUrl(protocolUrl)
  }
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
