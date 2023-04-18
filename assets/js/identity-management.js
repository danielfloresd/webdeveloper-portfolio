// @flow

import { getEnvVarValue, getEnvVarValueOpt } from './env'
import { subscribe as subscribeWithIpc } from '@atomos/atomizer-desktop/client/ipc'
import { ipcChannel, ipcTopics } from '@treadstone/utils/auth'
import { publish as publishWithIpc } from '@atomos/atomizer-desktop/client/ipc'

import express from 'express'
import opn from 'opn'
import fetch, { Response } from 'node-fetch'
import decode from 'jwt-decode'
import { URLSearchParams } from 'url'

import {
  showMainWindow,
  disableMainWindow,
  enableMainWindow,
  loadLoginWindow,
  closeLoginWindow,
  showLoginWindow
} from './window'
import { showNotification } from './notifications'
import { subscribe } from '@atomos/atomizer-desktop/ipc'

const PORT = 3000

// For testing purposes, enable electron loginwindow

const LOGIN_ELECTRON_WINDOW = true

const REACT_APP_CLIENT_ID = getEnvVarValueOpt('REACT_APP_CLIENT_ID')
const REACT_APP_REALM = getEnvVarValueOpt('REACT_APP_REALM', false)
const REACT_APP_GATEWAY_URL = getEnvVarValueOpt('REACT_APP_GATEWAY_URL', false)
const REACT_APP_TOKEN_AUTO_REFRESH = getEnvVarValueOpt(
  'REACT_APP_TOKEN_AUTO_REFRESH',
  false
)
const REACT_APP_REDIRECT_URI =
  getEnvVarValueOpt('REACT_APP_REDIRECT_URI') ||
  'http://localhost:3000/redirect-uri'

const iamConfig = {
  realm: REACT_APP_REALM,
  gatewayURL: REACT_APP_GATEWAY_URL,
  clientId: REACT_APP_CLIENT_ID,
  redirectUri: REACT_APP_REDIRECT_URI,
  tokenAutoRefresh: REACT_APP_TOKEN_AUTO_REFRESH,
  enabled: false
}

let isLoggedIn = false

/* Current timer used for auto-refreshing the token */
let autoRefreshTimeout = null

const loginURL = `${iamConfig.gatewayURL}/realms/${iamConfig.realm}/protocol/openid-connect/auth?client_id=${iamConfig.clientId}&redirect_uri=${iamConfig.redirectUri}&response_mode=query&response_type=code&scope=openid`
const logoutURL = `${iamConfig.gatewayURL}/realms/${iamConfig.realm}/protocol/openid-connect/logout`
const tokenURL = `${iamConfig.gatewayURL}/realms/${iamConfig.realm}/protocol/openid-connect/token`
// console.log('**************** IAM CONFIG ****************', aimConfig)

type Token = {
  token?: string,
  expires?: Date,
  tokenType: string
}

type Tokens = {
  accessToken: Token, // token used to access protected resources
  refreshToken: Token, // token used to request new access tokens
  idToken: Token // token used to identify user
}

type TokenRequest = {
  grant_type: string,
  client_id: string,
  code?: string,
  redirect_uri: string,
  refresh_token?: string
}

type User = {
  exp: number,
  iat: number,
  auth_time: number,
  jti: string,
  iss: string,
  aud: string,
  sub: string,
  typ: string,
  azp: string,
  session_state: string,
  at_hash: string,
  acr: string,
  sid: string,
  email_verified: boolean,
  name: string,
  preferred_username: string,
  given_name: string,
  family_name: string,
  email: string
}

var user: User = {}

const tokens: Tokens = {
  accessToken: {
    tokenType: 'access_token'
  },
  refreshToken: {
    tokenType: 'refresh_token'
  },
  idToken: {
    tokenType: 'Bearer'
  }
}

// Validate the IAM config
// If the clientID is set, then the realm and gatewayURL must also be set.
// If the clientID is not set, then the realm and gatewayURL must not be set.
// If the clientID is set, then the IAM config is enabled.

const validateConfig = (): void => {
  // Check that if CLIENT_ID is set, then REALM and GATEWAY_URL are also set
  if (iamConfig.clientId !== undefined) {
    if (
      iamConfig.realm === undefined ||
      iamConfig.realm === null ||
      iamConfig.realm === ''
    ) {
      throw new Error(
        'REACT_APP_REALM must be set if REACT_APP_CLIENT_ID is set!'
      )
    }
    if (
      iamConfig.gatewayURL === undefined ||
      iamConfig.gatewayURL === null ||
      iamConfig.gatewayURL === ''
    ) {
      throw new Error(
        'REACT_APP_GATEWAY_URL must be set if REACT_APP_CLIENT_ID is set!'
      )
    }
    iamConfig.enabled = true
  }
}

// Returns true if IAM is enabled, false otherwise.
// The aimConfig.enabled flag is set in the config file
// when the app starts up.

export const isAuthEnabled = (): boolean => {
  validateConfig()
  return iamConfig.enabled
}

/* Returns true if the user is logged in, false otherwise.
/ Exported for external use.
*/
export const isLoginWindowEnabled = (): boolean => {
  return LOGIN_ELECTRON_WINDOW
}

/**
 * Checks whether automatic token refresh is enabled in the IAM configuration.
 * @returns {boolean} `true` if automatic token refresh is enabled, `false` otherwise.
 */
export const isTokenAutoRefreshEnabled = (): boolean => {
  // Retrieve the value of the `tokenAutoRefresh` property from the IAM configuration
  // and return `true` if it is set to the string value 'true', `false` otherwise.
  return iamConfig.tokenAutoRefresh === 'true'
}

/**
 * Retrieves the authentication token from the `tokens` object when expired or non existent
 * @returns {Promise<Token>} A Promise that resolves to a `Token` object.
 */
export const getIDToken = async (): Promise<Token> => {
  // Load the `tokens` object using an asynchronous function called `hydrateTokens()`
  if (isTokenExpired(tokens?.idToken)) {
    await hydrateTokens()
  }
  // Return the `idToken` property from the `tokens` object
  return tokens.idToken
}

/**
 * Retrieves the access token from the `tokens` object when expired or nonexistent. Which should be used to access external API
 * @returns {Promise<Token>} A Promise that resolves to a `Token` object.
 */
export const getAccessToken = async (): Promise<Token> => {
  // Load the `tokens` object using an asynchronous function called `hydrateTokens()`
  if (isTokenExpired(tokens?.accessToken)) {
    await hydrateTokens()
  }
  // Return the `accessToken` property from the `tokens` object
  return tokens.accessToken
}

function isTokenExpired(token: Token | null): boolean {
  if (!token && token.token !== undefined) {
    return true
  }
  const decodedToken = parseJwt(token.token)
  const currentTime = Date.now() / 1000 // convert to Unix time
  return decodedToken.exp < currentTime
}

function parseJwt(token: string) {
  return JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString())
}

export const getUserName = (): string => {
  // Load the `tokens` object using an asynchronous function called `hydrateTokens()`
  // Check if family_name is set, if not, use preferred_username
  // if(user.family_name && user.given_name) {
  //   return `${user.given_name} ${user.family_name}`
  // }
  return user.preferred_username
}

/**
 * Opens the Keycloak login page in the default browser.
 * @returns {void}
 */
const login = (): void => {
  // Open the login URL in the default browser
  if (isLoginWindowEnabled()) {
    loadLoginWindow(loginURL)
  } else {
    opn(loginURL)
  }
  isLoggedIn = true
}

export const startAuth = (): void => {
  // If IAM is enabled, then call the `login()` function
  setup()
  login()
}
/**
 * Logs the user out of the Keycloak session.
 * @returns {void}
 */
export const logout = (): void => {
  opn(logoutURL)
  if (isLoggedIn) disableMainWindow()
  login()
}

/**
 * Stores the given user object in the local state.
 * @param {User} newUser - The user object to store.
 * @returns {void}
 */
const storeUser = (newUser: User): void => {
  // Set the `user` variable to the given `newUser` object
  user = newUser
}

/**
 * Sets up the server to handle the authentication flow and launches the main window.
 * @returns {Promise<void>} A Promise that resolves when the setup is complete.
 */
const setup = async (): Promise<void> => {
  // Validate the IAM configuration
  // Create an Express app instance
  const app = express()

  // Parse the redirect URI from the IAM configuration
  const redirectUri = new URL(iamConfig.redirectUri)
  // Create a route to handle authentication redirects
  app.get(redirectUri.pathname, async (req, res) => {
    // Extract the authentication code from the query parameters
    const code = req.query.code

    if (code) {
      // Exchange the authentication code for an access token
      await tokenExchange(code)
      res.status(200)
      await notifyLogin()
    } else {
      // If no authentication code is present, show an error message
      const responseHTML = `<html><h3>HxGN Launcher failed to login!</h3></html>`
      res.send(responseHTML)
    }
  })

  // Start the server
  app.listen(PORT, () => {
    console.log(`Server listening at http://localhost:${PORT}`)
  })

  subscribe(ipcChannel, ipcTopics.GET_TOKEN, async () => {
    return await getIDToken()
  })

  subscribe(ipcChannel, ipcTopics.GET_USER, async () => {
    const username = getUserName()
    return username
  })

  // Subscribe to the LOGOUT IPC event and log out when triggered
  subscribe(ipcChannel, ipcTopics.LOGOUT, async () => {
    logout()
  })
}

/**
 * Exchanges an authentication code for an access token using the IAM API.
 * @param {string} code - The authentication code to exchange.
 * @returns {Promise<void>} A Promise that resolves when the token exchange is complete.
 */
const tokenExchange = async (code: string): Promise<void> => {
  const codeTokenRequest: TokenRequest = {
    grant_type: 'authorization_code',
    client_id: iamConfig.clientId,
    redirect_uri: iamConfig.redirectUri,
    code: code // Set the authentication code in the code token request object
  }

  // codeTokenRequest.code = code

  // Request an access token using the code token request object
  await requestTokens(codeTokenRequest)
}

/**
 * Retrieves the latest access and refresh tokens from the IAM API.
 * @returns {Promise<void>} A Promise that resolves when the tokens have been retrieved.
 * @throws {Error} If no refresh token is available.
 */
const hydrateTokens = async (): Promise<void> => {
  // Check if a refresh token is available
  if (!tokens.refreshToken.token) throw new Error('No refresh token available')

  const refreshTokenRequest: TokenRequest = {
    grant_type: 'refresh_token',
    client_id: iamConfig.clientId,
    redirect_uri: iamConfig.redirectUri,
    refresh_token: tokens.refreshToken.token // Set the refresh token in the refresh token request object
  }

  // Request a new access token using the refresh token request object
  await requestTokens(refreshTokenRequest)
}

/**
 * Requests a new access token from the IAM API using the given parameters.
 * @param {TokenRequest} params - The parameters to use in the token request.
 * @returns {Promise<Response>} A Promise that resolves when the access token has been retrieved, resolves to null if exception is catched.
 */
const requestTokens = async (params: TokenRequest): Promise<Response> => {
  try {
    // Send a POST request to the token request URL with the given parameters
    const response = await fetch(tokenURL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams(params)
    })

    // If the response is not OK, log an error message and force a login
    if (!response.ok) {
      // Force login
      // notifyLogout()
      const responseJson = await response.json()
      console.error(
        'Error requesting token error ' +
          response.status +
          ' ' +
          responseJson.error_description
      )
      return response
    }

    // If the response is OK, store the retrieved tokens in the local state
    const data = await response.json()
    storeTokens(data)

    if (isTokenAutoRefreshEnabled()) {
      // Calculate the timer value based on the `refresh_expires_in` value
      const timeoutMs = (data.refresh_expires_in - 10) * 1000
      if (timeoutMs > 0) {
        if (autoRefreshTimeout) {
          clearTimeout(autoRefreshTimeout)
        }
        // Set up a timer to hydrate the tokens before they expire
        console.debug(`Token refresh timer set to ${timeoutMs}ms`)
        autoRefreshTimeout = setTimeout(() => {
          console.debug(`the time has come to refresh some tokens`)
          hydrateTokens()
        }, timeoutMs)
      }
    }
    return data
  } catch (error) {
    // If an error occurs, log an error message
    console.error('Error requesting token ' + error)
    return null
  }
}

/**
 * Stores the retrieved access, refresh, and ID tokens in the local state, and sets up auto-refresh if enabled.
 * @param {string} data - The retrieved token data.
 * @returns {void}
 */
const storeTokens = (data: string): void => {
  // Store the tokens in the local state
  tokens.accessToken.token = data.access_token
  tokens.refreshToken.token = data.refresh_token
  tokens.idToken.token = data.id_token

  // Decode the ID token to get the preferred_username and store it in the local state
  const user = decode(tokens.idToken.token)
  storeUser(user)

  // If auto-refresh is enabled, set up a timer to refresh the token before it expire
}

const notifyLogin = async (): Promise<void> => {
  await showMainWindow()
  enableMainWindow()
  showLogintNotification()
  if (isLoginWindowEnabled()) closeLoginWindow()
  isLoggedIn = true
}

const notifyLogout = (): void => {
  disableMainWindow()
  showLogoutNotification()
  login()
  isLoggedIn = false
}

/**
 * Shows a notification when the user has been logged out.
 * @param {string} logoutInfo - The logout information to display in the notification.
 * @returns {void}
 */
const showLogoutNotification = (logoutInfo?: string): void => {
  // TODO: Move this out of here - let frontend decide to do this
  // Show a notification with a message and a button to log in again
  showNotification(
    'Logout',
    `${user.preferred_username} is now logged out.`,
    () => {
      login()
    }
  )
}

/**
 * Shows a notification when the user has been logged in.
 * @returns {void}
 */
const showLogintNotification = (loginInfo?: string): void => {
  // TODO: Move this out of here - let frontend decide to do this

  // Show a notification with a message and a button to log out
  showNotification(
    'Login',
    `${user.given_name} ${user.family_name} (${user.preferred_username}) is now logged in.`,
    () => {
      // logout()
    }
  )
  // Send notification to frontend using ipc publisher
  // publish(ipcChannel, ipcTopics.LOGIN, user)
}
