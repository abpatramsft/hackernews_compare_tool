/**
 * Visualization Manager for Cluster Plots
 */
class VisualizationManager {
    constructor() {
        this.visualizations = {
            top: null,    // Topic 1 visualization data
            bottom: null  // Topic 2 visualization data
        };
        this.currentTopic = 'top';  // Currently displayed topic
        this.clusterIdMaps = {
            top: {},      // Map trace index to cluster ID for Topic 1
            bottom: {}    // Map trace index to cluster ID for Topic 2
        };
        // Cache for cluster summaries: key = "searchId:clusterId:storyIdsHash"
        this.summaryCache = {};
        // Store traces and highlighted cluster for each topic
        this.traces = {
            top: null,
            bottom: null
        };
        this.highlightedCluster = {
            top: null,
            bottom: null
        };
    }

    /**
     * Create cluster visualization using Plotly
     * @param {Object} data - Cluster data from API
     * @param {string} searchId - Search ID for this visualization
     * @param {string} topic - Topic identifier ('top' or 'bottom')
     */
    createClusterVisualization(data, searchId, topic = 'top') {
        // Store visualization data for this topic
        this.visualizations[topic] = {
            searchId: searchId,
            data: data
        };

        // If this is the first visualization, set it as current
        if (!this.visualizations[this.currentTopic]) {
            this.currentTopic = topic;
        }

        // Display the visualization
        this.displayVisualization(topic);
    }

    /**
     * Display visualization for a specific topic
     * @param {string} topic - Topic identifier ('top' or 'bottom')
     */
    displayVisualization(topic) {
        const vizData = this.visualizations[topic];
        if (!vizData) {
            console.warn(`No visualization data for topic: ${topic}`);
            return;
        }

        this.currentTopic = topic;
        const data = vizData.data;
        const searchId = vizData.searchId;

        // Show/hide toggle based on whether both topics are available
        const hasBothTopics = this.visualizations.top && this.visualizations.bottom;
        const toggleContainer = document.querySelector('.topic-toggle');
        const vizHeader = document.querySelector('.viz-header');
        
        if (toggleContainer) {
            toggleContainer.style.display = hasBothTopics ? 'flex' : 'none';
        }
        
        // Update header layout based on toggle visibility
        if (vizHeader) {
            if (hasBothTopics) {
                vizHeader.classList.remove('single-topic');
            } else {
                vizHeader.classList.add('single-topic');
            }
        }

        // Update toggle buttons
        if (hasBothTopics) {
            document.querySelectorAll('.topic-btn').forEach(btn => {
                btn.classList.remove('active');
            });
            document.getElementById(`topic-toggle-${topic === 'top' ? '1' : '2'}`).classList.add('active');
        }

        // Group data by cluster
        const clusterGroups = {};
        data.cluster_labels.forEach((label, index) => {
            if (!clusterGroups[label]) {
                clusterGroups[label] = {
                    x: [],
                    y: [],
                    texts: [],
                    ids: [],
                    color: data.colors[index]
                };
            }
            clusterGroups[label].x.push(data.x[index]);
            clusterGroups[label].y.push(data.y[index]);
            clusterGroups[label].texts.push(data.tweet_texts[index]);
            clusterGroups[label].ids.push(data.tweet_ids[index]);
        });

        // Create traces for each cluster
        const traces = [];
        // Store cluster ID mapping for legend clicks (per topic)
        this.clusterIdMaps[topic] = {};
        
        Object.keys(clusterGroups).forEach((label, traceIndex) => {
            const group = clusterGroups[label];
            const clusterInfo = data.cluster_info[label];
            const clusterName = `Cluster ${label}`;
            const clusterId = parseInt(label);

            // Store mapping from trace index to cluster ID
            this.clusterIdMaps[topic][traceIndex] = clusterId;

            traces.push({
                x: group.x,
                y: group.y,
                mode: 'markers',
                type: 'scatter',
                name: `${clusterName} (${clusterInfo.size})`,
                text: group.texts.map(t => this.truncateText(t, 100)),
                customdata: group.ids.map((id, i) => ({
                    story_id: id,
                    cluster_id: clusterId,
                    full_text: group.texts[i]
                })),
                marker: {
                    size: 10,
                    color: group.color,
                    line: {
                        color: 'white',
                        width: 1
                    },
                    opacity: 0.8
                },
                hovertemplate: '<b>%{text}</b><br>Cluster: ' + clusterName + '<extra></extra>'
            });
        });

        // Store traces for this topic
        this.traces[topic] = traces;

        // Layout configuration
        const layout = {
            title: {
                text: 'Story Clusters (UMAP + KMeans)',
                font: {
                    size: 20,
                    color: '#334155'
                }
            },
            xaxis: {
                title: 'UMAP Dimension 1',
                showgrid: true,
                zeroline: false
            },
            yaxis: {
                title: 'UMAP Dimension 2',
                showgrid: true,
                zeroline: false
            },
            hovermode: 'closest',
            showlegend: true,
            legend: {
                orientation: 'v',
                x: 1.02,
                y: 1,
                font: {
                    size: 12
                }
            },
            plot_bgcolor: '#f8fafc',
            paper_bgcolor: 'white',
            margin: {
                l: 60,
                r: 150,
                t: 80,
                b: 60
            }
        };

        // Configuration
        const config = {
            responsive: true,
            displayModeBar: true,
            modeBarButtonsToRemove: ['lasso2d', 'select2d'],
            displaylogo: false
        };

        // Create or update plot
        const plotDiv = document.getElementById('visualization');
        Plotly.newPlot(plotDiv, traces, layout, config);

        // Add click event listener for points
        plotDiv.on('plotly_click', (eventData) => {
            this.handleClusterClick(eventData);
        });

        // Add legend click event listener (store topic, data, and searchId in closure)
        const currentTopic = topic;
        const currentData = data;
        const currentSearchId = searchId;
        const vizManager = this;
        
        plotDiv.on('plotly_legendclick', (eventData) => {
            // Prevent default legend toggle behavior
            if (eventData && eventData.event) {
                eventData.event.preventDefault();
                eventData.event.stopPropagation();
            }
            
            // Get the clicked legend item index
            const clickedIndex = eventData.curveNumber;
            
            // Get cluster ID from our mapping for current topic
            const clusterId = vizManager.clusterIdMaps[currentTopic][clickedIndex];
            
            if (clusterId !== undefined) {
                vizManager.handleClusterClickByClusterId(clusterId, currentData, currentSearchId);
            }
            
            return false; // Prevent default legend toggle
        });

        // Show visualization section
        document.getElementById('visualization-section').style.display = 'block';
        
        // Hide cluster details when switching topics/visualizations
        const clusterDetails = document.getElementById('cluster-details');
        if (clusterDetails) {
            clusterDetails.style.display = 'none';
        }

        // Reset highlighting when displaying new visualization
        this.highlightedCluster[topic] = null;
    }

    /**
     * Switch between Topic 1 and Topic 2 visualizations
     * @param {string} topic - Topic identifier ('top' or 'bottom')
     */
    switchTopic(topic) {
        if (this.visualizations[topic]) {
            this.displayVisualization(topic);
        } else {
            console.warn(`No visualization available for topic: ${topic}`);
            // If trying to switch to unavailable topic, don't change anything
            return;
        }
    }

    /**
     * Handle click on a cluster point
     * @param {Object} eventData - Plotly click event data
     */
    async handleClusterClick(eventData) {
        if (eventData.points.length === 0) return;

        const point = eventData.points[0];
        const clusterId = point.data.customdata[point.pointIndex].cluster_id;

        const currentViz = this.visualizations[this.currentTopic];
        if (!currentViz) return;

        const data = currentViz.data;
        const searchId = currentViz.searchId;

        await this.handleClusterClickByClusterId(clusterId, data, searchId);
    }

    /**
     * Generate cache key for cluster summary
     * @param {string} searchId - Search ID
     * @param {number} clusterId - Cluster ID
     * @param {Array<string>} storyIds - Array of story IDs (sorted for consistency)
     * @returns {string} Cache key
     */
    _getCacheKey(searchId, clusterId, storyIds) {
        // Sort IDs to ensure consistent cache key regardless of order
        const sortedIds = [...storyIds].sort().join(',');
        return `${searchId}:${clusterId}:${sortedIds}`;
    }

    /**
     * Highlight a specific cluster by fading out others
     * @param {number} clusterId - Cluster ID to highlight
     * @param {string} topic - Topic identifier
     */
    highlightCluster(clusterId, topic) {
        const traces = this.traces[topic];
        if (!traces) return;

        const plotDiv = document.getElementById('visualization');
        const updates = {
            opacity: []
        };

        // Update opacity for each trace
        traces.forEach((trace, index) => {
            const traceClusterId = this.clusterIdMaps[topic][index];
            if (traceClusterId === clusterId) {
                // Highlight the selected cluster
                updates.opacity.push(1.0);
            } else {
                // Fade out other clusters
                updates.opacity.push(0.15);
            }
        });

        // Apply the opacity updates
        Plotly.restyle(plotDiv, {
            'marker.opacity': updates.opacity
        });

        // Store the highlighted cluster
        this.highlightedCluster[topic] = clusterId;
    }

    /**
     * Reset highlighting to show all clusters normally
     * @param {string} topic - Topic identifier
     */
    resetHighlighting(topic) {
        const traces = this.traces[topic];
        if (!traces) return;

        const plotDiv = document.getElementById('visualization');
        const updates = {
            opacity: traces.map(() => 0.8) // Reset to default opacity
        };

        Plotly.restyle(plotDiv, {
            'marker.opacity': updates.opacity
        });

        this.highlightedCluster[topic] = null;
    }

    /**
     * Handle cluster click by cluster ID (used by both point clicks and legend clicks)
     * @param {number} clusterId - Cluster ID
     * @param {Object} data - Visualization data
     * @param {string} searchId - Search ID
     */
    async handleClusterClickByClusterId(clusterId, data, searchId) {
        // Highlight the clicked cluster
        this.highlightCluster(clusterId, this.currentTopic);
        // Get all stories in this cluster
        const clusterStoryIds = [];
        data.cluster_labels.forEach((label, index) => {
            if (label === clusterId) {
                clusterStoryIds.push(data.tweet_ids[index]);
            }
        });

        // Get story texts for display
        const clusterStories = [];
        data.cluster_labels.forEach((label, index) => {
            if (label === clusterId) {
                clusterStories.push({
                    text: data.tweet_texts[index],
                    id: data.tweet_ids[index]
                });
            }
        });

        // Check cache first
        const cacheKey = this._getCacheKey(searchId, clusterId, clusterStoryIds);
        if (this.summaryCache[cacheKey]) {
            console.log(`Using cached summary for cluster ${clusterId} (search_id: ${searchId})`);
            const cachedSummary = this.summaryCache[cacheKey];
            this.showClusterDetails(cachedSummary.title, cachedSummary.summary, clusterStories);
            
            // Scroll to cluster details
            document.getElementById('cluster-details').scrollIntoView({
                behavior: 'smooth',
                block: 'nearest'
            });
            return;
        }

        // Show loading state
        this.showClusterDetails('Loading...', 'Generating cluster topic name and summary...', []);

        try {
            // Get summary from API (includes LLM-generated title and summary)
            const summary = await api.getSummary(
                searchId,
                clusterId,
                clusterStoryIds
            );

            // Cache the result
            this.summaryCache[cacheKey] = {
                title: summary.title,
                summary: summary.summary
            };
            console.log(`Cached summary for cluster ${clusterId} (search_id: ${searchId})`);

            // Display cluster details below visualization (both title and summary)
            this.showClusterDetails(summary.title, summary.summary, clusterStories);

            // Scroll to cluster details
            document.getElementById('cluster-details').scrollIntoView({
                behavior: 'smooth',
                block: 'nearest'
            });

        } catch (error) {
            console.error('Error fetching cluster summary:', error);
            this.showClusterDetails(
                'Error',
                'Failed to generate cluster topic name and summary. Please try again.',
                []
            );
        }
    }

    /**
     * Show cluster details below visualization
     * @param {string} title - Cluster topic name (LLM-generated)
     * @param {string} summary - Cluster summary (LLM-generated)
     * @param {Array} stories - Array of story objects
     */
    showClusterDetails(title, summary, stories) {
        const detailsSection = document.getElementById('cluster-details');
        const titleEl = document.getElementById('cluster-details-title');
        const summaryEl = document.getElementById('cluster-details-summary');
        const articlesCountEl = document.getElementById('cluster-articles-count');
        const articlesListEl = document.getElementById('cluster-articles-list');

        // Set cluster topic name (LLM-generated)
        titleEl.textContent = title;
        
        // Set cluster summary (LLM-generated)
        summaryEl.textContent = summary || 'No summary available.';
        
        articlesCountEl.textContent = stories.length;

        // Clear and populate articles
        articlesListEl.innerHTML = '';
        if (stories.length === 0) {
            articlesListEl.innerHTML = '<p style="color: #94a3b8;">No articles found in this cluster.</p>';
        } else {
            stories.forEach(story => {
                const articleDiv = document.createElement('div');
                articleDiv.className = 'cluster-article-item';
                articleDiv.innerHTML = `
                    <p>${this.escapeHtml(story.text)}</p>
                `;
                articlesListEl.appendChild(articleDiv);
            });
        }

        // Show cluster details section
        detailsSection.style.display = 'block';
    }

    /**
     * Show modal with cluster information (kept for backward compatibility if needed)
     * @param {string} title - Cluster title
     * @param {string} summary - Cluster summary
     * @param {Array} stories - Array of story objects
     */
    showModal(title, summary, stories) {
        const modal = document.getElementById('cluster-modal');
        const titleEl = document.getElementById('cluster-title');
        const summaryEl = document.getElementById('cluster-summary');
        const storyCountEl = document.getElementById('tweet-count');
        const storiesEl = document.getElementById('cluster-tweets');

        titleEl.textContent = title;
        summaryEl.textContent = summary;
        storyCountEl.textContent = stories.length;

        // Clear and populate stories
        storiesEl.innerHTML = '';
        stories.forEach(story => {
            const storyDiv = document.createElement('div');
            storyDiv.className = 'tweet-item';
            storyDiv.innerHTML = `
                <p>${this.escapeHtml(story.text)}</p>
                <div class="tweet-meta">Story ID: ${story.id}</div>
            `;
            storiesEl.appendChild(storyDiv);
        });

        // Show modal
        modal.style.display = 'block';
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
     * Clear visualization
     */
    clearVisualization() {
        const vizSection = document.getElementById('visualization-section');
        vizSection.style.display = 'none';
        Plotly.purge('visualization');
        this.visualizations = { top: null, bottom: null };
        this.clusterIdMaps = { top: {}, bottom: {} };
        this.traces = { top: null, bottom: null };
        this.highlightedCluster = { top: null, bottom: null };
        this.currentTopic = 'top';
        // Note: We keep the summary cache to persist across visualizations
        // This allows reusing summaries when switching between topics
    }
}

// Create global visualization manager instance
const vizManager = new VisualizationManager();

// Modal close functionality and topic toggle
document.addEventListener('DOMContentLoaded', () => {
    const modal = document.getElementById('cluster-modal');
    const closeBtn = document.querySelector('.close');

    closeBtn.onclick = () => {
        modal.style.display = 'none';
    };

    window.onclick = (event) => {
        if (event.target === modal) {
            modal.style.display = 'none';
        }
    };

    // Topic toggle functionality
    document.getElementById('topic-toggle-1').addEventListener('click', () => {
        vizManager.switchTopic('top');
    });

    document.getElementById('topic-toggle-2').addEventListener('click', () => {
        vizManager.switchTopic('bottom');
    });
});
