import { getServerProfile } from "@/lib/server/server-chat-helpers"
import { ServerRuntime } from "next"

import { checkRatelimitOnApi } from "@/lib/server/ratelimiter"

import {
  pluginIdToHandlerMapping,
  isCommand,
  handleCommand
} from "@/app/api/chat/plugins/chatpluginhandlers"
import { OpenRouterStream } from "@/app/api/chat/plugins/openrouterstream"
import { PluginID, pluginUrls } from "@/types/plugins"
import { isPremiumUser } from "@/lib/server/subscription-utils"
import { buildFinalMessages } from "@/lib/build-prompt"

export const runtime: ServerRuntime = "edge"
export const preferredRegion = [
  "iad1",
  "arn1",
  "bom1",
  "cdg1",
  "cle1",
  "cpt1",
  "dub1",
  "fra1",
  "gru1",
  "hnd1",
  "icn1",
  "kix1",
  "lhr1",
  "pdx1",
  "sfo1",
  "sin1",
  "syd1"
]

export async function POST(request: Request) {
  const json = await request.json()
  const { payload, chatImages, selectedPlugin, fileData } = json as {
    payload: any
    chatImages: any[]
    selectedPlugin: string
    fileData?: { fileName: string; fileContent: string }[]
  }

  const freePlugins: PluginID[] = [
    PluginID.CVEMAP,
    PluginID.SUBFINDER,
    PluginID.LINKFINDER,
    PluginID.ALTERX
  ]

  try {
    const profile = await getServerProfile()
    const isPremium = await isPremiumUser(profile.user_id)

    if (!freePlugins.includes(selectedPlugin as PluginID) && !isPremium) {
      return new Response(
        "Access Denied to " +
          selectedPlugin +
          ": The plugin you are trying to use is exclusive to Pro members. Please upgrade to a Pro account to access this plugin."
      )
    }

    let chatSettings = payload.chatSettings

    let ratelimitmodel
    if (chatSettings.model === "mistral-medium") {
      ratelimitmodel = "hackergpt"
    } else if (chatSettings.model === "mistral-large") {
      ratelimitmodel = "hackergpt-pro"
    } else {
      ratelimitmodel = "gpt-4"
    }

    const rateLimitCheckResultForPlugins = await checkRatelimitOnApi(
      profile.user_id,
      "plugins"
    )
    if (rateLimitCheckResultForPlugins !== null) {
      return rateLimitCheckResultForPlugins.response
    }

    const rateLimitCheckResultForChatSettingsModel = await checkRatelimitOnApi(
      profile.user_id,
      ratelimitmodel
    )
    if (rateLimitCheckResultForChatSettingsModel !== null) {
      return rateLimitCheckResultForChatSettingsModel.response
    }

    const formattedMessages = (await buildFinalMessages(
      payload,
      profile,
      chatImages,
      selectedPlugin as PluginID
    )) as any

    let invokedByPluginId = false
    const cleanMessages = formattedMessages.slice(1, -1)
    let latestUserMessage = cleanMessages[cleanMessages.length - 1]

    let latestUserMessageContent = ""
    if (Array.isArray(latestUserMessage.content)) {
      latestUserMessage.content.forEach((item: any) => {
        if (item.type === "text") {
          latestUserMessageContent += item.text + " "
        }
      })
      latestUserMessage = {
        role: latestUserMessage.role,
        content: latestUserMessageContent
      }
    } else {
      latestUserMessageContent = latestUserMessage.content
    }

    if (latestUserMessageContent.startsWith("/")) {
      const commandPlugin = Object.keys(pluginUrls)
        .find(plugin =>
          isCommand(plugin.toLowerCase(), latestUserMessageContent)
        )
        ?.toLowerCase()

      if (!commandPlugin) {
        return new Response(
          "Error: Command not recognized. Please check the command and try again."
        )
      }

      if (
        commandPlugin &&
        !freePlugins.includes(selectedPlugin as PluginID) &&
        !isPremium
      ) {
        return new Response(
          "Access Denied to " +
            commandPlugin +
            ": The plugin you are trying to use is exclusive to Pro members. Please upgrade to a Pro account to access this plugin."
        )
      }

      for (const plugin of Object.keys(pluginUrls)) {
        if (isCommand(plugin.toLowerCase(), latestUserMessageContent)) {
          return await handleCommand(
            plugin.toLowerCase(),
            latestUserMessage,
            cleanMessages
          )
        }
      }
    } else if (pluginIdToHandlerMapping.hasOwnProperty(selectedPlugin)) {
      invokedByPluginId = true

      const toolHandler = pluginIdToHandlerMapping[selectedPlugin]
      const response = await toolHandler(
        latestUserMessage,
        process.env[`ENABLE_${selectedPlugin.toUpperCase()}_PLUGIN`] !==
          "FALSE",
        OpenRouterStream,
        cleanMessages,
        invokedByPluginId,
        fileData && fileData.length > 0 ? fileData : undefined
      )

      return response
    }
  } catch (error: any) {
    let errorMessage = error.message || "An unexpected error occurred"
    const errorCode = error.status || 500

    if (errorMessage.toLowerCase().includes("api key not found")) {
      errorMessage =
        "OpenAI API Key not found. Please set it in your profile settings."
    } else if (errorMessage.toLowerCase().includes("incorrect api key")) {
      errorMessage =
        "OpenAI API Key is incorrect. Please fix it in your profile settings."
    }

    return new Response(JSON.stringify({ message: errorMessage }), {
      status: errorCode
    })
  }
}
