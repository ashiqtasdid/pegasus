import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosResponse } from 'axios';

export interface OpenRouterMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface OpenRouterRequest {
  model?: string;
  messages: OpenRouterMessage[];
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
}

export interface OpenRouterResponse {
  choices: Array<{
    message: {
      content: string;
      role: string;
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/**
 * OpenRouter API Client - Handles communication with OpenRouter API
 */
@Injectable()
export class OpenRouterClient {
  private readonly baseUrl = 'https://openrouter.ai/api/v1';
  private readonly apiKey: string;
  private readonly siteUrl: string;
  private readonly siteName: string;

  constructor(private configService: ConfigService) {
    this.apiKey = this.configService.get<string>('OPENROUTER_API_KEY') || '';
    this.siteUrl = this.configService.get<string>(
      'YOUR_SITE_URL',
      'http://localhost:3000',
    );
    this.siteName = this.configService.get<string>(
      'YOUR_SITE_NAME',
      'Pegasus Plugin Generator',
    );

    if (!this.apiKey) {
      throw new Error(
        'OPENROUTER_API_KEY is not configured in environment variables',
      );
    }
  }

  /**
   * Make a chat completion request to OpenRouter API
   */
  async chatCompletion(
    request: OpenRouterRequest,
  ): Promise<OpenRouterResponse> {
    const startTime = Date.now();
    console.log(`🔗 OpenRouter Client: Making HTTP request to OpenRouter API`);
    console.log(
      `📊 OpenRouter Client: Request model: ${request.model}, temperature: ${request.temperature}, max_tokens: ${request.max_tokens}`,
    );

    try {
      const response: AxiosResponse<OpenRouterResponse> = await axios.post(
        `${this.baseUrl}/chat/completions`,
        request,
        {
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': this.siteUrl,
            'X-Title': this.siteName,
          },
          timeout: 60000, // 60 second timeout
        },
      );

      const duration = Date.now() - startTime;
      console.log(`✅ OpenRouter Client: API call completed in ${duration}ms`);
      console.log(
        `📊 OpenRouter Client: Token usage - prompt: ${response.data.usage?.prompt_tokens}, completion: ${response.data.usage?.completion_tokens}, total: ${response.data.usage?.total_tokens}`,
      );

      return response.data;
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(
        `❌ OpenRouter Client: API call failed after ${duration}ms`,
      );

      if (axios.isAxiosError(error)) {
        console.error(
          `❌ OpenRouter Client: HTTP ${error.response?.status} - ${error.response?.data?.error?.message || error.message}`,
        );
        throw new Error(
          `OpenRouter API error: ${error.response?.data?.error?.message || error.message}`,
        );
      }
      console.error(`❌ OpenRouter Client: Unexpected error: ${error.message}`);
      throw new Error(`Failed to call OpenRouter API: ${error.message}`);
    }
  }

  /**
   * Validate API configuration
   */
  validateConfiguration(): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!this.apiKey) {
      errors.push('OPENROUTER_API_KEY is not configured');
    }

    if (!this.siteUrl) {
      errors.push('YOUR_SITE_URL is not configured');
    }

    if (!this.siteName) {
      errors.push('YOUR_SITE_NAME is not configured');
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Get configuration info for debugging
   */
  getConfigInfo(): Record<string, any> {
    return {
      baseUrl: this.baseUrl,
      siteUrl: this.siteUrl,
      siteName: this.siteName,
      hasApiKey: !!this.apiKey,
      apiKeyLength: this.apiKey?.length || 0,
    };
  }
}
