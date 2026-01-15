# Hacker News Topic Analysis

A web application for analyzing Hacker News topics using machine learning clustering and AI-powered summaries. The application fetches stories from Hacker News via the Algolia API, embeds them using sentence-transformers, clusters them using UMAP and KMeans, and generates cluster summaries using Azure OpenAI.

## Features

- **Dual Search Interface**: Analyze two different topics simultaneously in a split-screen layout
- **Story Statistics**: View story counts and most upvoted stories for each search
- **ML-Powered Clustering**: Uses sentence-transformers, UMAP, and KMeans for intelligent story clustering
- **Interactive Visualization**: Click on clusters in a 2D scatter plot to explore stories
- **AI Summaries**: LLM-generated titles and summaries for each cluster using Azure OpenAI
- **Real-time Analysis**: Fast processing with in-memory caching
- **No Authentication Required**: Uses public Hacker News Algolia API (no API keys needed)

## Architecture

```
┌─────────────────────────────────────────┐
│  Frontend: HTML + CSS + JavaScript      │
│  - Split-screen UI                      │
│  - Plotly.js visualization              │
└─────────────────────────────────────────┘
              │ REST API
              ▼
┌─────────────────────────────────────────┐
│  Backend: Python FastAPI                │
│  - Hacker News Algolia API Integration  │
│  - Sentence Transformers (embeddings)   │
│  - UMAP + KMeans (clustering)           │
│  - Azure OpenAI (summaries)             │
└─────────────────────────────────────────┘
```

## Prerequisites

- Python 3.9 or higher
- Azure OpenAI API credentials (for cluster summaries)
- Modern web browser
- No Hacker News API credentials needed (uses public Algolia API)

## Installation

### 1. Clone or Navigate to the Project

```bash
cd hackit/twitterit
```

### 2. Set Up Python Environment

```bash
# Create virtual environment
python -m venv venv

# Activate virtual environment
# On Windows:
venv\Scripts\activate
# On macOS/Linux:
source venv/bin/activate
```

### 3. Install Backend Dependencies

```bash
cd backend
pip install -r requirements.txt
```

### 4. Configure Environment Variables

Create a `.env` file in the `backend` directory:

```bash
cp .env.example .env
```

Edit `.env` and add your credentials:

```env
# Hacker News API (no credentials needed - uses public Algolia API)

# Azure OpenAI Credentials
AZURE_OPENAI_ENDPOINT=https://abpatra-7946-resource.openai.azure.com/openai/v1/
AZURE_OPENAI_API_KEY=your_azure_openai_api_key
AZURE_OPENAI_DEPLOYMENT_NAME=gpt-4.1-mini

# Application Settings (optional)
CACHE_SIZE=1000
MAX_TWEETS_PER_SEARCH=1000
EMBEDDING_BATCH_SIZE=32
```

## Getting Azure OpenAI Credentials

1. Go to [Azure Portal](https://portal.azure.com/)
2. Create an Azure OpenAI resource
3. Deploy a model (e.g., gpt-4.1-mini)
4. Copy the endpoint and API key to your `.env` file

## Running the Application

### 1. Start the Backend Server

```bash
cd backend
uvicorn app.main:app --reload --port 8000
```

The backend API will be available at `http://localhost:8000`

You can view the API documentation at:
- Swagger UI: `http://localhost:8000/docs`
- ReDoc: `http://localhost:8000/redoc`

### 2. Start the Frontend Server

Open a new terminal:

```bash
cd frontend
python -m http.server 3000
```

The frontend will be available at `http://localhost:3000`

Alternatively, you can use any static file server or simply open `index.html` in your browser.

## Usage

### 1. Search for Stories

- Enter a topic in either search bar (e.g., "AI", "Rust", "Open Source")
- Click "Search" button
- View story statistics: total count and most upvoted story

### 2. Analyze Stories

- Click the "Analyse" button after searching
- Wait for the ML pipeline to complete:
  - Generating embeddings (sentence-transformers)
  - Reducing dimensions (UMAP)
  - Clustering stories (KMeans)
- View the interactive cluster visualization

### 3. Explore Clusters

- Click on any point in the scatter plot
- View AI-generated cluster title and summary
- Browse all stories in the cluster
- Close the modal to explore other clusters

### 4. Compare Topics

- Use the split-screen interface to analyze two topics
- Each section operates independently
- Compare clustering patterns across different topics

## API Endpoints

### Hacker News Endpoints

- `POST /api/v1/twitter/search` - Search for Hacker News stories
- `GET /api/v1/twitter/stats/{search_id}` - Get story statistics

### Analysis Endpoints

- `POST /api/v1/analysis/embed` - Generate embeddings
- `POST /api/v1/analysis/cluster` - Perform clustering
- `POST /api/v1/analysis/summarize` - Generate cluster summary

### Health Check

- `GET /health` - Check API health

## Technology Stack

### Backend
- **FastAPI**: Modern Python web framework
- **httpx**: Async HTTP client for Hacker News Algolia API
- **sentence-transformers**: Text embeddings (all-MiniLM-L6-v2)
- **UMAP**: Dimensionality reduction
- **KMeans**: K-means clustering from scikit-learn
- **Azure OpenAI**: LLM summaries
- **Pydantic**: Data validation

### Frontend
- **HTML5/CSS3**: User interface
- **Vanilla JavaScript**: Application logic
- **Plotly.js**: Interactive visualizations

## Project Structure

```
hackit/twitterit/
├── backend/
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py                 # FastAPI application
│   │   ├── config.py               # Configuration
│   │   ├── models.py               # Data models
│   │   ├── routers/
│   │   │   ├── twitter.py          # Hacker News endpoints (kept name for compatibility)
│   │   │   └── analysis.py         # Analysis endpoints
│   │   └── services/
│   │       ├── hackernews_service.py  # Hacker News API
│   │       ├── embedding_service.py# Embeddings
│   │       ├── clustering_service.py# Clustering
│   │       └── llm_service.py      # Azure OpenAI
│   ├── requirements.txt
│   ├── .env.example
│   └── .env                        # Your credentials
├── frontend/
│   ├── index.html                  # Main page
│   ├── css/
│   │   └── styles.css              # Styling
│   └── js/
│       ├── api.js                  # API client
│       ├── visualization.js        # Plotly charts
│       └── app.js                  # Main logic
└── README.md
```

## Troubleshooting

### Backend Issues

**Error: Hacker News API request failed**
- Check your internet connection
- Verify the Algolia API is accessible
- Check for rate limiting (unlikely but possible)

**Error: Module not found**
- Ensure virtual environment is activated
- Run `pip install -r requirements.txt` again

**Error: Port already in use**
- Change the port: `uvicorn app.main:app --port 8001`

### Frontend Issues

**Error: CORS policy blocking requests**
- Ensure backend is running on `http://localhost:8000`
- Check CORS configuration in `backend/app/config.py`

**Error: API requests failing**
- Verify backend URL in `frontend/js/api.js`
- Check browser console for detailed errors

### Model Loading Issues

**Slow first request**
- The sentence-transformers model downloads on first use
- Subsequent requests will be faster

**Out of memory**
- Reduce `EMBEDDING_BATCH_SIZE` in `.env`
- Limit `MAX_TWEETS_PER_SEARCH`

## Performance Optimization

- **Caching**: Embeddings are cached in memory
- **Batch Processing**: Tweets are embedded in batches
- **Rate Limiting**: Twitter API rate limits are respected
- **Async Processing**: FastAPI handles requests asynchronously

## Limitations

- Hacker News search limited to last 5 days by default (configurable)
- KMeans requires minimum 2 stories for clustering (optimal results with 5+ stories)
- Azure OpenAI costs apply per API call
- Algolia API has rate limits but they're quite generous for normal use

## Future Enhancements

- [ ] Save analysis results to database
- [ ] Export cluster data to CSV/JSON
- [ ] Support for more clustering algorithms (DBSCAN, Agglomerative Clustering)
- [ ] Sentiment analysis for each cluster
- [ ] Time-series analysis of topics
- [ ] User authentication and saved searches

## License

This project is for educational and research purposes.

## Credits

- **sentence-transformers**: Reimers & Gurevych, 2019
- **UMAP**: McInnes et al., 2018
- **KMeans**: Lloyd's algorithm (scikit-learn implementation)
- **Plotly**: Open-source visualization library

## Support

For issues or questions:
1. Check the troubleshooting section
2. Review API documentation at `http://localhost:8000/docs`
3. Check Hacker News Algolia API status: https://hn.algolia.com/api
