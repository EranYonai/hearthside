import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type AuthenticatorTransport,
  type RegistrationResponseJSON,
} from '@simplewebauthn/server'
import { isoBase64URL } from '@simplewebauthn/server/helpers'
import type { PasskeyRow } from '@hearthside/db'
import type { AuthConfig } from './config'
import type { NewPasskey } from './repo'

export type { AuthenticationResponseJSON, RegistrationResponseJSON }

export async function registrationOptions(
  config: AuthConfig,
  user: { id?: string; name: string },
  existing: Pick<PasskeyRow, 'id' | 'transports'>[] = [],
) {
  return generateRegistrationOptions({
    rpName: config.rpName,
    rpID: config.rpId,
    userName: user.name,
    userDisplayName: user.name,
    userID: user.id ? new TextEncoder().encode(user.id) : undefined,
    attestationType: 'none',
    authenticatorSelection: { residentKey: 'required', userVerification: 'preferred' },
    excludeCredentials: existing.map((p) => ({
      id: p.id,
      transports: p.transports as AuthenticatorTransport[],
    })),
  })
}

export async function verifyRegistration(
  config: AuthConfig,
  response: RegistrationResponseJSON,
  expectedChallenge: string,
  name: string,
): Promise<NewPasskey | undefined> {
  const result = await verifyRegistrationResponse({
    response,
    expectedChallenge,
    expectedOrigin: config.origin,
    expectedRPID: config.rpId,
    requireUserVerification: false,
  })
  if (!result.verified || !result.registrationInfo) return undefined
  const { credential, credentialDeviceType, credentialBackedUp } = result.registrationInfo
  return {
    id: credential.id,
    publicKey: isoBase64URL.fromBuffer(credential.publicKey),
    counter: credential.counter,
    transports: credential.transports ?? response.response.transports ?? [],
    deviceType: credentialDeviceType,
    backedUp: credentialBackedUp,
    name,
  }
}

export async function authenticationOptions(config: AuthConfig) {
  // No allowCredentials: the browser offers whatever passkeys it has for this site,
  // so the sign-in page never needs to know (or reveal) who is signing in.
  return generateAuthenticationOptions({ rpID: config.rpId, userVerification: 'preferred' })
}

export async function verifyAuthentication(
  config: AuthConfig,
  response: AuthenticationResponseJSON,
  expectedChallenge: string,
  passkey: Pick<PasskeyRow, 'id' | 'publicKey' | 'counter' | 'transports'>,
) {
  const result = await verifyAuthenticationResponse({
    response,
    expectedChallenge,
    expectedOrigin: config.origin,
    expectedRPID: config.rpId,
    requireUserVerification: false,
    credential: {
      id: passkey.id,
      publicKey: isoBase64URL.toBuffer(passkey.publicKey),
      counter: passkey.counter,
      transports: passkey.transports as AuthenticatorTransport[],
    },
  })
  return result.verified ? result.authenticationInfo.newCounter : undefined
}

/** A friendly default name for a new passkey, from the browser's user agent. */
export function deviceLabel(userAgent: string | null | undefined): string {
  const ua = userAgent ?? ''
  if (/iPhone/.test(ua)) return 'iPhone'
  if (/iPad/.test(ua)) return 'iPad'
  if (/Android/.test(ua)) return 'Android'
  if (/Macintosh|Mac OS X/.test(ua)) return 'Mac'
  if (/Windows/.test(ua)) return 'Windows'
  if (/Linux/.test(ua)) return 'Linux'
  return 'Passkey'
}
