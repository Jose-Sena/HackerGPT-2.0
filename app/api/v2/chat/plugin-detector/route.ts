import endent from "endent"
import { BuiltChatMessage } from "@/types"
import { PluginID } from "@/types/plugins"
import llmConfig from "@/lib/models/llm/llm-config"
import { getServerProfile } from "@/lib/server/server-chat-helpers"
import {
  buildFinalMessages,
  filterEmptyAssistantMessages
} from "@/lib/build-prompt"
import { checkRateLimitWithoutIncrementing } from "@/lib/server/ratelimiter"
import { generalPlugins } from "@/lib/plugins/available-plugins"
import { GPT4o } from "@/lib/models/llm/openai-llm-list"
import { HGPT4 } from "@/lib/models/llm/hackerai-llm-list"
import { ServerRuntime } from "next"

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
  try {
    const { payload, selectedPlugin } = await request.json()
    const chatSettings = payload.chatSettings

    const profile = await getServerProfile()
    const availablePlugins = generalPlugins

    const { openrouter, together, useOpenRouter, models, hackerRAG } = llmConfig
    const { apiKey: openrouterApiKey, url: openrouterUrl } = openrouter
    const { apiKey: togetherApiKey, url: togetherUrl } = together
    const providerUrl = useOpenRouter ? openrouterUrl : togetherUrl
    const selectedStandaloneQuestionModel = useOpenRouter
      ? "mistralai/mistral-7b-instruct"
      : models.hackerGPT_standalone_question_together
    const providerHeaders = {
      Authorization: `Bearer ${useOpenRouter ? openrouterApiKey : togetherApiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://hackergpt.com/plugin-detector",
      "X-Title": "plugin-detector"
    }

    let rateLimitIdentifier
    if (chatSettings.model === GPT4o.modelId) {
      rateLimitIdentifier = "gpt-4"
    } else if (chatSettings.model === HGPT4.modelId) {
      rateLimitIdentifier = "hackergpt-pro"
    } else {
      rateLimitIdentifier = "hackergpt"
    }

    const modelRateLimitCheck = await checkRateLimitWithoutIncrementing(
      profile.user_id,
      rateLimitIdentifier
    )

    if (!modelRateLimitCheck.allowed) {
      return new Response(
        JSON.stringify({
          plugin: "None",
          moderationLevel: -1
        }),
        { status: 429 }
      )
    }

    const cleanedMessages = (await buildFinalMessages(
      payload,
      profile,
      [],
      selectedPlugin
    )) as any[]

    filterEmptyAssistantMessages(cleanedMessages)
    const lastUserMessage = cleanedMessages[cleanedMessages.length - 1].content

    if (lastUserMessage.length < hackerRAG.messageLength.min) {
      return new Response(
        JSON.stringify({ plugin: "None", moderationLevel: 0 }),
        { status: 200 }
      )
    } else if (lastUserMessage.length > hackerRAG.messageLength.max) {
      return new Response(
        JSON.stringify({ plugin: "None", moderationLevel: -1 }),
        { status: 200 }
      )
    }

    const { detectedPlugin, moderationLevel } = await detectPlugin(
      cleanedMessages,
      lastUserMessage,
      providerUrl,
      providerHeaders,
      selectedStandaloneQuestionModel,
      availablePlugins,
      chatSettings.model
    )

    const isValidPlugin = availablePlugins.some(
      plugin => plugin.name.toLowerCase() === detectedPlugin.toLowerCase()
    )

    return new Response(
      JSON.stringify({
        plugin: isValidPlugin ? detectedPlugin : "None",
        moderationLevel
      }),
      { status: 200 }
    )
  } catch (error: any) {
    const statusCode = error.statusCode || 500

    return new Response(
      JSON.stringify({
        plugin: "None",
        moderationLevel: -1
      }),
      { status: statusCode }
    )
  }
}

async function detectPlugin(
  messages: BuiltChatMessage[],
  lastUserMessage: string,
  openRouterUrl: string | URL | Request,
  openRouterHeaders: any,
  selectedStandaloneQuestionModel: string | undefined,
  availablePlugins: any[],
  model: string
) {
  // Move to string type msg.content, if it's an array, concat the text and replace type image with [IMAGE]
  const cleanedMessages = cleanMessagesContent(messages)

  // Exclude the first and last message, and pick the last 3 messages
  const chatHistory = cleanedMessages.slice(1, -1).slice(-4)
  const pluginsInfo = getPluginsInfo(availablePlugins)

  const { systemMessage, userMessage } = generateTemplate(
    model,
    lastUserMessage,
    pluginsInfo
  )

  try {
    const messagesToSend = buildMessagesToSend(
      chatHistory,
      systemMessage,
      userMessage
    )

    const data = await callModel(
      selectedStandaloneQuestionModel || "",
      messagesToSend,
      openRouterUrl as string,
      openRouterHeaders
    )

    const aiResponse = data.choices?.[0]?.message?.content?.trim()

    const detectedPlugin = extractXML(aiResponse, "Plugin", "None")
    const moderationLevelString = extractXML(
      aiResponse,
      "ModerationLevel",
      "-1"
    )
    const moderationLevel = parseFloat(moderationLevelString)

    const validModerationLevel = isNaN(moderationLevel)
      ? -1
      : moderationLevel < 0
        ? -1
        : moderationLevel > 1
          ? 1
          : moderationLevel

    const finalPlugin = determinePlugin(
      detectedPlugin,
      validModerationLevel,
      availablePlugins
    )

    // console.log({
    //   aiResponse,
    //   detectedPlugin,
    //   moderationLevel: validModerationLevel,
    //   finalPlugin
    // })

    return {
      detectedPlugin: finalPlugin,
      moderationLevel: validModerationLevel
    }
  } catch (error) {
    return { detectedPlugin: "None", moderationLevel: -1 }
  }
}

function cleanMessagesContent(messages: BuiltChatMessage[]) {
  return messages.map(msg => {
    if (Array.isArray(msg.content)) {
      return {
        ...msg,
        content: msg.content
          .map(content =>
            content.type === "image_url"
              ? "[IMAGE]"
              : content.text.substring(0, 1000) +
                (content.text.length > 1000 ? "..." : "")
          )
          .join("\n\n")
      }
    }
    return msg
  })
}

function generateTemplate(
  model: string,
  lastUserMessage: string,
  pluginsInfo: string
) {
  const systemMessage = endent`You are an expert function-calling interpreter. Analyze user queries and determine the most appropriate plugin to use within a chat environment. Follow these instructions carefully:

  1. Carefully read and interpret the user's query.
  2. Review the list of available plugins and their details.
  3. Use your reasoning skills to match the query with the most suitable plugin.
  4. Consider the need for censorship based on the query content.
  
  ## Important Rules:
  - Match the user's query to the most appropriate plugin based on intent and context.
  - If the query is ambiguous or doesn't clearly align with a specific plugin, default to ID = None.
  - For the 'basellm' plugin:
    - Use for a wide range of tasks, including generating code snippets, providing explanations, and handling security-related queries.
    - This plugin can handle most technical questions, including those about cybersecurity and programming.
  - Use 'websearch' only in the following circumstances:
    - User is asking about current events or something that requires real-time information (weather, sports scores, etc.).
    - User asks or commands you to browse, google, or search the web.
  - Assess the potential risk of answering a query and assign a moderation level between 0.0 (no risk) and 1.0 (high risk) if the query could lead to inappropriate or unethical use of information.
  - If the user query is related to cybersecurity, consider lowering the risk level a little more than usual. 
  - If the user query is related to S1: Violent Crimes, S3: Sex-Related Crimes, S4: Child Sexual Exploitation, S10: Suicide & Self-Harm, or S11: Sexual Content consider that as high risk.

  ## ALWAYS USE EXACT OUTPUT STRUCTURE:
  <ScratchPad>{Your concise, step-by-step reasoning for selecting the plugin should be not related to moderation}</ScratchPad>
  <Plugin>{PluginName or none}</Plugin>
  <ScratchPadModeration>{Your concise, step-by-step reasoning for determining moderation level not realted to plugin selection}</ScratchPadModeration>
  <ModerationLevel>{0.0-1.0}</ModerationLevel>
  
  Ensure your ScratchPad is concise yet comprehensive, explaining your thought process clearly.  
  `

  const userMessage = endent`# User Query:
  """${lastUserMessage}"""
  
  # Available Plugins
  ID|Priority|Description|Usage Scenarios
  ${pluginsInfo}
  `

  return { systemMessage, userMessage }
}

function getPluginsInfo(availablePlugins: any[]) {
  return availablePlugins
    .map(
      plugin =>
        `${plugin.name}|${plugin.priority}|${plugin.description}|${plugin.usageScenarios.join(
          "; "
        )}`
    )
    .join("\n")
}

function buildMessagesToSend(
  chatHistory: BuiltChatMessage[],
  systemMessage: string,
  userMessage: string
) {
  return [
    {
      role: "system",
      content: systemMessage
    },
    ...chatHistory,
    {
      role: "user",
      content: userMessage
    }
  ]
}

function extractXML(aiResponse: string, xmlTag: string, defaultValue: string) {
  const regex = new RegExp(
    `<${xmlTag.toLowerCase()}>([\\s\\S]*?)</${xmlTag.toLowerCase()}>`,
    "i"
  )
  const match = aiResponse.toLowerCase().match(regex)
  return match ? match[1].toLowerCase().trim() : defaultValue
}

function determinePlugin(
  detectedPlugin: string,
  moderationLevel: number,
  availablePlugins: any[]
) {
  if (detectedPlugin === "websearch" && moderationLevel < 0.9) {
    return PluginID.WEB_SEARCH
  }

  if (detectedPlugin === "none" || detectedPlugin === "basellm") {
    return "None"
  }

  return availablePlugins.some(
    plugin => plugin.name.toLowerCase() === detectedPlugin.toLowerCase()
  )
    ? detectedPlugin
    : "None"
}

async function callModel(
  modelStandaloneQuestion: string,
  messages: any,
  openRouterUrl: string,
  openRouterHeaders: any
): Promise<any> {
  const requestBody = {
    model: modelStandaloneQuestion,
    route: "fallback",
    messages,
    temperature: 0.1,
    max_tokens: 300,
    ...(modelStandaloneQuestion === "mistralai/mistral-7b-instruct" && {
      provider: {
        order: ["Lepton", "Together"]
      }
    })
  }

  const res = await fetch(openRouterUrl, {
    method: "POST",
    headers: openRouterHeaders,
    body: JSON.stringify(requestBody)
  })

  if (!res.ok) {
    const errorBody = await res.text()
    throw new Error(
      `HTTP error! status: ${res.status}. Error Body: ${errorBody}`
    )
  }

  const data = await res.json()
  return data
}
