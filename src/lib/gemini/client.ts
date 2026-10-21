import { GoogleGenerativeAI } from "@google/generative-ai";

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  throw new Error("GEMINI_API_KEY não configurado.");
}

export const genAI = new GoogleGenerativeAI(apiKey);
export const geminiFlash = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
