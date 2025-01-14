// must not describe 'use server' here to avoid security issues.
import { epochTimeToNaturalLanguage } from "../utils"
import { getRedis } from "./redis"
import { isPremiumUser } from "./subscription-utils"

export type RateLimitResult =
  | {
      allowed: true
      remaining: number
      timeRemaining: null
    }
  | {
      allowed: false
      remaining: 0
      timeRemaining: number
    }

/**
 * rate limiting by sliding window algorithm.
 *
 * check if the user is allowed to make a request.
 * if the user is allowed, decrease the remaining count by 1.
 */
export async function ratelimit(
  userId: string,
  model: string
): Promise<RateLimitResult> {
  if (!isRateLimiterEnabled()) {
    return { allowed: true, remaining: -1, timeRemaining: null }
  }
  const isPremium = await isPremiumUser(userId)
  return _ratelimit(model, userId, isPremium)
}

function isRateLimiterEnabled(): boolean {
  return process.env.RATELIMITER_ENABLED?.toLowerCase() === "true"
}

export async function _ratelimit(
  model: string,
  userId: string,
  isPremium: boolean
): Promise<RateLimitResult> {
  const storageKey = _makeStorageKey(userId, model)
  const [remaining, timeRemaining] = await getRemaining(
    userId,
    model,
    isPremium
  )
  if (remaining === 0) {
    return { allowed: false, remaining, timeRemaining: timeRemaining! }
  }
  await _addRequest(storageKey, model)
  return { allowed: true, remaining: remaining - 1, timeRemaining: null }
}

export async function getRemaining(
  userId: string,
  model: string,
  isPremium: boolean
): Promise<[number, number | null]> {
  const storageKey = _makeStorageKey(userId, model)
  const timeWindow = getTimeWindow(model)
  const now = Date.now()
  const limit = _getLimit(model, isPremium)

  const redis = getRedis()
  const [[firstMessageTime], count] = await Promise.all([
    redis.zrange(storageKey, 0, 0, { withScores: true }),
    redis.zcard(storageKey)
  ])

  if (!firstMessageTime) {
    return [limit, null]
  }

  const windowEndTime = Number(firstMessageTime) + timeWindow
  if (now >= windowEndTime) {
    // The window has expired, no need to reset the count here
    return [limit, null]
  }

  const remaining = Math.max(0, limit - count)
  return [remaining, remaining === 0 ? windowEndTime - now : null]
}

function getTimeWindow(model: string): number {
  const key =
    model === "plugins"
      ? "RATELIMITER_TIME_PLUGINS_WINDOW_MINUTES"
      : "RATELIMITER_TIME_WINDOW_MINUTES"
  return Number(process.env[key]) * 60 * 1000
}

function _getLimit(model: string, isPremium: boolean): number {
  let limit
  if (model === "plugins") {
    const limitKey = `RATELIMITER_LIMIT_${model.toUpperCase()}_${isPremium ? "PREMIUM" : "FREE"}`
    limit =
      process.env[limitKey] === undefined
        ? isPremium
          ? 30
          : 15
        : Number(process.env[limitKey])
  } else {
    const fixedModelName = _getFixedModelName(model)
    const limitKey = `RATELIMITER_LIMIT_${fixedModelName}_${isPremium ? "PREMIUM" : "FREE"}`
    limit =
      process.env[limitKey] === undefined
        ? isPremium
          ? 30
          : 15
        : Number(process.env[limitKey])
  }
  if (isNaN(limit) || limit < 0) {
    throw new Error("Invalid limit configuration")
  }
  return limit
}

async function _addRequest(key: string, model: string) {
  const now = Date.now()
  const timeWindow = getTimeWindow(model)

  const redis = getRedis()
  const [firstMessageTime] = await redis.zrange(key, 0, 0, { withScores: true })

  if (!firstMessageTime || now - Number(firstMessageTime) >= timeWindow) {
    // Start a new window
    await redis
      .multi()
      .del(key)
      .zadd(key, { score: now, member: now })
      .expire(key, Math.ceil(timeWindow / 1000))
      .exec()
  } else {
    // Add to existing window
    await redis.zadd(key, { score: now, member: now })
  }
}

function _getFixedModelName(model: string): string {
  return (model.startsWith("gpt-4") ? "gpt-4" : model)
    .replace(/-/g, "_")
    .toUpperCase()
}

function _makeStorageKey(userId: string, model: string): string {
  const fixedModelName = _getFixedModelName(model)
  return `ratelimit:${userId}:${fixedModelName}`
}

export function resetRateLimit(model: string, userId: string) {
  const storageKey = _makeStorageKey(userId, model)
  return getRedis().del(storageKey)
}

export function getRateLimitErrorMessage(
  timeRemaining: number,
  premium: boolean,
  model: string
): string {
  const remainingText = epochTimeToNaturalLanguage(timeRemaining)
  const baseMessage = `⚠️ You've reached the rate limit for ${getModelName(model)}\n⏰ Access will be restored in ${remainingText}`

  if (["plugins", "tts-1", "stt-1"].includes(model)) {
    return premium
      ? baseMessage
      : `${baseMessage}\n🚀 Consider upgrading for higher limits and more features`
  }

  let message = `⚠️ Usage Limit Reached for ${getModelName(model)}\n⏰ Access will be restored in ${remainingText}`

  if (premium) {
    if (model === "hackergpt") {
      message += `\n\nIn the meantime, you can use HGPT-4 or GPT-4o`
    } else if (model === "hackergpt-pro") {
      message += `\n\nIn the meantime, you can use GPT-4o or HGPT-3.5`
    } else if (model === "gpt-4") {
      message += `\n\nIn the meantime, you can use HGPT-4 or HGPT-3.5`
    }
  } else {
    message += `\n\n🔓 Want more? Upgrade to Pro and unlock a world of features:
- Higher usage limits
- Exclusive access to HGPT-4 and GPT-4o
- Advanced features like vision, web browsing, and file uploads
- Access to premium tools such as Nuclei, Katana, PortScanner, and more`
  }

  return message.trim()
}

function getModelName(model: string): string {
  const modelNames: { [key: string]: string } = {
    plugins: "plugins",
    "tts-1": "text-to-speech",
    "stt-1": "speech-to-text",
    hackergpt: "HGPT-3.5",
    "hackergpt-pro": "HGPT-4",
    "gpt-4": "GPT-4"
  }
  return modelNames[model] || model
}

export async function checkRatelimitOnApi(
  userId: string,
  model: string
): Promise<{ response: Response; result: RateLimitResult } | null> {
  const result = await ratelimit(userId, model)
  if (result.allowed) {
    return null
  }
  const premium = await isPremiumUser(userId)
  const message = getRateLimitErrorMessage(
    result.timeRemaining!,
    premium,
    model
  )
  const response = new Response(
    JSON.stringify({
      message: message,
      remaining: result.remaining,
      timeRemaining: result.timeRemaining
    }),
    {
      status: 429
    }
  )
  return { response, result }
}

export async function checkRateLimitWithoutIncrementing(
  userId: string,
  model: string
): Promise<RateLimitResult> {
  if (!isRateLimiterEnabled()) {
    return { allowed: true, remaining: -1, timeRemaining: null }
  }
  const isPremium = await isPremiumUser(userId)
  const [remaining, timeRemaining] = await getRemaining(
    userId,
    model,
    isPremium
  )
  if (remaining === 0) {
    return { allowed: false, remaining: 0, timeRemaining: timeRemaining! }
  }
  return { allowed: true, remaining, timeRemaining: null }
}
