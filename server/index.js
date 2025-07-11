// === server/index.js ===

const express = require("express");
const cors = require("cors");
const axios = require("axios");
require("dotenv").config();

// Create the server app
const app = express();

// Allow requests from the frontend
app.use(cors());

// Accept JSON data up to 50MB
app.use(express.json({ limit: '50mb' }));

// TextRazor API configuration
const TEXTRAZOR_API_KEY = process.env.TEXTRAZOR_API_KEY;
const TEXTRAZOR_URL = 'https://api.textrazor.com/';

// Function to extract keywords without TextRazor
function extractKeywordsLocally(text) {
  // Split text into words and remove empty ones
  const words = text.toLowerCase().split(/[\s,.!?;:()"']+/).filter(word => word.length > 0);
  
  // List of common words to ignore
  const stopWords = new Set(['the', 'be', 'to', 'of', 'and', 'a', 'in', 'that', 'have', 'i', 'it', 'for', 'not', 'on', 'with', 'he', 'as', 'you', 'do', 'at', 'this', 'but', 'his', 'by', 'from', 'they', 'we', 'say', 'her', 'she', 'or', 'an', 'will', 'my', 'one', 'all', 'would', 'there', 'their', 'what', 'so', 'up', 'out', 'if', 'about', 'who', 'get', 'which', 'go', 'me', 'when', 'make', 'can', 'like', 'time', 'no', 'just', 'him', 'know', 'take', 'people', 'into', 'year', 'your', 'good', 'some', 'could', 'them', 'see', 'other', 'than', 'then', 'now', 'look', 'only', 'come', 'its', 'over', 'think', 'also', 'back', 'after', 'use', 'two', 'how', 'our', 'work', 'first', 'well', 'way', 'even', 'new', 'want', 'because', 'any', 'these', 'give', 'day', 'most', 'us', 'was', 'is', 'are', 'were', 'been', 'has', 'had', 'said']);
  
  // Count how many times each word appears
  const wordFreq = {};
  words.forEach(word => {
    // Only count words longer than 2 letters that aren't in our ignore list
    if (word.length > 2 && !stopWords.has(word)) {
      wordFreq[word] = (wordFreq[word] || 0) + 1;
    }
  });
  
  // Sort words by how often they appear and take the top 10
  return Object.entries(wordFreq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([word, count]) => ({
      keyword: word,
      count: count,
      density: ((count / words.length) * 100).toFixed(2),
      type: 'Word',
      relevance: count / words.length
    }));
}

// Function to analyze text using TextRazor
async function analyzeWithTextRazor(text) {
  try {
    console.log('Attempting TextRazor analysis...');
    
    if (!TEXTRAZOR_API_KEY) {
      console.log('No TextRazor API key found, using local analysis');
      throw new Error('TextRazor API key not configured');
    }

    const response = await axios.post(TEXTRAZOR_URL, 
      `text=${encodeURIComponent(text)}`,
      {
        headers: {
          'x-textrazor-key': TEXTRAZOR_API_KEY,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        params: {
          extractors: 'entities,phrases,words',
          classifiers: 'textrazor_newscodes'
        }
      }
    );

    console.log('TextRazor API response received');
    
    // Process TextRazor response
    const data = response.data;
    console.log('TextRazor response data:', JSON.stringify(data, null, 2));

    if (!data.response || (!data.response.entities && !data.response.phrases)) {
      console.log('No entities or phrases found in TextRazor response, using local analysis');
      throw new Error('No keywords found in TextRazor response');
    }

    const entities = data.response.entities || [];
    const phrases = data.response.phrases || [];
    
    // Create a map to store keyword information
    const keywordMap = new Map();

    // Process entities (like names, organizations, locations)
    entities.forEach(entity => {
      if (entity.relevanceScore > 0.2) { // Only consider relevant entities
        const keyword = entity.matchedText.toLowerCase();
        if (!keywordMap.has(keyword)) {
          keywordMap.set(keyword, {
            keyword: entity.matchedText,
            count: 1,
            relevance: entity.relevanceScore,
            type: entity.type ? entity.type[0] : 'Unknown'
          });
        } else {
          const existing = keywordMap.get(keyword);
          existing.count += 1;
        }
      }
    });

    // Process phrases to find important multi-word expressions
    phrases.forEach(phrase => {
      if (phrase.words.length > 1) { // Only consider multi-word phrases
        const keyword = phrase.words.map(w => w.token).join(' ').toLowerCase();
        if (!keywordMap.has(keyword)) {
          keywordMap.set(keyword, {
            keyword: phrase.words.map(w => w.token).join(' '),
            count: 1,
            relevance: 0.5,
            type: 'Phrase'
          });
        }
      }
    });

    // Calculate basic stats
    const words = text.split(/\s+/).filter(Boolean);
    const sentences = text.split(/[.!?]+/).filter(Boolean);
    
    let keywordAnalysis = Array.from(keywordMap.values())
      .map(item => ({
        ...item,
        density: ((item.count / words.length) * 100).toFixed(2)
      }))
      .sort((a, b) => b.relevance - a.relevance)
      .slice(0, 10);

    // If no keywords found, fall back to local analysis
    if (keywordAnalysis.length === 0) {
      console.log('No keywords found in TextRazor analysis, using local analysis');
      keywordAnalysis = extractKeywordsLocally(text);
    }

    // Generate suggestions based on analysis
    const suggestions = [];
    if (keywordAnalysis.length < 3) {
      suggestions.push("Consider adding more topic-specific keywords");
    }
    if (words.length < 300) {
      suggestions.push("Content might be too short for good SEO");
    } else if (words.length > 2500) {
      suggestions.push("Consider breaking this long content into multiple pages");
    }

    // Check keyword density
    const highDensityKeywords = keywordAnalysis.filter(k => parseFloat(k.density) > 5);
    if (highDensityKeywords.length > 0) {
      suggestions.push("Some keywords appear too frequently. Consider reducing their usage to avoid keyword stuffing.");
    }

    console.log('Analysis completed with', keywordAnalysis.length, 'keywords found');

    return {
      readability: calculateReadability(text),
      stats: {
        wordCount: words.length,
        sentenceCount: sentences.length,
        characterCount: text.length,
      },
      keywordAnalysis,
      suggestions
    };
  } catch (error) {
    console.error('TextRazor API Error:', error.response?.data || error.message);
    console.log('Falling back to local keyword analysis');
    
    // Calculate basic stats
    const words = text.split(/\s+/).filter(Boolean);
    const sentences = text.split(/[.!?]+/).filter(Boolean);
    
    // Use local keyword extraction as fallback
    const keywordAnalysis = extractKeywordsLocally(text);

    return {
      readability: calculateReadability(text),
      stats: {
        wordCount: words.length,
        sentenceCount: sentences.length,
        characterCount: text.length,
      },
      keywordAnalysis,
      suggestions: [
        keywordAnalysis.length < 3 ? "Consider adding more relevant keywords" : "Good keyword distribution",
        words.length < 300 ? "Content might be too short for good SEO" : "Content length is good",
      ]
    };
  }
}

// This function checks how easy the text is to read
function calculateReadability(text) {
  // Split text into sentences and words
  const sentences = text.split(/[.!?]+/).filter(Boolean);
  const words = text.split(/\s+/).filter(Boolean);
  
  // Count syllables in all words
  const syllables = words.reduce((count, word) => {
    return count + countSyllables(word);
  }, 0);

  // Calculate Flesch Reading Ease score
  const avgSentenceLength = words.length / sentences.length;
  const avgSyllablesPerWord = syllables / words.length;
  const fleschScore = 206.835 - (1.015 * avgSentenceLength) - (84.6 * avgSyllablesPerWord);

  // Return easy, medium, or hard based on the score
  if (fleschScore > 80) return "Easy";
  if (fleschScore > 60) return "Medium";
  return "Hard";
}

// This function counts how many syllables are in a word
function countSyllables(word) {
  word = word.toLowerCase();
  // Short words have 1 syllable
  if (word.length <= 3) return 1;
  
  // Remove silent e's at the end
  word = word.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '');
  word = word.replace(/^y/, '');
  
  // Count groups of vowels (each group is a syllable)
  const syllableCount = word.match(/[aeiouy]{1,2}/g);
  return syllableCount ? syllableCount.length : 1;
}

// Check if server is running
app.get('/', (req, res) => {
  res.send('SEO Analyzer Backend is running.');
});

// Handle text analysis requests
app.post("/analyze", async (req, res) => {
  const { text } = req.body;

  // Make sure we got some text to analyze
  if (!text || text.trim().length === 0) {
    return res.status(400).json({ error: "Text is required" });
  }

  try {
    // Use TextRazor API for analysis
    const analysis = await analyzeWithTextRazor(text);
    res.json(analysis);
  } catch (err) {
    console.error("Analysis error:", err);
    res.status(500).json({ 
      error: "Failed to analyze text",
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

// Handle keyword insertion requests
app.post("/insert-keyword", (req, res) => {
  const { text, keyword } = req.body;

  // Make sure we got both text and keyword
  if (!text || !keyword) {
    return res.status(400).json({ error: "Text and keyword are required" });
  }

  try {
    // Split text into sentences
    const sentences = text.split(/([.!?]+)/).filter(Boolean);
    // Pick the middle sentence
    const targetSentenceIndex = Math.floor(sentences.length / 2);
    
    // Split the chosen sentence into words
    const words = sentences[targetSentenceIndex].split(/\s+/);
    // Find the middle of the sentence
    const insertPosition = Math.floor(words.length / 2);
    
    // Add the keyword in the middle
    words.splice(insertPosition, 0, keyword);
    sentences[targetSentenceIndex] = words.join(' ');
    
    // Put all sentences back together
    const updatedText = sentences.join('');
    
    // Send back the new text and where we put the keyword
    res.json({ 
      updatedText,
      insertedAt: {
        sentence: targetSentenceIndex + 1,
        position: insertPosition
      }
    });
  } catch (err) {
    console.error("Keyword insertion error:", err);
    res.status(500).json({ error: "Failed to insert keyword" });
  }
});

// Start the server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
