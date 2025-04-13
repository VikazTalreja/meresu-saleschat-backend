const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const axios = require('axios');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type'],
    credentials: true
  }
});
async function parseOptions(output) {
  console.log("Raw output to parse:", output);
  
  // Try to detect if output is already in JSON format
  try {
    if (output.includes('[') && output.includes(']')) {
      const jsonStartIndex = output.indexOf('[');
      const jsonEndIndex = output.lastIndexOf(']') + 1;
      if (jsonStartIndex >= 0 && jsonEndIndex > jsonStartIndex) {
        const jsonPart = output.substring(jsonStartIndex, jsonEndIndex);
        console.log("Attempting to parse JSON:", jsonPart);
        const parsed = JSON.parse(jsonPart);
        if (Array.isArray(parsed) && parsed.length > 0) {
          console.log("Successfully parsed JSON array:", parsed);
          return parsed.map(item => ({
            option: item.text || item.option || item.message || "",
            score: parseFloat(item.score || item.confidence || "0.5")
          }));
        }
      }
    }
  } catch (e) {
    console.log("Not valid JSON, using regex parsing:", e.message);
  }

  // Split the output into lines
  const lines = output.split("\n");

  // Initialize an array to store the parsed options
  const options = [];

  // Loop through each line
  lines.forEach((line, index) => {
    console.log(`Parsing line ${index + 1}:`, line);
    
    // Try multiple regex patterns to match different output formats
    const patterns = [
      // Format: 1. "Option text" analysis_score: 0.91
      /(?:\d+\.\s*)?"(.*)"(?:\s*|\s+)analysis_score:\s*([\d.]+)/i,
      
      // Format: "Option text" (score: 0.91)
      /"([^"]+)"(?:\s*|\s+)\(?(?:score|analysis_score|confidence):\s*([\d.]+)\)?/i,
      
      // Format: 1. Option text - score: 0.91
      /(?:\d+\.\s*)?(.*?)(?:[-–]\s*|\s+)(?:score|analysis_score|confidence):\s*([\d.]+)/i
    ];
    
    let matchFound = false;
    for (const pattern of patterns) {
      const match = line.match(pattern);
      if (match) {
        const optionText = match[1].trim();
        const score = match[2];
        
        console.log(`Match found with pattern: ${pattern}`);
        console.log(`Option text: "${optionText}", score: ${score}`);
        
        options.push({ option: optionText, score: parseFloat(score) });
        matchFound = true;
        break;
      }
    }
    
    if (!matchFound && line.includes("analysis_score")) {
      console.log("Line contains 'analysis_score' but no match with patterns");
    }
  });

  // If no options were found with line-by-line parsing, try global regex
  if (options.length === 0) {
    console.log("Using global regex pattern on entire output");
    
    const globalPatterns = [
      // Format: 1. "Option text" analysis_score: 0.91
      /(\d+)\.\s+"([^"]+)"(?:\s+|\s*)analysis_score:\s*([\d.]+)/g,
      
      // Format: "Option text" (score: 0.91)
      /"([^"]+)"(?:\s*|\s+)\(?(?:score|analysis_score|confidence):\s*([\d.]+)\)?/gi,
      
      // Format: 1. Option text - score: 0.91
      /(\d+)\.\s*(.*?)(?:[-–]\s*|\s+)(?:score|analysis_score|confidence):\s*([\d.]+)/gi
    ];
    
    for (const pattern of globalPatterns) {
      let match;
      while ((match = pattern.exec(output)) !== null) {
        // Different patterns have different group indices
        let optionText, score;
        
        if (match.length === 4) {  // Format with numbering
          optionText = match[2].trim();
          score = match[3];
        } else if (match.length === 3) {  // Format without numbering
          optionText = match[1].trim();
          score = match[2];
        }
        
        if (optionText && score) {
          console.log(`Global match found: "${optionText}", score: ${score}`);
          options.push({ option: optionText, score: parseFloat(score) });
        }
      }
      
      if (options.length > 0) {
        console.log(`Found ${options.length} options with global pattern`);
        break;
      }
    }
  }

  // If still no options found, create default options from the text
  if (options.length === 0) {
    console.log("No options found with regex patterns, creating default options");
    // Split by empty lines or numbered lists
    const sections = output.split(/\n\s*\n|\n\d+\./);
    for (let i = 0; i < sections.length && i < 3; i++) {
      if (sections[i] && sections[i].trim()) {
        const text = sections[i].trim();
        console.log(`Creating default option from section ${i+1}:`, text);
        options.push({
          option: text.substring(0, 100) + (text.length > 100 ? '...' : ''),
          score: 0.5 - (i * 0.1)  // Descending scores: 0.5, 0.4, 0.3
        });
      }
    }
  }

  // Sort options by score in descending order
  options.sort((a, b) => b.score - a.score);

  console.log("Final parsed options:", options);
  
  // Ensure we always return an array
  if (!Array.isArray(options) || options.length === 0) {
    console.log("Returning default empty options array");
    return [
      { option: "No valid options could be extracted from the response", score: 0.5 }
    ];
  }
  
  return options;
}

// // Function to query Groq API for chatbot
async function queryGroqChatbot(userMessage) {
  const apiKey = process.env.GROQ_API_KEY; // Ensure it's properly exposed if used in frontend
  const endpoint = "https://api.groq.com/openai/v1/chat/completions";
  console.log(userMessage);
  console.log("function call hua")

  if (!apiKey) {
    throw new Error("GROQ API key is missing. Check your environment variables.");
  }

  // Extract messages, goal, and context if provided in the new format
  let messages = userMessage;
  let goal = "";
  let projectContext = "";
  let companyContext = "";
  
  if (userMessage && typeof userMessage === 'object') {
    if (userMessage.messages) {
      messages = userMessage.messages;
    }
    
    goal = userMessage.goal || "";
    projectContext = userMessage.projectContext || "";
    companyContext = userMessage.companyContext || "";
  }

  // Define the system prompt
  const systemPrompt = `You are a senior sales strategist tasked with engineering high-stakes, psychologically nuanced dialogue paths. Dissect the conversation history, client's latent motivations (inferred from verbal/nonverbal patterns), and business objectives.

${goal ? `The conversation goal is: "${goal}". All generated options must strategically advance this goal.` : ''}

${projectContext ? `Project Context: "${projectContext}". Consider this project information when generating responses.` : ''}

${companyContext ? `Company Context: "${companyContext}". Consider this company information when generating responses.` : ''}

Generate 3 surgical conversation continuations that manipulate the trajectory toward closure while maintaining deniable plausibility. Each option must:

Anticipate and neutralize unspoken barriers (e.g., budget concerns, authority chains, competitor traps) through embedded framing.

Leverage value asymmetry by aligning the client's implicit priorities (ROI timelines, risk aversion, political capital) with the product's irreversible advantages.

Create temporal urgency without explicit deadlines, using subtle time-sensitivity cues.

Blend tone by mirroring the client's communication archetype (Analyst/Charismatic/Decider) while layering subtle dominance cues (conditional phrasing, strategic pauses implied through punctuation).

Critical Constraints:

Zero speculative offers: All value propositions must derive directly from pre-approved battle cards.

Steel-manned neutrality: Responses must pass adversarial testing—no overt pressure tactics detectable by a hostile procurement team.

4D Chess: Each option must function as both a standalone move and a setup for 3 future plays (e.g., up-sell triggers, reference seeding, escalation ladders).

Output Protocol:

ONLY 3 OPTIONS as standalone lines of exact dialogue the salesperson can utter, followed by an analysis score.

NO STRATEGY TAGS, explanations, or formatting beyond numbered options.

Mirror the client's last sentence structure (question→question, statement→statement).

17-23 words per option—short enough to feel spontaneous, long enough to contain layered intent.

Example of valid output:

1. "Let's benchmark your last project's resale uplift—was the maintenance clause a factor?" analysis_score: 0.91

2. "Competitor quotes often exclude monsoon-proofing—should we pressure-test their specs?" analysis_score: 0.82

3. "If we align terms by Friday, could your CFO review next week?" analysis_score: 0.73

Example of what NOT to do:
[Option 1] Let's benchmark... → [strategy labels]`;

  try {
    const response = await axios.post(
      endpoint,
      {
       "model": "llama-3.3-70b-versatile",
       messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: JSON.stringify(messages) },
        ],
        temperature: 0.7,
        max_tokens: 350,
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
      }
    );
console.log(response.data);
    return response.data?.choices?.[0]?.message?.content || "No response received.";
  } catch (error) {
    console.error("Error querying Groq API:", error.response?.data || error.message);
    return "Error fetching response.";
  }
}











// async function queryDeepseek(userMessage) {
//   const apiKey = process.env.DEEPSEEK_API_KEY; // Ensure your API key is stored securely
//   const endpoint = 'https://api.deepseek.com/v1/chat/completions'; // Replace with the actual endpoint
  
//   if (!apiKey) {
//     throw new Error("DeepseekAPI key is missing. Check your environment variables.");
//   }

//   // Extract messages and goal if provided in the new format
//   let messages = userMessage;
//   let goal = "";
  
//   if (userMessage && typeof userMessage === 'object' && userMessage.messages) {
//     messages = userMessage.messages;
//     goal = userMessage.goal || "";
//   }

//   const systemPrompt = `You are a senior sales strategist tasked with engineering high-stakes, psychologically nuanced dialogue paths. Dissect the conversation history, client's latent motivations (inferred from verbal/nonverbal patterns), and business objectives.

// ${goal ? `"${goal}". All generated options must strategically advance this goal.` : ''}

// Generate 3 surgical conversation continuations that manipulate the trajectory toward closure while maintaining deniable plausibility. Each option must:

// Anticipate and neutralize unspoken barriers (e.g., budget concerns, authority chains, competitor traps) through embedded framing.

// Leverage value asymmetry by aligning the client's implicit priorities (ROI timelines, risk aversion, political capital) with the product's irreversible advantages.

// Create temporal urgency without explicit deadlines, using subtle time-sensitivity cues.

// Blend tone by mirroring the client's communication archetype (Analyst/Charismatic/Decider) while layering subtle dominance cues (conditional phrasing, strategic pauses implied through punctuation).

// Critical Constraints:

// Zero speculative offers: All value propositions must derive directly from pre-approved battle cards.

// Steel-manned neutrality: Responses must pass adversarial testing—no overt pressure tactics detectable by a hostile procurement team.

// 4D Chess: Each option must function as both a standalone move and a setup for 3 future plays (e.g., up-sell triggers, reference seeding, escalation ladders).

// Output Protocol:

// ONLY 3 OPTIONS as standalone lines of exact dialogue the salesperson can utter, followed by an analysis score.

// NO STRATEGY TAGS, explanations, or formatting beyond numbered options.

// Mirror the client's last sentence structure (question→question, statement→statement).

// 17-23 words per option—short enough to feel spontaneous, long enough to contain layered intent.

// Example of valid output:

// 'Let's benchmark your last project's resale uplift—was the maintenance clause a factor? analysis_score: 0.91'

// 'Competitor quotes often exclude monsoon-proofing—should we pressure-test their specs? analysis_score: 0.82'

// 'If we align terms by Friday, could your CFO review next week? analysis_score: 0.73'

// Example of what NOT to do:
// '[Option 1] Let's benchmark... → [strategy labels]`

//   try {
//     const response = await axios.post(
//       endpoint,
//       {
//         model: "deepseek-chat", // Replace with the correct model name
//         messages: [
//           { role: "system", content: systemPrompt },
//           { role: "user", content: JSON.stringify(messages) },
//         ],
//         temperature: 0.7, // Adjust for creativity vs. determinism
//         max_tokens: 150, // Limit response length
//       },
//       {
//         headers: {
//           'Authorization': `Bearer ${apiKey}`,
//           'Content-Type': 'application/json',
//         },
//       }
//     );
//     console.log(response.data.choices[0].message.content);
//     return response.data.choices[0].message.content;
//   } catch (error) {
//     console.error('Error querying Deepseek API:', error.response ? error.response.data : error.message);
//     throw error;
//   }
// }

// Socket.io connection
io.on('connection', (socket) => {
  console.log('A user connected from IP:', socket.handshake.address);

  socket.on('chat-message', async (userMessage) => {  
    console.log('Message received from client:', userMessage); // Log the received message
    
    // Log the goal and context if they exist in the new format
    if (userMessage && typeof userMessage === 'object') {
      if (userMessage.goal) {
        console.log('Goal received:', userMessage.goal);
      }
      
      if (userMessage.projectContext) {
        console.log('Project context received:', userMessage.projectContext);
      }
      
      if (userMessage.companyContext) {
        console.log('Company context received:', userMessage.companyContext);
      }
    }
    
    socket.emit('loading'); // Emit loading event

    try {
      console.log('Querying Groq API...');
      const chatbotResponse = await queryGroqChatbot(userMessage);
      console.log('Groq API response received, length:', chatbotResponse?.length || 0);
      console.log('Response preview:', chatbotResponse?.substring(0, 200) + '...');
      
      console.log('Parsing options from response...');
      const parsedOptions = await parseOptions(chatbotResponse); // Parse the response
      
      console.log('Sending parsed options to client, count:', parsedOptions?.length || 0);
      socket.emit('parsedoptions', parsedOptions);
      
      // Send an additional event to confirm options were sent
      socket.emit('debug-info', { 
        message: 'Parsed options were sent to client', 
        optionsCount: parsedOptions?.length || 0,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error processing chat message:', error);
      socket.emit('chat-error', { 
        error: 'Failed to get a response from the chatbot', 
        details: error.message,
        timestamp: new Date().toISOString()
      });
    } finally {
      socket.emit('loaded'); // Emit loaded event
    }
  });

  socket.on('disconnect', () => {
    console.log('User disconnected');
  });
});

// Start server
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});