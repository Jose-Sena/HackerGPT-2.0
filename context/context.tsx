import { Tables } from "@/supabase/types"
import {
  ChatFile,
  ChatMessage,
  ChatSettings,
  LLM,
  MessageImage,
  WorkspaceImage
} from "@/types"
import { PluginID } from "@/types/plugins"
import { Dispatch, SetStateAction, createContext } from "react"

interface ChatbotUIContext {
  // PROFILE STORE
  profile: Tables<"profiles"> | null
  setProfile: Dispatch<SetStateAction<Tables<"profiles"> | null>>

  // USER ROLE STORE
  userRole: Tables<"user_role"> | null
  setUserRole: Dispatch<SetStateAction<Tables<"user_role"> | null>>

  // SUBSCRIPTION STORE
  subscription: Tables<"subscriptions"> | null
  setSubscription: Dispatch<SetStateAction<Tables<"subscriptions"> | null>>

  // ITEMS STORE
  chats: Tables<"chats">[]
  setChats: Dispatch<SetStateAction<Tables<"chats">[]>>
  files: Tables<"files">[]
  setFiles: Dispatch<SetStateAction<Tables<"files">[]>>
  workspaces: Tables<"workspaces">[]
  setWorkspaces: Dispatch<SetStateAction<Tables<"workspaces">[]>>

  // MODELS STORE
  envKeyMap: Record<string, boolean>
  setEnvKeyMap: Dispatch<SetStateAction<Record<string, boolean>>>
  availableHostedModels: LLM[]
  setAvailableHostedModels: Dispatch<SetStateAction<LLM[]>>

  // WORKSPACE STORE
  selectedWorkspace: Tables<"workspaces"> | null
  setSelectedWorkspace: Dispatch<SetStateAction<Tables<"workspaces"> | null>>
  workspaceImages: WorkspaceImage[]
  setWorkspaceImages: Dispatch<SetStateAction<WorkspaceImage[]>>

  // PASSIVE CHAT STORE
  userInput: string
  setUserInput: Dispatch<SetStateAction<string>>
  chatMessages: ChatMessage[]
  setChatMessages: Dispatch<SetStateAction<ChatMessage[]>>
  chatSettings: ChatSettings | null
  setChatSettings: Dispatch<SetStateAction<ChatSettings>>
  selectedChat: Tables<"chats"> | null
  setSelectedChat: Dispatch<SetStateAction<Tables<"chats"> | null>>

  // ACTIVE CHAT STORE
  abortController: AbortController | null
  setAbortController: Dispatch<SetStateAction<AbortController | null>>
  firstTokenReceived: boolean
  setFirstTokenReceived: Dispatch<SetStateAction<boolean>>
  isGenerating: boolean
  setIsGenerating: Dispatch<SetStateAction<boolean>>

  // ENHANCE MENU
  isEnhancedMenuOpen: boolean
  setIsEnhancedMenuOpen: Dispatch<SetStateAction<boolean>>
  selectedPluginType: string
  setSelectedPluginType: Dispatch<SetStateAction<string>>
  selectedPlugin: PluginID
  setSelectedPlugin: Dispatch<SetStateAction<PluginID>>

  // RAG
  isRagEnabled: boolean
  setIsRagEnabled: Dispatch<SetStateAction<boolean>>

  // CHAT INPUT COMMAND STORE
  slashCommand: string
  setSlashCommand: Dispatch<SetStateAction<string>>
  isAtPickerOpen: boolean
  setIsAtPickerOpen: Dispatch<SetStateAction<boolean>>
  atCommand: string
  setAtCommand: Dispatch<SetStateAction<string>>
  toolCommand: string
  setToolCommand: Dispatch<SetStateAction<string>>
  focusFile: boolean
  setFocusFile: Dispatch<SetStateAction<boolean>>

  // ATTACHMENTS STORE
  chatFiles: ChatFile[]
  setChatFiles: Dispatch<SetStateAction<ChatFile[]>>
  chatImages: MessageImage[]
  setChatImages: Dispatch<SetStateAction<MessageImage[]>>
  newMessageFiles: ChatFile[]
  setNewMessageFiles: Dispatch<SetStateAction<ChatFile[]>>
  newMessageImages: MessageImage[]
  setNewMessageImages: Dispatch<SetStateAction<MessageImage[]>>
  showFilesDisplay: boolean
  setShowFilesDisplay: Dispatch<SetStateAction<boolean>>

  // RETRIEVAL STORE
  useRetrieval: boolean
  setUseRetrieval: Dispatch<SetStateAction<boolean>>
  sourceCount: number
  setSourceCount: Dispatch<SetStateAction<number>>

  // TOOL STORE
  toolInUse: string
  setToolInUse: Dispatch<SetStateAction<string>>

  isMobile: boolean

  isReadyToChat: boolean
  setIsReadyToChat: Dispatch<SetStateAction<boolean>>

  // Audio
  currentPlayingMessageId: string | null
  setCurrentPlayingMessageId: Dispatch<SetStateAction<string | null>>
  isMicSupported: boolean
  setIsMicSupported: Dispatch<SetStateAction<boolean>>

  // Conversational AI
  isConversationalAIOpen: boolean
  setIsConversationalAIOpen: Dispatch<SetStateAction<boolean>>

  // Sidebar
  showSidebar: boolean
  setShowSidebar: (value: boolean | ((prevState: boolean) => boolean)) => void
}

export const ChatbotUIContext = createContext<ChatbotUIContext>({
  // PROFILE STORE
  profile: null,
  setProfile: () => {},

  // USER ROLE STORE
  userRole: null,
  setUserRole: () => {},

  // SUBSCRIPTION STORE
  subscription: null,
  setSubscription: () => {},

  // ITEMS STORE
  chats: [],
  setChats: () => {},
  files: [],
  setFiles: () => {},
  workspaces: [],
  setWorkspaces: () => {},

  // MODELS STORE
  envKeyMap: {},
  setEnvKeyMap: () => {},
  availableHostedModels: [],
  setAvailableHostedModels: () => {},

  // WORKSPACE STORE
  selectedWorkspace: null,
  setSelectedWorkspace: () => {},
  workspaceImages: [],
  setWorkspaceImages: () => {},

  // PASSIVE CHAT STORE
  userInput: "",
  setUserInput: () => {},
  selectedChat: null,
  setSelectedChat: () => {},
  chatMessages: [],
  setChatMessages: () => {},
  chatSettings: null,
  setChatSettings: () => {},

  // ACTIVE CHAT STORE
  isGenerating: false,
  setIsGenerating: () => {},
  firstTokenReceived: false,
  setFirstTokenReceived: () => {},
  abortController: null,
  setAbortController: () => {},

  // ENHANCE MENU STORE
  isEnhancedMenuOpen: false,
  setIsEnhancedMenuOpen: () => {},
  selectedPluginType: "",
  setSelectedPluginType: () => {},
  selectedPlugin: PluginID.NONE,
  setSelectedPlugin: () => {},

  // RAG
  isRagEnabled: false,
  setIsRagEnabled: () => {},

  // CHAT INPUT COMMAND STORE
  slashCommand: "",
  setSlashCommand: () => {},
  isAtPickerOpen: false,
  setIsAtPickerOpen: () => {},
  atCommand: "",
  setAtCommand: () => {},
  toolCommand: "",
  setToolCommand: () => {},
  focusFile: false,
  setFocusFile: () => {},

  // ATTACHMENTS STORE
  chatFiles: [],
  setChatFiles: () => {},
  chatImages: [],
  setChatImages: () => {},
  newMessageFiles: [],
  setNewMessageFiles: () => {},
  newMessageImages: [],
  setNewMessageImages: () => {},
  showFilesDisplay: false,
  setShowFilesDisplay: () => {},

  // RETRIEVAL STORE
  useRetrieval: false,
  setUseRetrieval: () => {},
  sourceCount: 4,
  setSourceCount: () => {},

  // TOOL STORE
  toolInUse: "none",
  setToolInUse: () => {},

  isMobile: false,

  isReadyToChat: false,
  setIsReadyToChat: () => {},

  // Audio
  currentPlayingMessageId: null,
  setCurrentPlayingMessageId: () => {},
  isMicSupported: true,
  setIsMicSupported: () => {},

  // Conversational AI
  isConversationalAIOpen: false,
  setIsConversationalAIOpen: () => {},

  // Sidebar
  showSidebar: false,
  setShowSidebar: () => {}
})
