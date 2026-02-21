export type ChatTab = "public" | "private" | "network";

export interface LineRef {
  fileId: string;
  line: number;
}

export interface ChatMessage {
  id: string;
  from: string;
  text: string;
  createdAt: number;
  lineRef?: LineRef;
}

export interface DMThread {
  userId: string;
  userName: string;
  messages: ChatMessage[];
}