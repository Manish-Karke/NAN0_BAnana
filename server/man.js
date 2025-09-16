import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(cors()); // Enable CORS for all routes
app.use(express.static(path.join(__dirname))); // Serve static files

// Serve the HTML file at root
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// Helper function for retry logic
async function makeRequestWithRetry(url, options, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);

      if (response.status === 503 && attempt < maxRetries) {
        const waitTime = Math.pow(2, attempt) * 1000; // Exponential backoff
        console.log(
          `Attempt ${attempt} failed with 503. Retrying in ${
            waitTime / 1000
          } seconds...`
        );
        await new Promise((resolve) => setTimeout(resolve, waitTime));
        continue;
      }

      return response;
    } catch (error) {
      if (attempt === maxRetries) throw error;
      const waitTime = Math.pow(2, attempt) * 1000;
      console.log(
        `Attempt ${attempt} failed with error. Retrying in ${
          waitTime / 1000
        } seconds...`
      );
      await new Promise((resolve) => setTimeout(resolve, waitTime));
    }
  }
}

// Available models configuration
const IMAGE_MODELS = {
  "gemini-2.0-flash-exp": {
    endpoint: "generateContent",
    name: "Gemini 2.0 Flash (Experimental)",
    supportsImageGen: true,
    format: "gemini",
  },
  "imagen-4": {
    endpoint: "generateImage",
    name: "Imagen 4 (High Quality)",
    supportsImageGen: true,
    format: "imagen",
  },
  "imagen-4-fast": {
    endpoint: "generateImage",
    name: "Imagen 4 Fast",
    supportsImageGen: true,
    format: "imagen",
  },
};

// Gemini format request
async function generateWithGemini(
  prompt,
  apiKey,
  modelName = "gemini-2.0-flash-exp"
) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;

  return await makeRequestWithRetry(
    url,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "GeminiImageGenerator/1.0",
      },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [{ text: prompt }],
          },
        ],
        generationConfig: {
          responseModalities: ["TEXT", "IMAGE"],
          temperature: 0.8,
          topP: 0.9,
        },
      }),
    },
    3
  );
}

// Imagen format request
async function generateWithImagen(prompt, apiKey, modelName = "imagen-4-fast") {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateImage?key=${apiKey}`;

  return await makeRequestWithRetry(
    url,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "GeminiImageGenerator/1.0",
      },
      body: JSON.stringify({
        prompt: prompt,
        config: {
          aspectRatio: "1:1",
          numberOfImages: 1,
          safetyFilterLevel: "block_some",
        },
      }),
    },
    3
  );
}

app.post("/api/generate", async (req, res) => {
  try {
    const { prompt, model = "gemini-2.0-flash-exp" } = req.body;

    if (!prompt || typeof prompt !== "string" || prompt.trim().length === 0) {
      return res.status(400).json({
        error: "Please provide a valid prompt",
      });
    }

    if (!process.env.GOOGLE_API_KEY) {
      return res.status(500).json({
        error: "Google API key not configured",
      });
    }

    const modelConfig = IMAGE_MODELS[model];
    if (!modelConfig) {
      return res.status(400).json({
        error: `Unsupported model: ${model}. Available models: ${Object.keys(
          IMAGE_MODELS
        ).join(", ")}`,
      });
    }

    console.log(
      `Generating image with ${modelConfig.name} for prompt: "${prompt}"`
    );

    let response;
    try {
      if (modelConfig.format === "gemini") {
        response = await generateWithGemini(
          prompt,
          process.env.GOOGLE_API_KEY,
          model
        );
      } else if (modelConfig.format === "imagen") {
        response = await generateWithImagen(
          prompt,
          process.env.GOOGLE_API_KEY,
          model
        );
      }
    } catch (error) {
      // If primary model fails with 503, try fallback
      if (error.message.includes("503") && model === "gemini-2.0-flash-exp") {
        console.log("Gemini overloaded, trying Imagen 4 Fast as fallback...");
        try {
          response = await generateWithImagen(
            prompt,
            process.env.GOOGLE_API_KEY,
            "imagen-4-fast"
          );
        } catch (fallbackError) {
          throw new Error(
            `Both primary and fallback models failed: ${fallbackError.message}`
          );
        }
      } else {
        throw error;
      }
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error("API Error:", response.status, errorText);
      return res.status(response.status).json({
        error: `API request failed: ${response.status} - ${errorText}`,
      });
    }

    const data = await response.json();
    console.log("API Response structure:", JSON.stringify(data, null, 2));

    // Handle Imagen response format
    if (data.generatedImages) {
      console.log("Image generated successfully with Imagen!");
      return res.json({
        image: data.generatedImages[0].bytesBase64Encoded,
        mimeType: "image/png",
        model: modelConfig.name,
      });
    }

    // Handle Gemini response format
    const candidate = data?.candidates?.[0];

    if (!candidate) {
      return res.status(500).json({
        error: "No candidates returned from API",
        debug: data,
      });
    }

    if (candidate.content?.parts) {
      // Look for image first
      for (const part of candidate.content.parts) {
        if (part.inlineData?.mimeType?.startsWith("image/")) {
          console.log("Image generated successfully!");
          return res.json({
            image: part.inlineData.data,
            mimeType: part.inlineData.mimeType,
            model: modelConfig.name,
          });
        }
      }

      // If no image, return text
      const textParts = candidate.content.parts
        .filter((part) => part.text)
        .map((part) => part.text);

      if (textParts.length > 0) {
        console.log("No image generated, returning text response");
        return res.json({
          text: textParts.join("\n"),
          message:
            "The model returned text instead of an image. Try a more specific visual description.",
        });
      }
    }

    // Handle potential safety/filter issues
    if (candidate.finishReason && candidate.finishReason !== "STOP") {
      return res.json({
        text: `Generation stopped due to: ${candidate.finishReason}. Try modifying your prompt.`,
        finishReason: candidate.finishReason,
      });
    }

    return res.status(500).json({
      error: "No content returned from model",
      debug: { candidate },
    });
  } catch (error) {
    console.error("Server error:", error);
    res.status(500).json({
      error: "Internal server error: " + error.message,
    });
  }
});

// Get available models endpoint
app.get("/api/models", (req, res) => {
  res.json({
    models: Object.entries(IMAGE_MODELS).map(([key, config]) => ({
      id: key,
      name: config.name,
      supportsImageGen: config.supportsImageGen,
    })),
    default: "gemini-2.0-flash-exp",
  });
});

// Health check endpoint
app.get("/api/health", (req, res) => {
  res.json({
    status: "OK",
    timestamp: new Date().toISOString(),
    hasApiKey: !!process.env.GOOGLE_API_KEY,
  });
});

app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/api/health`);
  console.log(`🔑 API Key configured: ${!!process.env.GOOGLE_API_KEY}`);
});

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("SIGTERM received, shutting down gracefully");
  process.exit(0);
});

process.on("SIGINT", () => {
  console.log("SIGINT received, shutting down gracefully");
  process.exit(0);
});
