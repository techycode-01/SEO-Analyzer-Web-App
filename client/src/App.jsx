// === client/src/App.jsx ===
import { useState } from 'react';
import axios from 'axios';
import './App.css';

// Get API URL from environment variables
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

function App() {
  // Store text input from user
  const [text, setText] = useState('');
  // Store analysis results
  const [analysis, setAnalysis] = useState(null);
  // Track if we are loading data
  const [loading, setLoading] = useState(false);
  // Store any error messages
  const [error, setError] = useState('');

  // This function sends text to server and gets analysis back
  const analyzeText = async () => {
    // Don't analyze empty text
    if (!text.trim()) {
      setError('Please enter some text to analyze');
      return;
    }

    // Show loading state
    setLoading(true);
    // Clear any old errors
    setError('');

    try {
      // Send text to server for analysis
      const res = await axios.post(`${API_URL}/analyze`, { text });
      // Save the analysis results
      setAnalysis(res.data);
    } catch (error) {
      // Show error message if something goes wrong
      setError('Failed to analyze text. Please try again.');
      console.error('Error analyzing text:', error);
    } finally {
      // Hide loading state when done
      setLoading(false);
    }
  };

  // This function adds a keyword into the text
  const insertKeyword = async (keyword) => {
    // Show loading state
    setLoading(true);
    try {
      // Ask server to insert the keyword
      const res = await axios.post(`${API_URL}/insert-keyword`, { text, keyword });
      // Update the text with the keyword added
      setText(res.data.updatedText);
      
      // Get fresh analysis of the new text
      const newAnalysis = await axios.post('http://localhost:5000/analyze', { 
        text: res.data.updatedText 
      });
      setAnalysis(newAnalysis.data);
    } catch (error) {
      // Show error if keyword insertion fails
      setError('Failed to insert keyword. Please try again.');
      console.error('Error inserting keyword:', error);
    } finally {
      // Hide loading state when done
      setLoading(false);
    }
  };

  return (
    <div className="container">
      {/* Page header */}
      <header className="header">
        <h1>SEO Analyzer</h1>
        <p className="subtitle">Optimize your content with AI-powered suggestions</p>
      </header>

      <main className="main-content">
        {/* Text input section */}
        <section className="input-section">
          <textarea
            rows="8"
            className="text-input"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Enter your blog, caption, or tweet here..."
            disabled={loading}
          ></textarea>
          <button 
            className={`analyze-button ${loading ? 'loading' : ''}`} 
            onClick={analyzeText}
            disabled={loading}
          >
            {loading ? 'Analyzing...' : 'Analyze Text'}
          </button>
          {/* Show error message if there is one */}
          {error && <div className="error-message">{error}</div>}
        </section>

        {/* Show results only after analysis is done */}
        {analysis && (
          <section className="results-section">
            {/* Readability and stats cards */}
            <div className="metrics">
              <h2>SEO Analysis Results</h2>
              <div className="metrics-grid">
                {/* Readability score card */}
                <div className="metric-card">
                  <h3>Readability Score</h3>
                  <p className={`readability-score ${analysis.readability.toLowerCase()}`}>
                    {analysis.readability}
                  </p>
                </div>
                {/* Content statistics card */}
                <div className="metric-card">
                  <h3>Content Stats</h3>
                  <ul className="stats-list">
                    <li>Words: {analysis.stats.wordCount}</li>
                    <li>Sentences: {analysis.stats.sentenceCount}</li>
                    <li>Characters: {analysis.stats.characterCount}</li>
                  </ul>
                </div>
              </div>
            </div>

            {/* Keywords section */}
            <div className="keywords-section">
              <h2>Recommended Keywords</h2>
              <div className="keywords-grid">
                {/* Show each keyword with its stats */}
                {analysis.keywordAnalysis && analysis.keywordAnalysis.map((kw, i) => (
                  <div key={i} className="keyword-card">
                    <div className="keyword-info">
                      <span className="keyword-text">{kw.keyword}</span>
                      <span className="keyword-meta">Type: {kw.type}</span>
                      <span className="keyword-stats">
                        Density: {kw.density}% ({kw.count} occurrences)
                      </span>
                      <span className="keyword-relevance">
                        Relevance: {(kw.relevance * 100).toFixed(1)}%
                      </span>
                    </div>
                    <button
                      className="insert-button"
                      onClick={() => insertKeyword(kw.keyword)}
                      disabled={loading}
                    >
                      {loading ? '...' : 'Insert'}
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* SEO suggestions section */}
            <div className="suggestions-section">
              <h2>SEO Suggestions</h2>
              <ul className="suggestions-list">
                {analysis.suggestions.map((suggestion, i) => (
                  <li key={i} className="suggestion-item">
                    {suggestion}
                  </li>
                ))}
              </ul>
            </div>

            {/* Preview of the analyzed text */}
            <div className="preview-section">
              <h2>Content Preview</h2>
              <div className="preview-content">
                {text}
              </div>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

export default App;