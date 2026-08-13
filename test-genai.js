import { GoogleGenAI } from "@google/genai";
console.log("SDK Loaded. typeof GoogleGenAI:", typeof GoogleGenAI);
try {
  const ai = new GoogleGenAI({ apiKey: "fake" });
  console.log("Client instantiated.");
  await ai.models.generateContent({
    model: "gemini-3.5-flash",
    contents: "ping",
  });
} catch (e) {
  console.log("Caught error:", e.message);
  console.log("Error cause:", e.cause);
}
