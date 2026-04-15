export interface MediaTransport<TInboundMessage> {
  loadCredentials(): Promise<{ userId?: string } | null>;
  pollMessages(options: {
    afterMessageId?: string;
    timeoutMs?: number;
    minCreatedAtMs?: number;
  }): Promise<{
    messages: TInboundMessage[];
  }>;
  sendText(recipientId: string, text: string): Promise<unknown>;
}
