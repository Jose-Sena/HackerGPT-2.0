export interface ChatStarter {
  title: string
  description: string
  chatMessage: string
}

export interface PluginSummary {
  id: number
  name: string
  selectorName: string
  categories: string[]
  value: PluginID
  icon?: string
  invertInDarkMode?: boolean
  description?: string
  githubRepoUrl?: string
  isInstalled: boolean
  isPremium: boolean
  createdAt: string
  starters: ChatStarter[]
}

export interface Plugin {
  id: PluginID
}

export enum PluginID {
  NONE = "none",
  CVEMAP = "cvemap",
  NUCLEI = "nuclei",
  SUBFINDER = "subfinder",
  KATANA = "katana",
  HTTPX = "httpx",
  GAU = "gau",
  ALTERX = "alterx",
  DNSX = "dnsx",
  WEB_SEARCH = "websearch",
  ENHANCED_SEARCH = "enhancedsearch",
  PLUGINS_STORE = "pluginselector",
  // Tools
  PORTSCANNER = "portscanner",
  LINKFINDER = "linkfinder",
  SSLSCANNER = "sslscanner",
  SQLIEXPLOITER = "sqliexploiter"
}

export const Plugins: Record<PluginID, Plugin> = Object.fromEntries(
  Object.values(PluginID).map(id => [id, { id }])
) as Record<PluginID, Plugin>

export const PluginList = Object.values(Plugins)

type PluginUrls = Record<string, string>

export const pluginUrls: PluginUrls = {
  HACKERGPT: "https://github.com/Hacker-GPT/HackerGPT-2.0",
  CVEMAP: "https://github.com/projectdiscovery/cvemap",
  SUBFINDER: "https://github.com/projectdiscovery/subfinder",
  NUCLEI: "https://github.com/projectdiscovery/nuclei",
  KATANA: "https://github.com/projectdiscovery/katana",
  HTTPX: "https://github.com/projectdiscovery/httpx",
  GAU: "https://github.com/lc/gau",
  ALTERX: "https://github.com/projectdiscovery/alterx",
  DNSX: "https://github.com/projectdiscovery/dnsx",
  // Tools
  PORTSCANNER: "https://github.com/projectdiscovery/naabu",
  LINKFINDER: "https://github.com/0xsha/GoLinkFinder",
  SSLSCANNER: "https://github.com/drwetter/testssl.sh/",
  SQLIEXPLOITER: "https://github.com/sqlmapproject/sqlmap"
}
