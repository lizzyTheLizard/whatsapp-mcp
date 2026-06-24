import { describe, it, expect } from "vitest";
import { z } from "zod";

const SendMessageSchema = z.object({
  to: z.string().min(1),
  message: z.string().min(1),
});

const ListChatsSchema = z.object({
  limit: z.number().int().positive().optional().default(20),
});

const ReadMessagesSchema = z.object({
  chatId: z.string().min(1),
  limit: z.number().int().positive().optional().default(50),
});

describe("send_message schema", () => {
  it("accepts valid input", () => {
    const result = SendMessageSchema.parse({ to: "+1234567890", message: "Hello" });
    expect(result).toEqual({ to: "+1234567890", message: "Hello" });
  });

  it("rejects missing recipient", () => {
    expect(() => SendMessageSchema.parse({ message: "Hello" })).toThrow();
  });

  it("rejects empty message", () => {
    expect(() => SendMessageSchema.parse({ to: "+1234567890", message: "" })).toThrow();
  });
});

describe("list_chats schema", () => {
  it("applies default limit", () => {
    const result = ListChatsSchema.parse({});
    expect(result.limit).toBe(20);
  });

  it("accepts custom limit", () => {
    const result = ListChatsSchema.parse({ limit: 5 });
    expect(result.limit).toBe(5);
  });
});

describe("read_messages schema", () => {
  it("requires chatId", () => {
    expect(() => ReadMessagesSchema.parse({})).toThrow();
  });

  it("applies default limit", () => {
    const result = ReadMessagesSchema.parse({ chatId: "chat1" });
    expect(result.limit).toBe(50);
  });
});
