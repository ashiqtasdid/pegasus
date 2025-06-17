/**
 * TypeScript interfaces and types for the Plugin Files API
 * 
 * This file provides type definitions for all API endpoints related to plugin file operations,
 * including reading, caching, and health check functionality.
 */

// ============================================================================
// Plugin Files API Types
// ============================================================================

/**
 * Request body for getting plugin files
 */
export interface PluginFilesRequest {
  /** The unique identifier of the user who owns the plugin */
  userId: string;
  /** The name of the plugin to retrieve files from */
  pluginName: string;
}

/**
 * Success response from the plugin files endpoint
 */
export interface PluginFilesSuccessResponse {
  success: true;
  /** Object mapping file paths to their content */
  files: Record<string, string>;
}

/**
 * Error response from the plugin files endpoint
 */
export interface PluginFilesErrorResponse {
  success: false;
  /** Error message describing what went wrong */
  error: string;
}

/**
 * Union type for all possible plugin files responses
 */
export type PluginFilesResponse = PluginFilesSuccessResponse | PluginFilesErrorResponse;

// ============================================================================
// Cache Management Types
// ============================================================================

/**
 * Request body for clearing plugin files cache
 */
export interface ClearCacheRequest {
  /** Optional: User ID to clear cache for specific user (if omitted, clears all) */
  userId?: string;
  /** Optional: Plugin name to clear cache for specific plugin (requires userId) */
  pluginName?: string;
}

/**
 * Success response from cache clear endpoint
 */
export interface ClearCacheSuccessResponse {
  success: true;
  /** Confirmation message describing what was cleared */
  message: string;
}

/**
 * Error response from cache clear endpoint
 */
export interface ClearCacheErrorResponse {
  success: false;
  /** Error message describing what went wrong */
  error: string;
}

/**
 * Union type for all possible cache clear responses
 */
export type ClearCacheResponse = ClearCacheSuccessResponse | ClearCacheErrorResponse;

/**
 * Cache statistics data
 */
export interface CacheStats {
  /** Total number of cached entries */
  totalEntries: number;
  /** Array of cache keys in format "userId:pluginName" */
  cacheKeys: string[];
  /** Same as totalEntries (for compatibility) */
  cacheSize: number;
}

/**
 * Success response from cache stats endpoint
 */
export interface CacheStatsSuccessResponse {
  success: true;
  /** Cache statistics object */
  stats: CacheStats;
}

/**
 * Error response from cache stats endpoint
 */
export interface CacheStatsErrorResponse {
  success: false;
  /** Error message describing what went wrong */
  error: string;
}

/**
 * Union type for all possible cache stats responses
 */
export type CacheStatsResponse = CacheStatsSuccessResponse | CacheStatsErrorResponse;

// ============================================================================
// Health Check Types
// ============================================================================

/**
 * Uptime information in both numeric and human-readable formats
 */
export interface UptimeInfo {
  /** Server uptime in seconds */
  seconds: number;
  /** Human-readable uptime (e.g., "1h 30m 45s") */
  human: string;
}

/**
 * Memory usage information in megabytes
 */
export interface MemoryInfo {
  /** Heap memory used in MB */
  used: number;
  /** Total heap memory in MB */
  total: number;
  /** External memory in MB */
  external: number;
}

/**
 * Detailed health check response
 */
export interface DetailedHealthResponse {
  /** Always "healthy" if server is responding */
  status: "healthy";
  /** Current server time in ISO format */
  timestamp: string;
  /** Server uptime information */
  uptime: UptimeInfo;
  /** Memory usage information */
  memory: MemoryInfo;
  /** Node.js version */
  version: string;
  /** Operating system platform */
  platform: string;
  /** Process ID */
  pid: number;
}

/**
 * Simple health check response
 */
export interface SimpleHealthResponse {
  /** Always "ok" if server is responding */
  status: "ok";
  /** Current server time in ISO format */
  timestamp: string;
}

// ============================================================================
// File Type Enums and Constants
// ============================================================================

/**
 * Supported file extensions and their corresponding languages for Monaco Editor
 */
export enum FileLanguage {
  JAVA = "java",
  XML = "xml",
  YAML = "yaml",
  JSON = "json",
  PROPERTIES = "properties",
  MARKDOWN = "markdown",
  TEXT = "text"
}

/**
 * Mapping of file extensions to Monaco Editor languages
 */
export const FILE_EXTENSION_TO_LANGUAGE: Record<string, FileLanguage> = {
  ".java": FileLanguage.JAVA,
  ".xml": FileLanguage.XML,
  ".yml": FileLanguage.YAML,
  ".yaml": FileLanguage.YAML,
  ".json": FileLanguage.JSON,
  ".properties": FileLanguage.PROPERTIES,
  ".md": FileLanguage.MARKDOWN,
  ".txt": FileLanguage.TEXT
} as const;

/**
 * File type information
 */
export interface FileInfo {
  /** File extension */
  extension: string;
  /** File type category */
  type: "Source" | "Config" | "Data" | "Documentation" | "Text";
  /** Monaco Editor language identifier */
  language: FileLanguage;
  /** Human-readable description */
  description: string;
}

/**
 * Common Minecraft plugin file types
 */
export const PLUGIN_FILE_TYPES: Record<string, FileInfo> = {
  ".java": {
    extension: ".java",
    type: "Source",
    language: FileLanguage.JAVA,
    description: "Java source code files"
  },
  ".xml": {
    extension: ".xml",
    type: "Config",
    language: FileLanguage.XML,
    description: "Maven POM files, configuration"
  },
  ".yml": {
    extension: ".yml",
    type: "Config",
    language: FileLanguage.YAML,
    description: "Plugin configuration files"
  },
  ".yaml": {
    extension: ".yaml",
    type: "Config",
    language: FileLanguage.YAML,
    description: "Plugin configuration files"
  },
  ".json": {
    extension: ".json",
    type: "Data",
    language: FileLanguage.JSON,
    description: "JSON configuration and data files"
  },
  ".properties": {
    extension: ".properties",
    type: "Config",
    language: FileLanguage.PROPERTIES,
    description: "Java properties files"
  },
  ".md": {
    extension: ".md",
    type: "Documentation",
    language: FileLanguage.MARKDOWN,
    description: "Markdown documentation"
  },
  ".txt": {
    extension: ".txt",
    type: "Text",
    language: FileLanguage.TEXT,
    description: "Plain text files"
  }
} as const;

// ============================================================================
// API Client Interface
// ============================================================================

/**
 * Configuration options for the API client
 */
export interface ApiClientConfig {
  /** Base URL of the API server */
  baseUrl: string;
  /** Request timeout in milliseconds */
  timeout?: number;
  /** Custom headers to include with requests */
  headers?: Record<string, string>;
}

/**
 * Interface for a Plugin Files API client
 */
export interface PluginFilesApiClient {
  /**
   * Get all files from a user's plugin
   */
  getPluginFiles(userId: string, pluginName: string): Promise<PluginFilesResponse>;
  
  /**
   * Clear plugin files cache
   */
  clearCache(userId?: string, pluginName?: string): Promise<ClearCacheResponse>;
  
  /**
   * Get cache statistics
   */
  getCacheStats(): Promise<CacheStatsResponse>;
  
  /**
   * Get detailed health information
   */
  getHealth(): Promise<DetailedHealthResponse>;
  
  /**
   * Get simple health status
   */
  getSimpleHealth(): Promise<SimpleHealthResponse>;
}

// ============================================================================
// Monaco Editor Integration Types
// ============================================================================

/**
 * Monaco Editor model information
 */
export interface MonacoModel {
  /** File path for the model */
  filePath: string;
  /** Monaco Editor model instance */
  model: any; // monaco.editor.ITextModel
  /** Language of the file */
  language: FileLanguage;
}

/**
 * File tree node for display in UI
 */
export interface FileTreeNode {
  /** Display name of the file/folder */
  name: string;
  /** Full path of the file */
  path: string;
  /** Whether this is a directory */
  isDirectory: boolean;
  /** Child nodes (for directories) */
  children?: FileTreeNode[];
  /** File content (for files) */
  content?: string;
  /** File language for syntax highlighting */
  language?: FileLanguage;
}

/**
 * Plugin editor state
 */
export interface PluginEditorState {
  /** Currently loaded user ID */
  userId: string | null;
  /** Currently loaded plugin name */
  pluginName: string | null;
  /** All loaded files */
  files: Record<string, string>;
  /** Monaco Editor models */
  models: Record<string, MonacoModel>;
  /** Currently active file path */
  activeFile: string | null;
  /** File tree structure */
  fileTree: FileTreeNode[];
  /** Loading state */
  isLoading: boolean;
  /** Error message if any */
  error: string | null;
}

// ============================================================================
// Utility Types
// ============================================================================

/**
 * Type guard to check if a response is successful
 */
export function isSuccessResponse<T extends { success: boolean }>(
  response: T
): response is T & { success: true } {
  return response.success === true;
}

/**
 * Type guard to check if a response is an error
 */
export function isErrorResponse<T extends { success: boolean }>(
  response: T
): response is T & { success: false } {
  return response.success === false;
}

/**
 * Extract error message from any API response
 */
export function getErrorMessage(response: { success: boolean; error?: string }): string {
  return isErrorResponse(response) ? (response.error || "Unknown error occurred") : "Unknown error occurred";
}

/**
 * Get Monaco Editor language from file path
 */
export function getLanguageFromPath(filePath: string): FileLanguage {
  const extension = filePath.substring(filePath.lastIndexOf('.'));
  return FILE_EXTENSION_TO_LANGUAGE[extension] || FileLanguage.TEXT;
}

/**
 * Get file type information from file path
 */
export function getFileInfo(filePath: string): FileInfo {
  const extension = filePath.substring(filePath.lastIndexOf('.'));
  return PLUGIN_FILE_TYPES[extension] || {
    extension,
    type: "Text",
    language: FileLanguage.TEXT,
    description: "Unknown file type"
  };
}

/**
 * Build file tree from flat file list
 */
export function buildFileTree(files: Record<string, string>): FileTreeNode[] {
  const tree: FileTreeNode[] = [];
  const directories = new Map<string, FileTreeNode>();

  // Sort files for consistent ordering
  const sortedPaths = Object.keys(files).sort();

  for (const filePath of sortedPaths) {
    const parts = filePath.split('/');
    let currentPath = '';
    let currentLevel = tree;

    // Create directory structure
    for (let i = 0; i < parts.length - 1; i++) {
      currentPath += (currentPath ? '/' : '') + parts[i];
      
      if (!directories.has(currentPath)) {
        const dirNode: FileTreeNode = {
          name: parts[i],
          path: currentPath,
          isDirectory: true,
          children: []
        };
        
        directories.set(currentPath, dirNode);
        currentLevel.push(dirNode);
        currentLevel = dirNode.children!;
      } else {
        currentLevel = directories.get(currentPath)!.children!;
      }
    }

    // Add file
    const fileName = parts[parts.length - 1];
    const fileNode: FileTreeNode = {
      name: fileName,
      path: filePath,
      isDirectory: false,
      content: files[filePath],
      language: getLanguageFromPath(filePath)
    };

    currentLevel.push(fileNode);
  }

  return tree;
}

// ============================================================================
// Error Types
// ============================================================================

/**
 * Custom error class for Plugin Files API errors
 */
export class PluginFilesApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
    public readonly response?: any
  ) {
    super(message);
    this.name = 'PluginFilesApiError';
  }
}

/**
 * Network error for connection issues
 */
export class NetworkError extends PluginFilesApiError {
  constructor(message: string) {
    super(message);
    this.name = 'NetworkError';
  }
}

/**
 * Validation error for invalid input
 */
export class ValidationError extends PluginFilesApiError {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

// ============================================================================
// Constants
// ============================================================================

/**
 * HTTP status codes
 */
export const HTTP_STATUS = {
  OK: 200,
  BAD_REQUEST: 400,
  NOT_FOUND: 404,
  INTERNAL_SERVER_ERROR: 500
} as const;

/**
 * API endpoints
 */
export const API_ENDPOINTS = {
  PLUGIN_FILES: '/plugin/files',
  CLEAR_CACHE: '/plugin/clear-cache',
  CACHE_STATS: '/plugin/cache-stats',
  HEALTH: '/health',
  SIMPLE_HEALTH: '/health/simple'
} as const;

/**
 * Default configuration values
 */
export const DEFAULT_CONFIG = {
  BASE_URL: 'http://localhost:3000',
  TIMEOUT: 30000, // 30 seconds
  CACHE_TTL: 300000, // 5 minutes
} as const;
