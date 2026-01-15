/**
 * API Client for Hacker News Analysis Backend
 */
class HackerNewsAnalysisAPI {
    constructor(baseURL = 'http://localhost:8000/api/v1') {
        this.baseURL = baseURL;
    }

    /**
     * Helper method for making API requests
     */
    async request(endpoint, options = {}) {
        const url = `${this.baseURL}${endpoint}`;
        const defaultOptions = {
            headers: {
                'Content-Type': 'application/json',
            }
        };

        const config = { ...defaultOptions, ...options };

        try {
            const response = await fetch(url, config);
            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.detail || `HTTP error! status: ${response.status}`);
            }

            return data;
        } catch (error) {
            console.error(`API Error (${endpoint}):`, error);
            throw error;
        }
    }

    /**
     * Search for Hacker News stories on a topic (with article content)
     * @param {string} query - Search query
     * @param {string} section - Section identifier (top or bottom)
     * @param {number} limit - Number of stories to fetch (default 100)
     * @param {number} days - Lookback window in days (default 5)
     * @returns {Promise} Search response with stories, content, and stats
     */
    async searchHackerNews(query, section, limit = 100, days = 5) {
        return this.request('/hackernews/search_with_content', {
            method: 'POST',
            body: JSON.stringify({ query, section, limit, days })
        });
    }

    /**
     * Get statistics for a search
     * @param {string} searchId - Search ID
     * @returns {Promise} Statistics
     */
    async getStats(searchId) {
        return this.request(`/hackernews/stats/${searchId}`, {
            method: 'GET'
        });
    }

    /**
     * Generate embeddings for stories
     * @param {string} searchId - Search ID
     * @returns {Promise} Embedding response
     */
    async generateEmbeddings(searchId) {
        return this.request('/analysis/embed', {
            method: 'POST',
            body: JSON.stringify({ search_id: searchId })
        });
    }

    /**
     * Cluster stories using UMAP and clustering algorithm
     * @param {string} searchId - Search ID
     * @param {string} algorithm - Clustering algorithm (only kmeans is supported)
     * @param {number} nClusters - Number of clusters (auto-determined if not provided)
     * @returns {Promise} Cluster response with visualization data
     */
    async clusterStories(searchId, algorithm = 'kmeans', nClusters = null) {
        const body = { search_id: searchId, algorithm };
        if (nClusters !== null) {
            body.n_clusters = nClusters;
        }

        return this.request('/analysis/cluster', {
            method: 'POST',
            body: JSON.stringify(body)
        });
    }

    /**
     * Get LLM-generated summary for a cluster
     * @param {string} searchId - Search ID
     * @param {number} clusterId - Cluster ID
     * @param {Array<string>} storyIds - Array of story IDs in the cluster
     * @returns {Promise} Summary response with title and summary
     */
    async getSummary(searchId, clusterId, storyIds) {
        return this.request('/analysis/summarize', {
            method: 'POST',
            body: JSON.stringify({
                search_id: searchId,
                cluster_id: clusterId,
                story_ids: storyIds
            })
        });
    }

    /**
     * Perform complete analysis pipeline
     * @param {string} searchId - Search ID
     * @param {string} algorithm - Clustering algorithm (only kmeans is supported)
     * @param {number} nClusters - Number of clusters (optional, auto-determined if not provided)
     * @returns {Promise} Cluster visualization data
     */
    async analyzeComplete(searchId, algorithm = 'kmeans', nClusters = null) {
        // Step 1: Generate embeddings
        console.log('Generating embeddings...');
        await this.generateEmbeddings(searchId);

        // Step 2: Cluster stories
        console.log('Clustering stories...');
        const clusterResponse = await this.clusterStories(searchId, algorithm, nClusters);

        if (!clusterResponse.success) {
            throw new Error(clusterResponse.message);
        }

        return clusterResponse.visualization_data;
    }
}

// Create global API instance
const api = new HackerNewsAnalysisAPI();
