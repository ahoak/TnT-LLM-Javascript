const { Ollama } = require('ollama');
const BASE_URL_DEFAULT = 'http://127.0.0.1:11434 '; // Ollama server URL

// Stop the Ollama server with:
// sudo systemctl stop ollama

// Start the Ollama server with:
// ollama serve 

async function ollamaLLM(text, jsonSchema, modelParameters = {}) {
  
    try {
        const ollama = new Ollama({ baseURL: BASE_URL_DEFAULT });
        const response = await ollama.chat({
            model: 'gemma3:1b',
            messages: [
                { role: 'user', content: text },
            ],
            format:  jsonSchema,
            ...modelParameters,
        });
        console.log("LLM response:", response);
        const output = response.message?.content || '';
        return output;
    } catch (err) {
        console.error('Error in LLM call:', err.message || err);
        return '';
    }
}



module.exports = { ollamaLLM };