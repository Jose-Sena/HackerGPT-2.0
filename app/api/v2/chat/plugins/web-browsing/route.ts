import { getServerProfile } from "@/lib/server/server-chat-helpers"
import { ServerRuntime } from "next"

import { updateOrAddSystemMessage } from "@/lib/ai-helper"
import llmConfig from "@/lib/models/llm/llm-config"
import { checkRatelimitOnApi } from "@/lib/server/ratelimiter"
import {
  buildFinalMessages,
  ensureAssistantMessagesNotEmpty
} from "@/lib/build-prompt"
import { APIError, handleOpenRouterApiError } from "@/lib/models/llm/api-error"

export const runtime: ServerRuntime = "edge"

export async function POST(request: Request) {
  const json = await request.json()
  const { payload, chatImages, selectedPlugin } = json as {
    payload: any
    chatImages: any
    selectedPlugin: any
  }

  try {
    const profile = await getServerProfile()
    const chatSettings = payload.chatSettings

    let {
      providerUrl,
      providerHeaders,
      selectedModel,
      rateLimitCheckResult,
      modelTemperature
    } = await getProviderConfig(chatSettings, profile)

    if (rateLimitCheckResult !== null) {
      return rateLimitCheckResult.response
    }

    const cleanedMessages = (await buildFinalMessages(
      payload,
      profile,
      chatImages,
      selectedPlugin
    )) as any[]

    const systemMessageContent =
      llmConfig.systemPrompts.hackerGPTCurrentDateOnly

    updateOrAddSystemMessage(cleanedMessages, systemMessageContent)

    ensureAssistantMessagesNotEmpty(cleanedMessages, false)

    const requestBody = {
      model: selectedModel,
      route: "fallback",
      messages: cleanedMessages.map(msg => ({
        role: msg.role,
        content: msg.content
      })),
      temperature: modelTemperature,
      max_tokens: 1024,
      stream: true
    }

    try {
      const res = await fetch(providerUrl, {
        method: "POST",
        headers: providerHeaders,
        body: JSON.stringify(requestBody)
      })

      if (!res.ok) {
        await handleOpenRouterApiError(res)
      }

      if (!res.body) {
        throw new Error("Response body is null")
      }
      return res
    } catch (error) {
      if (error instanceof APIError) {
        console.error(
          `API Error - Code: ${error.code}, Message: ${error.message}`
        )
      } else if (error instanceof Error) {
        console.error(`Unexpected Error: ${error.message}`)
      } else {
        console.error(`An unknown error occurred: ${error}`)
      }
    }
  } catch (error: any) {
    const errorMessage = error.message || "An unexpected error occurred"
    const errorCode = error.status || 500

    return new Response(JSON.stringify({ message: errorMessage }), {
      status: errorCode
    })
  }
}

async function getProviderConfig(chatSettings: any, profile: any) {
  const isProModel = chatSettings.model !== "mistral-medium"

  const providerUrl = llmConfig.openrouter.url
  const apiKey = llmConfig.openrouter.apiKey
  const defaultModel = "perplexity/llama-3-sonar-small-32k-online"
  const proModel = "perplexity/llama-3-sonar-large-32k-online"

  const providerHeaders = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json"
  }

  let modelTemperature = 0.4
  let selectedModel = isProModel ? proModel : defaultModel
  const rateLimitIdentifier = isProModel ? "gpt-4" : "hackergpt"

  let rateLimitCheckResult = await checkRatelimitOnApi(
    profile.user_id,
    rateLimitIdentifier
  )

  return {
    providerUrl,
    providerHeaders,
    selectedModel,
    rateLimitCheckResult,
    isProModel,
    modelTemperature
  }
}
