import { Message } from "@/types/chat"
import {
  createGKEHeaders,
  getCommandFromAIResponse,
  processAIResponseAndUpdateMessage
} from "../../plugins/chatpluginhandlers"

import { displayHelpGuideForPortScanner } from "@/lib/plugins/plugin-helper/help-guides"
import { transformUserQueryToPortScannerCommand } from "@/lib/plugins/plugin-helper/transform-query-to-command"
import { handlePluginStreamError } from "@/lib/plugins/plugin-helper/plugin-stream"

interface PortScannerParams {
  host: string[]
  scanType: "light" | "deep" | "custom"
  port: string
  topPorts: string
  noSvc: boolean
  error: string | null
}

const parseCommandLine = (input: string): PortScannerParams => {
  const MAX_INPUT_LENGTH = 500
  const params: PortScannerParams = {
    host: [],
    scanType: "light",
    port: "",
    topPorts: "",
    noSvc: false,
    error: null
  }

  if (input.length > MAX_INPUT_LENGTH) {
    return { ...params, error: `🚨 Input command is too long` }
  }

  const args = input.trim().toLowerCase().split(/\s+/).slice(1)
  const flagMap: { [key: string]: keyof PortScannerParams } = {
    "-host": "host",
    "-st": "scanType",
    "-scan-type": "scanType",
    "-p": "port",
    "-port": "port",
    "-tp": "topPorts",
    "-top-ports": "topPorts",
    "-no-svc": "noSvc"
  }

  for (let i = 0; i < args.length; i++) {
    const flag = args[i]
    const param = flagMap[flag]

    if (!param) {
      return { ...params, error: `🚨 Invalid or unrecognized flag: ${flag}` }
    }

    const value = args[++i]

    if (param === "host") {
      params.host = value.split(",")
    } else if (param === "scanType") {
      if (!["light", "deep", "custom"].includes(value)) {
        return { ...params, error: `🚨 Invalid scan type: ${value}` }
      }
      params.scanType = value as "light" | "deep" | "custom"
    } else if (param === "port" || param === "topPorts" || param === "noSvc") {
      if (params.scanType !== "custom") {
        return {
          ...params,
          error: `🚨 The option "${flag}" is only allowed for custom scan type.`
        }
      }
      if (param === "topPorts" && !["full", "100", "1000"].includes(value)) {
        return {
          ...params,
          error: `🚨 Invalid value for -top-ports: ${value}. Allowed values are "full", "100", "1000".`
        }
      }
      if (param === "noSvc") {
        params.noSvc = true
      } else {
        params[param] = value
      }
    }
  }

  if (!params.host.length) {
    return { ...params, error: `🚨 Error: -host parameter is required.` }
  }

  return params
}
export async function handlePortscannerRequest(
  lastMessage: Message,
  enablePortScanner: boolean,
  OpenRouterStream: any,
  messagesToSend: Message[],
  invokedByToolId: boolean
) {
  if (!enablePortScanner) {
    return new Response("The Port Scanner is disabled.")
  }

  let aiResponse = ""

  const headers = createGKEHeaders()

  const stream = new ReadableStream({
    async start(controller) {
      const sendMessage = (
        data: string,
        addExtraLineBreaks: boolean = false
      ) => {
        const formattedData = addExtraLineBreaks ? `${data}\n\n` : data
        controller.enqueue(new TextEncoder().encode(formattedData))
      }

      if (invokedByToolId) {
        try {
          for await (const chunk of processAIResponseAndUpdateMessage(
            lastMessage,
            transformUserQueryToPortScannerCommand,
            OpenRouterStream,
            messagesToSend
          )) {
            sendMessage(chunk, false)
            aiResponse += chunk
          }

          sendMessage("\n\n")
          lastMessage.content = getCommandFromAIResponse(
            lastMessage,
            aiResponse
          )
        } catch (error) {
          return new Response(`Error processing AI response: ${error}`)
        }
      }

      const parts = lastMessage.content.split(" ")
      if (parts.includes("-h") || parts.includes("-help")) {
        sendMessage(displayHelpGuideForPortScanner(), true)
        controller.close()
        return
      }

      const params = parseCommandLine(lastMessage.content)

      if (params.error) {
        handlePluginStreamError(
          params.error,
          invokedByToolId,
          sendMessage,
          controller
        )
        return
      }

      let portScannerUrl = `${process.env.SECRET_GKE_TOOLS_BASE_URL}/api/chat/tools/port-scanner`
      const requestBody = Object.fromEntries(
        Object.entries(params).filter(
          ([_, value]) =>
            (Array.isArray(value) && value.length > 0) ||
            (typeof value === "boolean" && value) ||
            (typeof value === "number" && value > 0) ||
            (typeof value === "string" && value.length > 0)
        )
      )

      sendMessage("🚀 Starting the scan. It might take a minute.", true)

      try {
        const portScannerResponse = await fetch(portScannerUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `${process.env.SECRET_AUTH_TOOLS}`
          },
          body: JSON.stringify(requestBody)
        })

        const reader = portScannerResponse.body?.getReader()
        const decoder = new TextDecoder()
        let portScannerData = ""
        let fileContent = ""
        let isFileContent = false
        let scanError = ""

        sendMessage("**Raw output:**\n```terminal\n", false)

        while (true) {
          const { done, value } = (await reader?.read()) || {}
          if (done) break
          const chunk = decoder.decode(value, { stream: true })

          if (chunk.startsWith("SCAN_ERROR:")) {
            scanError = chunk.replace("SCAN_ERROR:", "").trim()
            break
          }

          const fileContentStartIndex = chunk.indexOf(
            "--- FILE CONTENT START ---"
          )
          if (fileContentStartIndex !== -1) {
            isFileContent = true
            const beforeMarker = chunk.slice(0, fileContentStartIndex)
            const afterMarker = chunk.slice(
              fileContentStartIndex + "--- FILE CONTENT START ---".length
            )
            portScannerData += beforeMarker
            fileContent += afterMarker
            sendMessage(beforeMarker)
          } else if (isFileContent) {
            fileContent += chunk
          } else {
            portScannerData += chunk
            sendMessage(chunk)
          }
        }

        sendMessage("```\n", false)

        if (scanError) {
          sendMessage(`🚨 ${scanError}`, true)
          controller.close()
          return
        }

        if (!fileContent.trim()) {
          sendMessage("🔍 No open ports were found during the scan.", true)
          controller.close()
          return
        }

        portScannerData = processPortScannerData(portScannerData)

        sendMessage("✅ Scan done! Now processing the results...", true)

        const responseString = createResponseString(
          params.host,
          fileContent.trim()
        )
        sendMessage(responseString, true)

        controller.close()
      } catch (error) {
        let errorMessage =
          "🚨 There was a problem during the scan. Please try again."
        if (error instanceof Error) {
          errorMessage = `🚨 Error: ${error.message}`
        }
        sendMessage(errorMessage, true)
        controller.close()
        return new Response(errorMessage)
      }
    }
  })

  return new Response(stream, { headers })
}

const processPortScannerData = (data: string) => {
  return data
    .split("\n")
    .filter(line => line && !line.startsWith("data:") && line.trim() !== "")
    .join("")
}

const createResponseString = (
  domain: string | string[],
  portScannerData: string
) => {
  return (
    `# Port Scanner Results\n` +
    '**Target**: "' +
    domain +
    '"\n\n' +
    `## Results:\n` +
    "```\n" +
    portScannerData +
    "\n" +
    "```\n"
  )
}
