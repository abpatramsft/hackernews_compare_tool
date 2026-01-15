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

        // Compare button (Main page)
        document.getElementById('compare-btn').addEventListener('click', () => {
            this.handleCompare();
        });

        // Generate button (Cluster Analysis page)
        document.getElementById('generate-btn').addEventListener('click', () => {
            this.handleGenerate();
        });

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
        document.querySelectorAll('.nav-tab').forEach(tab => {
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
        } else {
            // Hide visualization when switching back to main page
            const vizSection = document.getElementById('visualization-section');
            if (vizSection) {
                vizSection.style.display = 'none';
            }
        }
    }

    /**
     * Update topic display on cluster analysis page
     */
    updateTopicDisplay() {
        const topic1El = document.getElementById('topic-1-display');
        const topic2El = document.getElementById('topic-2-display');
        const searchTop = document.getElementById('search-top').value.trim();
        const searchBottom = document.getElementById('search-bottom').value.trim();

        topic1El.textContent = searchTop || '-';
        topic2El.textContent = searchBottom || '-';

        // Enable/disable generate button based on whether both searches are done
        const generateBtn = document.getElementById('generate-btn');
        if (this.searchData.top && this.searchData.bottom) {
            generateBtn.disabled = false;
        } else {
            generateBtn.disabled = true;
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
            if (topResult && bottomResult) {
                compareBtn.style.display = 'none';
            }

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
        loadingEl.style.display = 'block';

        try {
            // Generate clusters for both topics in parallel
            const [topViz, bottomViz] = await Promise.all([
                api.analyzeComplete(this.searchData.top.search_id, 'kmeans'),
                api.analyzeComplete(this.searchData.bottom.search_id, 'kmeans')
            ]);

            // Create visualizations for both topics
            vizManager.createClusterVisualization(topViz, this.searchData.top.search_id, 'top');
            vizManager.createClusterVisualization(bottomViz, this.searchData.bottom.search_id, 'bottom');

            // Show visualization section
            document.getElementById('visualization-section').style.display = 'block';

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
        this.hideStats(section);

        try {
            // Call search API
            const response = await api.searchHackerNews(query, section);

            // Store search data
            this.searchData[section] = response;

            // Get stories for display
            const stories = response.stories || response.tweets; // Support both fields
            if (!stories || stories.length === 0) {
                throw new Error('No stories found for this topic. Try a different search term.');
            }

            // Display stats with stories
            this.displayStats(section, response.stats, stories);

            return response;

        } catch (error) {
            console.error('Search error:', error);
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
     */
    displayStats(section, stats, stories = []) {
        const statsContainer = document.getElementById(`stats-${section}`);
        const countEl = document.getElementById(`count-${section}`);
        const totalReactionsEl = document.getElementById(`total-reactions-${section}`);
        const mostLikedEl = document.getElementById(`most-liked-${section}`);
        const likesEl = document.getElementById(`likes-${section}`);
        const topArticleLinkEl = document.getElementById(`top-article-link-${section}`);

        countEl.textContent = stats.count;

        // Calculate total reactions (sum of all scores)
        const totalReactions = stories.reduce((sum, story) => {
            const score = story.score || story.likes || 0;
            return sum + score;
        }, 0);
        totalReactionsEl.textContent = totalReactions.toLocaleString();

        // Support both most_liked (old) and most_upvoted (new) fields
        const mostPopular = stats.most_upvoted || stats.most_liked;
        if (mostPopular) {
            const text = mostPopular.title || mostPopular.text;
            mostLikedEl.textContent = this.truncateText(text, 150);
            const score = mostPopular.score || mostPopular.likes || 0;
            likesEl.textContent = `${score} points`;
            
            // Show link to article
            const articleUrl = mostPopular.url || mostPopular.hn_url;
            if (articleUrl) {
                topArticleLinkEl.href = articleUrl;
                topArticleLinkEl.style.display = 'inline-block';
            } else {
                topArticleLinkEl.style.display = 'none';
            }
        } else {
            mostLikedEl.textContent = 'No stories available';
            likesEl.textContent = '';
            topArticleLinkEl.style.display = 'none';
        }

        statsContainer.style.display = 'flex';

        // Display top 5 articles if stories are available
        if (stories && stories.length > 0) {
            this.displayTopArticles(section, stories);
        }
    }

    /**
     * Display top 5 articles by reaction count
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

        // Get top 5
        const top5 = sortedStories.slice(0, 5);

        const topArticlesSection = document.getElementById(`top-articles-${section}`);
        const topArticlesList = document.getElementById(`top-articles-list-${section}`);

        // Clear previous content
        topArticlesList.innerHTML = '';

        if (top5.length === 0) {
            topArticlesSection.style.display = 'none';
            return;
        }

        // Create article items
        top5.forEach((story, index) => {
            const articleDiv = document.createElement('div');
            articleDiv.className = 'top-article-item';
            
            const title = story.title || story.text || 'Untitled';
            const score = story.score || story.likes || 0;
            const articleUrl = story.url || story.hn_url || '#';
            
            articleDiv.innerHTML = `
                <div class="article-rank">${index + 1}</div>
                <div class="article-content">
                    <a href="${articleUrl}" target="_blank" class="article-title">${this.escapeHtml(title)}</a>
                    <div class="article-meta">
                        <span class="article-score">${score} points</span>
                        ${story.author ? `<span class="article-author">by ${this.escapeHtml(story.author)}</span>` : ''}
                    </div>
                </div>
            `;
            
            topArticlesList.appendChild(articleDiv);
        });

        topArticlesSection.style.display = 'block';
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
     * Hide statistics
     * @param {string} section - Section identifier
     */
    hideStats(section) {
        const statsContainer = document.getElementById(`stats-${section}`);
        statsContainer.style.display = 'none';
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
            loadingEl.style.display = 'block';
            searchInput.disabled = true;
        } else {
            loadingEl.style.display = 'none';
            searchInput.disabled = false;
        }
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
    console.log('Hacker News Analysis App initialized');
});
