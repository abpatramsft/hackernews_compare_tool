/**
 * Knowledge Graph Visualization using Sigma.js
 * Displays cluster similarity networks with force-directed layout
 */

const KnowledgeGraphManager = (() => {
    let currentTopic = 'top';
    let graphData = {
        top: null,
        bottom: null
    };
    let searchIds = {
        top: null,
        bottom: null
    };
    let currentGraph = null;
    let summaryCache = {};
    let currentThreshold = 0.5;
    let currentGraphData = null; // Store current graph data for re-rendering
    let calculatedPositions = null; // Store calculated node positions

    const API_BASE = 'http://localhost:8000/api/v1';

    /**
     * Initialize the knowledge graph manager
     */
    function init() {
        console.log('Initializing Knowledge Graph Manager');
        
        // Set up topic toggle buttons
        setupTopicToggle();
        
        // Set up page navigation
        setupPageNavigation();
        
        // Set up details panel close button
        document.getElementById('close-details').addEventListener('click', hideClusterDetails);
        
        // Set up generate button
        document.getElementById('generate-graph-btn').addEventListener('click', generateCurrentGraph);
        
        // Set up threshold slider
        const thresholdSlider = document.getElementById('threshold-slider');
        const thresholdValue = document.getElementById('threshold-value');
        
        thresholdSlider.addEventListener('input', (e) => {
            const value = parseInt(e.target.value) / 100;
            currentThreshold = value;
            thresholdValue.textContent = value.toFixed(2);
            
            // Re-render graph with new threshold if data exists
            if (currentGraphData) {
                renderGraph(currentGraphData);
            }
        });
        
        // Check if we're returning from main page
        checkInitialState();
    }

    /**
     * Check initial state and retrieve search IDs from sessionStorage
     */
    function checkInitialState() {
        const storedSearchIds = sessionStorage.getItem('currentSearchIds');
        const clustersGenerated = sessionStorage.getItem('clustersGenerated');
        
        if (!clustersGenerated || clustersGenerated !== 'true') {
            // Clusters not generated yet
            document.getElementById('status-text').innerHTML = `
                <div style="text-align: center; padding: 2rem;">
                    <p style="color: var(--text-secondary); margin-bottom: 1rem;">Clusters have not been generated yet.</p>
                    <p style="color: var(--text-muted); font-size: 0.9rem; margin-bottom: 1rem;">Please go to the Cluster Analysis page and generate clusters first.</p>
                    <a href="index.html" style="color: var(--accent-a); text-decoration: none; font-weight: 500;">← Go to Main Page</a>
                </div>
            `;
            return;
        }
        
        if (storedSearchIds) {
            try {
                const ids = JSON.parse(storedSearchIds);
                searchIds = ids;
                
                // Show status
                let statusText = 'Clusters ready for: ';
                if (searchIds.top) statusText += 'Topic A ';
                if (searchIds.bottom) statusText += 'Topic B ';
                
                document.getElementById('status-text').textContent = statusText;
                
                // Show toggle section if we have search IDs
                if (searchIds.top || searchIds.bottom) {
                    document.getElementById('topic-toggle-section').style.display = 'flex';
                }
            } catch (e) {
                console.error('Error parsing stored search IDs:', e);
            }
        } else {
            document.getElementById('status-text').innerHTML = `
                <div style="text-align: center; padding: 2rem;">
                    <p style="color: var(--text-secondary); margin-bottom: 1rem;">No topics found.</p>
                    <p style="color: var(--text-muted); font-size: 0.9rem; margin-bottom: 1rem;">Please search and cluster topics first.</p>
                    <a href="index.html" style="color: var(--accent-a); text-decoration: none; font-weight: 500;">← Go to Main Page</a>
                </div>
            `;
        }
    }

    /**
     * Set up topic toggle buttons
     */
    function setupTopicToggle() {
        document.querySelectorAll('.topic-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const topic = e.target.dataset.topic;
                
                // Update active state
                document.querySelectorAll('.topic-btn').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                
                currentTopic = topic;
                
                // Switch graph if available
                if (graphData[topic]) {
                    renderGraph(graphData[topic]);
                }
            });
        });
    }

    /**
     * Set up page navigation
     */
    function setupPageNavigation() {
        document.getElementById('nav-main').addEventListener('click', () => {
            window.location.href = 'index.html';
        });
        
        document.getElementById('nav-cluster').addEventListener('click', () => {
            window.location.href = 'index.html#cluster';
        });
    }

    /**
     * Generate graph for current topic
     */
    async function generateCurrentGraph() {
        if (!searchIds[currentTopic]) {
            alert('No search data available for this topic. Please search first.');
            return;
        }

        await generateGraph(currentTopic);
    }

    /**
     * Generate cluster graph from API
     */
    async function generateGraph(topic) {
        if (!searchIds[topic]) {
            console.error(`No search ID for topic ${topic}`);
            return;
        }

        const searchId = searchIds[topic];
        console.log(`Generating graph for topic ${topic} (search_id: ${searchId})`);
        
        // Show loading
        document.getElementById('loading-graph').style.display = 'flex';
        document.getElementById('graph-canvas').style.display = 'none';
        
        try {
            // Call cluster-graph endpoint
            const response = await fetch(`${API_BASE}/analysis/cluster-graph`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    search_id: searchId
                })
            });

            if (!response.ok) {
                throw new Error(`API error: ${response.status}`);
            }

            const result = await response.json();

            if (!result.success) {
                throw new Error(result.message);
            }

            // Cache graph data
            graphData[topic] = result.graph_data;
            
            // Reset stored positions when generating new graph
            calculatedPositions = null;
            
            // Show canvas first so it has dimensions
            document.getElementById('loading-graph').style.display = 'none';
            document.getElementById('graph-canvas').style.display = 'block';
            
            // Render the graph (with slight delay to ensure container is rendered)
            setTimeout(() => {
                renderGraph(result.graph_data);
            }, 100);
        } catch (error) {
            console.error('Error generating graph:', error);
            document.getElementById('loading-graph').innerHTML = `
                <div class="error-message">
                    <span>Error generating graph: ${error.message}</span>
                </div>
            `;
        }
    }

    /**
     * Render graph using Sigma.js with force-directed layout
     */
    function renderGraph(graphData) {
        console.log('Rendering graph with', graphData.nodes.length, 'nodes and', graphData.edges.length, 'edges');
        
        // Store graph data for threshold changes
        currentGraphData = graphData;
        
        // Destroy existing graph
        if (currentGraph) {
            currentGraph.kill();
        }

        // Create graph object for Sigma
        const sigmaGraph = {
            nodes: [],
            edges: []
        };

        // Add nodes
        const minSize = 5;
        const maxSize = 30;
        const sizes = graphData.nodes.map(n => n.size);
        const minNodeSize = Math.min(...sizes);
        const maxNodeSize = Math.max(...sizes);

        graphData.nodes.forEach(node => {
            // Scale node size based on story count
            const normalizedSize = (node.size - minNodeSize) / (maxNodeSize - minNodeSize || 1);
            const nodeSize = minSize + (normalizedSize * (maxSize - minSize));

            // Use stored position if available, otherwise random
            let nodeX, nodeY;
            if (calculatedPositions && calculatedPositions[node.id]) {
                nodeX = calculatedPositions[node.id].x;
                nodeY = calculatedPositions[node.id].y;
            } else {
                nodeX = Math.random() * 100;
                nodeY = Math.random() * 100;
            }

            sigmaGraph.nodes.push({
                key: String(node.id),
                label: node.label,
                size: nodeSize,
                color: node.color,
                originalId: node.id,
                storiesCount: node.size,
                engagement: node.avg_engagement,
                x: nodeX,
                y: nodeY
            });
        });

        // Add edges - FILTER by threshold
        graphData.edges.forEach(edge => {
            const similarity = edge.similarity || 0.5;
            
            // Only add edge if similarity meets threshold
            if (similarity >= currentThreshold) {
                // Determine color and size based on similarity thresholds
                let color, size;
                if (similarity > 0.8) {
                    // High similarity: dark black
                    color = 'rgba(20, 20, 20, 0.9)';
                    size = 3.5;
                } else if (similarity >= 0.5) {
                    // Medium similarity: medium gray
                    color = 'rgba(100, 100, 100, 0.6)';
                    size = 2.5;
                } else {
                    // Low similarity: very faint
                    color = 'rgba(180, 180, 180, 0.25)';
                    size = 1.5;
                }
                
                sigmaGraph.edges.push({
                    key: `${edge.source}-${edge.target}`,
                    source: String(edge.source),
                    target: String(edge.target),
                    similarity: similarity,
                    color: color,
                    size: size
                });
            }
        });

        // Configure Sigma
        const container = document.getElementById('graph-canvas');
        container.innerHTML = ''; // Clear

        // Create a graphology instance
        const graphologyGraph = new graphology.Graph();
        
        // Add nodes to graphology
        sigmaGraph.nodes.forEach(node => {
            graphologyGraph.addNode(node.key, {
                label: node.label,
                x: node.x,
                y: node.y,
                size: node.size,
                color: node.color,
                originalId: node.originalId,
                storiesCount: node.storiesCount,
                engagement: node.engagement
            });
        });
        
        // Add edges to graphology (already filtered by threshold in sigmaGraph.edges)
        sigmaGraph.edges.forEach(edge => {
            graphologyGraph.addEdge(edge.source, edge.target, {
                similarity: edge.similarity,
                size: edge.size,
                color: edge.color
            });
        });

        // Create Sigma renderer
        const renderer = new Sigma(graphologyGraph, container, {
            allowInvalidContainer: true,
            renderLabels: true,
            renderEdgeLabels: false,
            labelSize: 12,
            labelColor: { color: '#333' },
            defaultNodeColor: '#999',
            defaultEdgeColor: '#ccc',
            labelDensity: 0.07,
            labelGridCellSize: 60,
            labelRenderedSizeThreshold: 8,
            zIndex: true,
            enableEdgeEvents: true // Enable edge hover events
        });

        // Set up node click handler for cluster details
        renderer.on('clickNode', ({ node }) => {
            const nodeAttrs = graphologyGraph.getNodeAttributes(node);
            showClusterDetails(nodeAttrs);
        });

        // Track mouse position globally for tooltip
        let mouseX = 0, mouseY = 0;
        container.addEventListener('mousemove', (e) => {
            mouseX = e.clientX;
            mouseY = e.clientY;
        });

        // Set up edge hover to show similarity score
        renderer.on('enterEdge', ({ edge }) => {
            const edgeAttrs = graphologyGraph.getEdgeAttributes(edge);
            showEdgeTooltip(edgeAttrs.similarity, mouseX, mouseY);
        });

        renderer.on('leaveEdge', () => {
            hideEdgeTooltip();
        });

        // Apply force-directed layout only on first render
        if (!calculatedPositions) {
            applyForceLayout(graphologyGraph, sigmaGraph);
            
            // Store calculated positions for future re-renders
            calculatedPositions = {};
            sigmaGraph.nodes.forEach(node => {
                calculatedPositions[node.originalId] = {
                    x: graphologyGraph.getNodeAttribute(node.key, 'x'),
                    y: graphologyGraph.getNodeAttribute(node.key, 'y')
                };
            });
        }
        
        // Refresh renderer
        renderer.refresh();

        currentGraph = renderer;
    }

    /**
     * Apply force-directed layout algorithm
     */
    function applyForceLayout(graphologyGraph, graphData) {
        // Simple force-directed simulation
        const nodes = graphData.nodes;
        const edges = graphData.edges;
        
        // Initialize forces
        const forces = {};
        nodes.forEach(node => {
            forces[node.key] = { x: 0, y: 0 };
        });

        // Run simulation for multiple iterations
        const iterations = 50;
        const k = 2; // Ideal spring length
        const c = 0.1; // Coulomb constant (repulsion)
        const dt = 0.05; // Time step
        const friction = 0.85;

        for (let iter = 0; iter < iterations; iter++) {
            // Reset forces
            nodes.forEach(node => {
                forces[node.key] = { x: 0, y: 0 };
            });

            // Repulsive forces (Coulomb)
            for (let i = 0; i < nodes.length; i++) {
                for (let j = i + 1; j < nodes.length; j++) {
                    const n1 = nodes[i];
                    const n2 = nodes[j];
                    
                    const dx = n2.x - n1.x;
                    const dy = n2.y - n1.y;
                    const dist = Math.sqrt(dx * dx + dy * dy) || 0.1;
                    
                    const force = (c / (dist * dist)) * 100;
                    
                    forces[n1.key].x -= (dx / dist) * force;
                    forces[n1.key].y -= (dy / dist) * force;
                    forces[n2.key].x += (dx / dist) * force;
                    forces[n2.key].y += (dy / dist) * force;
                }
            }

            // Attractive forces (spring)
            edges.forEach(edge => {
                const n1 = nodes.find(n => n.key === edge.source);
                const n2 = nodes.find(n => n.key === edge.target);
                
                if (n1 && n2) {
                    const dx = n2.x - n1.x;
                    const dy = n2.y - n1.y;
                    const dist = Math.sqrt(dx * dx + dy * dy) || 0.1;
                    
                    const force = (dist - k) * 0.01;
                    
                    forces[n1.key].x += (dx / dist) * force;
                    forces[n1.key].y += (dy / dist) * force;
                    forces[n2.key].x -= (dx / dist) * force;
                    forces[n2.key].y -= (dy / dist) * force;
                }
            });

            // Update positions
            nodes.forEach(node => {
                const fx = forces[node.key].x;
                const fy = forces[node.key].y;
                
                node.vx = (node.vx || 0) * friction + fx * dt;
                node.vy = (node.vy || 0) * friction + fy * dt;
                
                node.x += node.vx;
                node.y += node.vy;
            });
        }

        // Update graphology with new positions
        nodes.forEach(node => {
            graphologyGraph.setNodeAttribute(node.key, 'x', node.x);
            graphologyGraph.setNodeAttribute(node.key, 'y', node.y);
        });
    }

    /**
     * Show edge tooltip with similarity score
     */
    function showEdgeTooltip(similarity, x, y) {
        let tooltip = document.getElementById('edge-tooltip');
        if (!tooltip) {
            tooltip = document.createElement('div');
            tooltip.id = 'edge-tooltip';
            tooltip.style.cssText = `
                position: fixed;
                background: rgba(0, 0, 0, 0.85);
                color: white;
                padding: 8px 12px;
                border-radius: 6px;
                font-size: 13px;
                font-weight: 500;
                pointer-events: none;
                z-index: 10000;
                box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
            `;
            document.body.appendChild(tooltip);
        }
        
        const percentage = Math.round(similarity * 100);
        tooltip.textContent = `Similarity: ${percentage}%`;
        tooltip.style.display = 'block';
        tooltip.style.left = (x + 15) + 'px';
        tooltip.style.top = (y + 15) + 'px';
    }

    /**
     * Hide edge tooltip
     */
    function hideEdgeTooltip() {
        const tooltip = document.getElementById('edge-tooltip');
        if (tooltip) {
            tooltip.style.display = 'none';
        }
    }

    /**
     * Show cluster details panel
     */
    async function showClusterDetails(nodeAttrs) {
        const detailsPanel = document.getElementById('cluster-details');
        document.getElementById('details-title').textContent = nodeAttrs.label;
        document.getElementById('details-size').textContent = nodeAttrs.storiesCount;
        document.getElementById('details-engagement').textContent = Math.round(nodeAttrs.engagement * 10) / 10;
        
        // Fetch cluster summary if available
        const cacheKey = `${currentTopic}-${nodeAttrs.originalId}`;
        if (summaryCache[cacheKey]) {
            document.getElementById('details-summary').textContent = summaryCache[cacheKey];
        } else {
            document.getElementById('details-summary').textContent = 'No summary available';
        }

        detailsPanel.style.display = 'block';
    }

    /**
     * Hide cluster details panel
     */
    function hideClusterDetails() {
        document.getElementById('cluster-details').style.display = 'none';
    }

    /**
     * Set search IDs from another page
     */
    function setSearchIds(ids) {
        searchIds = ids;
        checkInitialState();
    }

    return {
        init,
        setSearchIds,
        generateGraph
    };
})();

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    KnowledgeGraphManager.init();
});
