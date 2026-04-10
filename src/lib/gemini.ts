import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const base64String = (reader.result as string).split(',')[1];
      resolve(base64String);
    };
    reader.onerror = (error) => reject(error);
  });
}

export interface AnalysisResult {
  summary: string;
  researchObjective: string;
  methodology: string;
  keyFindings: string;
  dataEvidence: string;
  limitationsGaps: string;
  conclusionFutureWork: string;
  keywords: { word: string; definition: string }[];
  humanizedExplanation: string;
  topicDistribution: { topic: string; percentage: number }[];
  attendanceAnalysis?: { status: string; percentage: number }[];
  difficultyLevel: "Beginner" | "Intermediate" | "Advanced";
  studyResources: string[];
}

export async function analyzeDocument(input: string | File, length: number, mode: string): Promise<AnalysisResult> {
  const isFile = input instanceof File;
  const isUrl = typeof input === 'string' && (input.startsWith('http://') || input.startsWith('https://'));
  
  let contents: any;
  let tools: any[] = [];
  let toolConfig: any = undefined;

  if (isFile) {
    const base64Data = await fileToBase64(input);
    contents = {
      parts: [
        {
          inlineData: {
            mimeType: input.type,
            data: base64Data
          }
        },
        {
          text: `Analyze the attached document and provide a structured output in JSON format.
          Summary Length: Approximately ${length} words.
          Language Mode: ${mode} (Academic, Simple, or ELI5)
          
          Special Instruction: If this document contains student attendance records or data, provide a breakdown in the 'attendanceAnalysis' field (e.g., Present, Absent, Late). If no attendance data is found, provide a generic distribution based on document themes or leave it empty.`
        }
      ]
    };
  } else if (isUrl) {
    contents = `Analyze the content of this URL: ${input}
    Provide a structured output in JSON format based on the content found at this link.
    Summary Length: Approximately ${length} words.
    Language Mode: ${mode} (Academic, Simple, or ELI5)`;
    tools = [{ googleSearch: {} }];
    toolConfig = { includeServerSideToolInvocations: true };
  } else {
    contents = `Analyze the following academic text and provide a structured output in JSON format.
    Text: ${input.substring(0, 30000)}
    Summary Length: Approximately ${length} words.
    Language Mode: ${mode} (Academic, Simple, or ELI5)`;
  }

  const prompt = isFile ? "" : contents; // If file, prompt is in parts

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: isFile ? [contents] : [{ role: "user", parts: [{ text: prompt }] }],
    config: {
      tools,
      toolConfig,
      responseMimeType: "application/json",
      responseSchema: {
        // ... same schema ...
        type: Type.OBJECT,
        properties: {
          summary: { type: Type.STRING },
          researchObjective: { type: Type.STRING },
          methodology: { type: Type.STRING },
          keyFindings: { type: Type.STRING },
          dataEvidence: { type: Type.STRING },
          limitationsGaps: { type: Type.STRING },
          conclusionFutureWork: { type: Type.STRING },
          keywords: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                word: { type: Type.STRING },
                definition: { type: Type.STRING }
              },
              required: ["word", "definition"]
            }
          },
          humanizedExplanation: { type: Type.STRING },
          topicDistribution: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                topic: { type: Type.STRING },
                percentage: { type: Type.NUMBER }
              },
              required: ["topic", "percentage"]
            }
          },
          attendanceAnalysis: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                status: { type: Type.STRING },
                percentage: { type: Type.NUMBER }
              },
              required: ["status", "percentage"]
            }
          },
          difficultyLevel: { type: Type.STRING, enum: ["Beginner", "Intermediate", "Advanced"] },
          studyResources: { type: Type.ARRAY, items: { type: Type.STRING } }
        },
        required: [
          "summary", "researchObjective", "methodology", "keyFindings", 
          "dataEvidence", "limitationsGaps", "conclusionFutureWork", 
          "keywords", "humanizedExplanation", "topicDistribution", "attendanceAnalysis",
          "difficultyLevel", "studyResources"
        ]
      }
    }
  });

  return JSON.parse(response.text);
}

export async function chatWithDocument(input: string | File, history: { role: string; parts: string }[], message: string) {
  const isFile = input instanceof File;
  const isUrl = typeof input === 'string' && (input.startsWith('http://') || input.startsWith('https://'));
  
  let systemInstruction = `You are EduSense AI, a university research assistant. 
  You are helping a student or researcher understand a document.
  Base your answers strictly on the provided document. 
  If the information is not in the document, say so.`;

  if (isUrl) {
    systemInstruction += `\nThe document is located at this URL: ${input}`;
  } else if (!isFile) {
    systemInstruction += `\nDocument Text: ${input.substring(0, 30000)}`;
  }

  // Convert history to Gemini format
  const geminiHistory = history.map(h => ({
    role: h.role === "user" ? "user" : "model",
    parts: [{ text: h.parts }]
  }));

  const chat = ai.chats.create({
    model: "gemini-3-flash-preview",
    config: {
      systemInstruction: systemInstruction,
      tools: isUrl ? [{ googleSearch: {} }] : undefined,
      toolConfig: isUrl ? { includeServerSideToolInvocations: true } : undefined
    },
    history: geminiHistory
  });

  let messagePayload: any;
  if (isFile) {
    const base64Data = await fileToBase64(input);
    messagePayload = [
      {
        inlineData: {
          mimeType: input.type,
          data: base64Data
        }
      },
      { text: message }
    ];
  } else {
    messagePayload = message;
  }

  const result = await chat.sendMessage({ message: messagePayload });

  return result.text;
}

export async function getRelatedResearch(keywords: string[]) {
  const prompt = `Based on these keywords: ${keywords.join(", ")}, suggest 5 related research papers or articles.
  Return a JSON array of objects with: title, authors, year, relevanceScore (0-100), source (Google Scholar/arXiv/Semantic Scholar).`;

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            authors: { type: Type.STRING },
            year: { type: Type.STRING },
            relevanceScore: { type: Type.NUMBER },
            source: { type: Type.STRING }
          },
          required: ["title", "authors", "year", "relevanceScore", "source"]
        }
      }
    }
  });

  return JSON.parse(response.text);
}
