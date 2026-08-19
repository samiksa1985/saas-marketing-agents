export interface AIRequest {
  tenantId: string;
  agentId: string;
  locale: string;
  promptVersion: string;
  input: unknown;
}
export interface AIResponse {
  provider: string;
  model: string;
  output: unknown;
  refused: boolean;
  usage?: { inputTokens: number; outputTokens: number };
}
export interface AIProvider {
  generate(request: AIRequest): Promise<AIResponse>;
}
export class MockAIProvider implements AIProvider {
  async generate(request: AIRequest): Promise<AIResponse> {
    return {
      provider: 'mock',
      model: 'foundation',
      output: { locale: request.locale, status: 'unimplemented' },
      refused: false,
    };
  }
}
