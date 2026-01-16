/**
 * Main Application Logic
 */
class HackerNewsAnalysisApp {
    constructor() {
        this.searchData = {
            top: null,
            bottom: null
        };
        this.currentPage = 'main';
        this.initializeEventListeners();
    }

    /**
     * Initialize all event listeners
     */
    initializeEventListeners() {
        // Navigation tabs
        document.getElementById('nav-main').addEventListener('click', () => {
            this.switchPage('main');
        });
        document.getElementById('nav-cluster').addEventListener('click', () => {
            this.switchPage('cluster');
        });
        document.getElementById('nav-knowledge').addEventListener('click', () => {
            this.switchPageToKnowledgeGraph();
        });

        // Compare button (Main page)
        document.getElementById('compare-btn').addEventListener('click', () => {
            this.handleCompare();
        });

        // Generate button (Cluster Analysis page)
        document.getElementById('generate-btn').addEventListener('click', () => {
            this.handleGenerate();
        });

        // Back to compare button
        const backBtn = document.getElementById('back-to-compare');
        if (backBtn) {
            backBtn.addEventListener('click', () => {
                this.switchPage('main');
            });
        }

        // Allow Enter key to trigger compare on main page
        document.getElementById('search-top').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                document.getElementById('compare-btn').click();
            }
        });
        document.getElementById('search-bottom').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                document.getElementById('compare-btn').click();
            }
        });
    }

    /**
     * Switch between pages
     * @param {string} page - Page identifier ('main' or 'cluster')
     */
    switchPage(page) {
        this.currentPage = page;

        // Update navigation tabs
        document.querySelectorAll('.nav-link').forEach(tab => {
            tab.classList.remove('active');
        });
        document.getElementById(`nav-${page}`).classList.add('active');

        // Update page content visibility
        document.querySelectorAll('.page-content').forEach(content => {
            content.classList.remove('active');
        });
        document.getElementById(`page-${page}`).classList.add('active');

        // Update topic display on cluster page
        if (page === 'cluster') {
            this.updateTopicDisplay();
        }
    }

    /**
     * Update topic display on cluster analysis page
     */
    updateTopicDisplay() {
        const topic1El = document.getElementById('topic-1-display');
        const topic2El = document.getElementById('topic-2-display');
        const legendTopEl = document.getElementById('legend-top');
        const legendBottomEl = document.getElementById('legend-bottom');
        const toggle1El = document.getElementById('topic-toggle-1');
        const toggle2El = document.getElementById('topic-toggle-2');
        const searchTop = document.getElementById('search-top').value.trim();
        const searchBottom = document.getElementById('search-bottom').value.trim();

        topic1El.textContent = searchTop || 'Topic A';
        topic2El.textContent = searchBottom || 'Topic B';

        // Update legend labels
        if (legendTopEl) legendTopEl.textContent = searchTop || 'Topic A';
        if (legendBottomEl) legendBottomEl.textContent = searchBottom || 'Topic B';

        // Update toggle button labels
        if (toggle1El) toggle1El.textContent = searchTop || 'Topic A';
        if (toggle2El) toggle2El.textContent = searchBottom || 'Topic B';

        // Show/hide topics row and no-topics message
        const topicsRow = document.getElementById('topics-row');
        const noTopics = document.getElementById('no-topics');

        // Enable/disable generate button based on whether both searches are done
        const generateBtn = document.getElementById('generate-btn');
        if (this.searchData.top && this.searchData.bottom) {
            generateBtn.disabled = false;
            if (topicsRow) topicsRow.style.display = 'flex';
            if (noTopics) noTopics.style.display = 'none';
        } else {
            generateBtn.disabled = true;
            if (!searchTop && !searchBottom) {
                if (topicsRow) topicsRow.style.display = 'none';
                if (noTopics) noTopics.style.display = 'block';
            }
        }
    }

    /**
     * Handle compare button click - search both topics
     */
    async handleCompare() {
        const queryTop = document.getElementById('search-top').value.trim();
        const queryBottom = document.getElementById('search-bottom').value.trim();

        if (!queryTop || !queryBottom) {
            alert('Please enter both topics to compare');
            return;
        }

        const compareBtn = document.getElementById('compare-btn');
        compareBtn.disabled = true;
        compareBtn.textContent = 'Comparing...';

        try {
            // Search both topics in parallel
            const [topResult, bottomResult] = await Promise.all([
                this.handleSearch('top', queryTop),
                this.handleSearch('bottom', queryBottom)
            ]);

            // Both searches completed successfully
            // User can manually navigate to Cluster Analysis page when ready

            // Hide compare button after successful comparison
            compareBtn.style.display = 'none';

        } catch (error) {
            console.error('Compare error:', error);
            alert(`Error comparing topics: ${error.message}`);
            compareBtn.disabled = false;
            compareBtn.textContent = 'Compare';
        }
    }

    /**
     * Handle generate button click - generate clusters for both topics
     */
    async handleGenerate() {
        if (!this.searchData.top || !this.searchData.bottom) {
            alert('Please compare topics first on the Main page');
            this.switchPage('main');
            return;
        }

        const generateBtn = document.getElementById('generate-btn');
        const loadingEl = document.getElementById('loading-generate');

        generateBtn.disabled = true;
        loadingEl.style.display = 'flex';

        try {
            // Generate clusters for both topics in parallel
            const [topViz, bottomViz] = await Promise.all([
                api.analyzeComplete(this.searchData.top.search_id, 'kmeans'),
                api.analyzeComplete(this.searchData.bottom.search_id, 'kmeans')
            ]);

            // Create visualizations for both topics
            vizManager.createClusterVisualization(topViz, this.searchData.top.search_id, 'top');
            vizManager.createClusterVisualization(bottomViz, this.searchData.bottom.search_id, 'bottom');

            // Store flag that clusters are ready for knowledge graph
            sessionStorage.setItem('clustersGenerated', 'true');

            // Show visualization section
            document.getElementById('visualization-section').style.display = 'block';

            // Hide generate button after successful generation
            generateBtn.style.display = 'none';

            // Scroll to visualization
            document.getElementById('visualization-section').scrollIntoView({
                behavior: 'smooth'
            });

        } catch (error) {
            console.error('Generate error:', error);
            alert(`Error generating clusters: ${error.message}`);
        } finally {
            generateBtn.disabled = false;
            loadingEl.style.display = 'none';
        }
    }

    /**
     * Handle search for a topic
     * @param {string} section - Section identifier (top or bottom)
     * @param {string} query - Optional query string (if not provided, reads from input)
     * @returns {Promise} Search response
     */
    async handleSearch(section, query = null) {
        if (!query) {
            const searchInput = document.getElementById(`search-${section}`);
            query = searchInput.value.trim();
        }

        if (!query) {
            throw new Error('Please enter a search topic');
        }

        // Show loading state
        this.setLoadingState(section, true);

        try {
            // Call search API
            const response = await api.searchHackerNews(query, section);

            // Validate stories before storing search data to avoid caching empty/invalid results
            const stories = response.stories || [];
            if (!stories.length) {
                this.searchData[section] = null;
                this.updateTopicDisplay();
                throw new Error('No stories found for this topic. Try a different search term.');
            }

            // Store validated search data
            this.searchData[section] = response;

            // Display stats with stories
            this.displayStats(section, response.stats, stories, query);

            // Update topic display to toggle generate button state
            this.updateTopicDisplay();

            return response;

        } catch (error) {
            console.error('Search error:', error);
            // Clear cached search data on failure so clustering can't run with stale IDs
            this.searchData[section] = null;
            this.updateTopicDisplay();
            throw error;
        } finally {
            this.setLoadingState(section, false);
        }
    }


    /**
     * Display story statistics
     * @param {string} section - Section identifier
     * @param {Object} stats - Statistics object
     * @param {Array} stories - Array of story objects
     * @param {string} topicName - Name of the topic
     */
    displayStats(section, stats, stories = [], topicName = '') {
        // Update topic name in header
        const nameEl = document.getElementById(`name-${section}`);
        if (nameEl) nameEl.textContent = topicName || `Topic ${section === 'top' ? 'A' : 'B'}`;

        // Update article count in header
        const countEl = document.getElementById(`count-${section}`);
        if (countEl) countEl.textContent = `${stats.count} articles`;

        // Calculate stats
        const totalReactions = stories.reduce((sum, story) => {
            const score = story.score || story.likes || 0;
            return sum + score;
        }, 0);

        const avgPoints = stories.length > 0 ? Math.round(totalReactions / stories.length) : 0;

        // Update stats section
        const statsContainer = document.getElementById(`stats-${section}`);
        const avgPointsEl = document.getElementById(`avg-points-${section}`);
        const totalReactionsEl = document.getElementById(`total-reactions-${section}`);

        if (avgPointsEl) avgPointsEl.textContent = avgPoints;
        if (totalReactionsEl) totalReactionsEl.textContent = totalReactions.toLocaleString();
        if (statsContainer) statsContainer.style.display = 'flex';

        // Support both most_liked (old) and most_upvoted (new) fields
        const mostPopular = stats.most_upvoted || stats.most_liked;
        const topArticleSection = document.getElementById(`top-article-${section}`);
        const mostLikedEl = document.getElementById(`most-liked-${section}`);
        const likesEl = document.getElementById(`likes-${section}`);
        const topArticleLinkEl = document.getElementById(`top-article-link-${section}`);

        if (mostPopular && topArticleSection) {
            const text = mostPopular.title || mostPopular.text;
            if (mostLikedEl) mostLikedEl.textContent = this.truncateText(text, 150);
            const score = mostPopular.score || mostPopular.likes || 0;
            const comments = mostPopular.num_comments || mostPopular.comments || 0;
            if (likesEl) likesEl.textContent = `${score} pts · ${comments} comments`;

            // Show link to article
            const articleUrl = mostPopular.url || mostPopular.hn_url;
            if (articleUrl && topArticleLinkEl) {
                topArticleLinkEl.href = articleUrl;
                topArticleLinkEl.style.display = 'inline-block';
            } else if (topArticleLinkEl) {
                topArticleLinkEl.style.display = 'none';
            }

            topArticleSection.style.display = 'block';
        } else if (topArticleSection) {
            topArticleSection.style.display = 'none';
        }

        // Display top articles if stories are available
        if (stories && stories.length > 0) {
            this.displayTopArticles(section, stories);
        }
    }

    /**
     * Display top articles by reaction count
     * @param {string} section - Section identifier
     * @param {Array} stories - Array of story objects
     */
    displayTopArticles(section, stories) {
        // Sort stories by score (reaction count) in descending order
        const sortedStories = [...stories].sort((a, b) => {
            const scoreA = a.score || a.likes || 0;
            const scoreB = b.score || b.likes || 0;
            return scoreB - scoreA;
        });

        // Get top 5 (skip first one since it's shown as "top article")
        const top5 = sortedStories.slice(1, 6);

        const topArticlesList = document.getElementById(`top-articles-list-${section}`);

        if (!topArticlesList) return;

        // Clear previous content
        topArticlesList.innerHTML = '';

        if (top5.length === 0) {
            return;
        }

        // Create article items
        top5.forEach((story, index) => {
            const articleDiv = document.createElement('div');
            articleDiv.className = 'article-item';

            const title = story.title || story.text || 'Untitled';
            const score = story.score || story.likes || 0;
            const comments = story.num_comments || story.comments || 0;
            const articleUrl = story.url || story.hn_url || '#';

            articleDiv.innerHTML = `
                <div class="article-rank">${index + 2}</div>
                <div class="article-content">
                    <a href="${articleUrl}" target="_blank" class="article-title">${this.escapeHtml(title)}</a>
                    <div class="article-meta">${score} pts · ${comments} comments</div>
                </div>
            `;

            topArticlesList.appendChild(articleDiv);
        });
    }

    /**
     * Escape HTML to prevent XSS
     * @param {string} text - Text to escape
     * @returns {string} Escaped text
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * Set loading state for a section
     * @param {string} section - Section identifier
     * @param {boolean} loading - Whether to show loading state
     */
    setLoadingState(section, loading) {
        const loadingEl = document.getElementById(`loading-${section}`);
        const searchInput = document.getElementById(`search-${section}`);

        if (loading) {
            if (loadingEl) loadingEl.style.display = 'flex';
            if (searchInput) searchInput.disabled = true;
        } else {
            if (loadingEl) loadingEl.style.display = 'none';
            if (searchInput) searchInput.disabled = false;
        }
    }

    /**
     * Switch to knowledge graph page and pass search IDs
     */
    switchPageToKnowledgeGraph() {
        // Store search IDs in sessionStorage so knowledge graph page can retrieve them
        const searchIds = {
            top: this.searchData.top?.search_id || null,
            bottom: this.searchData.bottom?.search_id || null
        };
        sessionStorage.setItem('currentSearchIds', JSON.stringify(searchIds));
        
        // Navigate to knowledge graph page
        window.location.href = 'knowledge-graph.html';
    }

    /**
     * Truncate text to specified length
     * @param {string} text - Text to truncate
     * @param {number} maxLength - Maximum length
     * @returns {string} Truncated text
     */
    truncateText(text, maxLength) {
        if (text.length <= maxLength) return text;
        return text.substring(0, maxLength) + '...';
    }
}

// Initialize application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    const app = new HackerNewsAnalysisApp();
    // Initialize generate button state
    app.updateTopicDisplay();
    
    // Handle hash navigation (e.g., from knowledge graph back to cluster page)
    if (window.location.hash === '#cluster') {
        app.switchPage('cluster');
    }
    
    console.log('Hacker News Analysis App initialized');
});
