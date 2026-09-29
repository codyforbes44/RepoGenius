import { GoogleGenAI, Chat, GenerateContentResponse } from "@google/genai";


// Initialize the API client
// Note: In a real production app, ensure this key is handled securely (e.g. backend proxy).
// Since this is a client-side demo instructions, we access env directly.
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const createChatSession = (systemInstruction: string): Chat => {
  return ai.chats.create({
    model: 'gemini-3-flash-preview',
    config: {
      systemInstruction,
    },
  });
};

export const sendMessageToGemini = async (chat: Chat, message: string): Promise<string> => {
  try {
    const result: GenerateContentResponse = await chat.sendMessage({ message });
    return result.text || "No response generated.";
  } catch (error) {
    console.error("Gemini API Error:", error);
    throw error;
  }
};

export const generateSummary = async (repoName: string, readmeContent: string): Promise<string> => {
  try {
    const prompt = `
      Analyze the following README content for the GitHub repository "${repoName}".
      Provide a concise summary of what this project does, its key features, and primary tech stack.
      Keep it under 200 words. Format with markdown.
      
      README Content:
      ${readmeContent.substring(0, 10000)} 
    `;
    // Truncate to avoid massive context usage on huge readmes for this specific quick summary call

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
    });
    return response.text || "Could not generate summary.";
  } catch (error) {
    console.error("Summary Generation Error:", error);
    return "Failed to generate summary.";
  }
};

export const analyzeCode = async (fileName: string, code: string): Promise<string> => {
  try {
     const prompt = `
      Analyze the following code file: ${fileName}.
      1. Explain what this file does.
      2. Identify any potential bugs or security risks (if obvious).
      3. Suggest one improvement.
      
      Code:
      \`\`\`
      ${code.substring(0, 20000)}
      \`\`\`
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
    });
    return response.text || "Could not analyze code.";
  } catch (error) {
    console.error("Code Analysis Error:", error);
    return "Failed to analyze code.";
  }
};

export const generateDeploymentGuide = async (
    repoName: string, 
    fileNames: string[], 
    readme: string = '', 
    packageJson: string = ''
): Promise<string> => {
  try {
    const prompt = `
      I have a GitHub repository named "${repoName}".
      
      File Structure (Root): ${fileNames.join(', ')}
      
      package.json Content:
      ${packageJson ? packageJson.substring(0, 3000) : 'Not available'}
      
      README Content (Snippet):
      ${readme ? readme.substring(0, 3000) : 'Not available'}

      Task:
      1. Precise Stack Identification: Identify the exact framework (e.g., React, Vue, Node.js), build tool (Vite, Webpack), and key libraries based on the package.json dependencies.
      2. Deployment Prompt: Generate a detailed "System Prompt" that I can paste into an AI coding tool (like Google AI Studio) to instruct it to rebuild this specific application. This prompt must include the tech stack and core features described in the README.
      3. Build Instructions: Provide the exact npm/yarn commands to install and run this locally.
      
      Format the response in Markdown. Use a code block for the "Deployment Prompt".
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
    });
    return response.text || "Could not generate deployment guide.";
  } catch (error) {
    console.error("Deployment Guide Error:", error);
    return "Failed to generate deployment guide.";
  }
};