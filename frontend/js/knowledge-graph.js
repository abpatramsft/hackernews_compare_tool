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
    let currentClusterId = null; // Store currently selected cluster ID
    let isPathHighlighted = false; // Track if a path is currently highlighted

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
        
        // Set up cluster view close button
        document.getElementById('close-cluster-view').addEventListener('click', hideClusterView);
        
        // Set up generate concept graph button
        document.getElementById('generate-concept-graph').addEventListener('click', generateConceptGraph);
        
        // Set up fullscreen button
        document.getElementById('fullscreen-concept-btn').addEventListener('click', toggleFullscreen);
        
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
     * Clean up old graph data from localStorage to prevent stale data
     */
    function cleanupOldGraphData() {
        try {
            const validSearchIds = new Set();
            const storedSearchIds = sessionStorage.getItem('currentSearchIds');
            
            if (storedSearchIds) {
                const ids = JSON.parse(storedSearchIds);
                if (ids.top) validSearchIds.add(`graphData_${ids.top}`);
                if (ids.bottom) validSearchIds.add(`graphData_${ids.bottom}`);
            }
            
            // Remove any graphData_* keys that aren't in the current valid set
            const keysToRemove = [];
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && key.startsWith('graphData_') && !validSearchIds.has(key)) {
                    keysToRemove.push(key);
                }
            }
            
            keysToRemove.forEach(key => {
                localStorage.removeItem(key);
                console.log(`Cleaned up stale graph data: ${key}`);
            });
            
        } catch (e) {
            console.error('Error cleaning up old graph data:', e);
        }
    }

    /**
     * Check initial state and retrieve search IDs from sessionStorage
     */
    function checkInitialState() {
        const storedSearchIds = sessionStorage.getItem('currentSearchIds');
        const clustersGenerated = sessionStorage.getItem('clustersGenerated');
        
        // Clean up old graph data from localStorage (keep only relevant ones)
        cleanupOldGraphData();
        
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
                    
                    // Try to load cached graph data from localStorage using search_id as key
                    if (searchIds.top) {
                        try {
                            const cacheKey = `graphData_${searchIds.top}`;
                            const cachedTop = localStorage.getItem(cacheKey);
                            if (cachedTop) {
                                graphData.top = JSON.parse(cachedTop);
                                console.log('Loaded cached graph data for top topic');
                            }
                        } catch (e) {
                            console.error('Error loading cached graph data for top:', e);
                        }
                    }
                    if (searchIds.bottom) {
                        try {
                            const cacheKey = `graphData_${searchIds.bottom}`;
                            const cachedBottom = localStorage.getItem(cacheKey);
                            if (cachedBottom) {
                                graphData.bottom = JSON.parse(cachedBottom);
                                console.log('Loaded cached graph data for bottom topic');
                            }
                        } catch (e) {
                            console.error('Error loading cached graph data for bottom:', e);
                        }
                    }
                    
                    // Auto-render if graph data is available
                    if (graphData[currentTopic]) {
                        document.getElementById('loading-graph').style.display = 'none';
                        document.getElementById('graph-canvas').style.display = 'block';
                        setTimeout(() => renderGraph(graphData[currentTopic]), 100);
                    }
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
                    document.getElementById('loading-graph').style.display = 'none';
                    document.getElementById('graph-canvas').style.display = 'block';
                    setTimeout(() => renderGraph(graphData[topic]), 50);
                } else {
                    // No graph data for this topic yet
                    document.getElementById('graph-canvas').style.display = 'none';
                    document.getElementById('loading-graph').style.display = 'none';
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

            // Cache graph data in memory
            graphData[topic] = result.graph_data;
            
            // Save to localStorage for persistence using search_id as key to prevent stale data
            try {
                const cacheKey = `graphData_${searchId}`;
                localStorage.setItem(cacheKey, JSON.stringify(result.graph_data));
                console.log(`Saved graph data to localStorage with key: ${cacheKey}`);
            } catch (e) {
                console.error('Error saving graph data to localStorage:', e);
            }
            
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
                storyIds: node.story_ids || [],
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
                engagement: node.engagement,
                storyIds: node.storyIds
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
     * Show cluster view section with details
     */
    async function showClusterDetails(nodeAttrs) {
        // Store current cluster ID
        currentClusterId = nodeAttrs.originalId;
        
        // Show cluster view section
        const clusterView = document.getElementById('cluster-view');
        clusterView.style.display = 'block';
        
        // Scroll to cluster view
        clusterView.scrollIntoView({ behavior: 'smooth', block: 'start' });
        
        // Update cluster details
        document.getElementById('cluster-view-title').textContent = nodeAttrs.label;
        document.getElementById('cluster-size').textContent = nodeAttrs.storiesCount;
        document.getElementById('cluster-engagement').textContent = Math.round(nodeAttrs.engagement * 10) / 10;
        
        // Fetch and display cluster summary
        const cacheKey = `${currentTopic}-${nodeAttrs.originalId}`;
        const summaryText = document.getElementById('cluster-summary-text');
        const clusterTitle = document.getElementById('cluster-view-title');
        
        if (summaryCache[cacheKey]) {
            // Use cached summary
            summaryText.textContent = summaryCache[cacheKey].summary;
            clusterTitle.textContent = summaryCache[cacheKey].title;
        } else {
            // Generate summary via API (will use backend cache if available)
            summaryText.textContent = 'Generating summary...';
            
            try {
                const searchId = searchIds[currentTopic];
                if (!searchId) {
                    throw new Error('No search ID available');
                }
                
                // Get story IDs for this cluster
                const storyIds = nodeAttrs.storyIds || [];
                
                // Call API to generate summary (will reuse cache if available)
                const summaryResponse = await api.getSummary(searchId, nodeAttrs.originalId, storyIds);
                
                // Update UI with generated summary
                clusterTitle.textContent = summaryResponse.title;
                summaryText.textContent = summaryResponse.summary;
                
                // Cache for future use in this session
                summaryCache[cacheKey] = {
                    title: summaryResponse.title,
                    summary: summaryResponse.summary
                };
                
            } catch (error) {
                console.error('Error generating summary:', error);
                summaryText.textContent = 'Failed to generate summary. Please try again.';
            }
        }
        
        // Hide concept graph container initially
        document.getElementById('concept-graph-container').style.display = 'none';
        
        // Clear any previous concept graph
        document.getElementById('concept-graph-canvas').innerHTML = '';
    }

    /**
     * Hide cluster view section
     */
    function hideClusterView() {
        document.getElementById('cluster-view').style.display = 'none';
        currentClusterId = null;
    }

    /**
     * Generate concept graph for current cluster
     */
    async function generateConceptGraph() {
        if (!currentClusterId) {
            console.error('No cluster selected');
            return;
        }
        
        const searchId = searchIds[currentTopic];
        if (!searchId) {
            console.error('No search ID for current topic');
            return;
        }
        
        // Show loading state
        const container = document.getElementById('concept-graph-container');
        const loading = document.getElementById('concept-loading');
        const canvas = document.getElementById('concept-graph-canvas');
        
        container.style.display = 'block';
        loading.style.display = 'flex';
        canvas.innerHTML = '';
        
        try {
            console.log(`Generating concept graph for cluster ${currentClusterId}...`);
            
            // Call API to get concept graph
            const response = await api.getConceptGraph(searchId, currentClusterId);
            
            if (!response.success) {
                throw new Error(response.message);
            }
            
            console.log(`Received concept graph with ${response.nodes.length} nodes`);
            
            // Hide loading, render concept tree
            loading.style.display = 'none';
            renderConceptTree(response.nodes, response.root_id);
            
        } catch (error) {
            console.error('Error generating concept graph:', error);
            loading.style.display = 'none';
            canvas.innerHTML = `
                <div style="padding: 2rem; text-align: center; color: var(--text-secondary);">
                    <p>Failed to generate concept graph: ${error.message}</p>
                </div>
            `;
        }
    }

    /**
     * Toggle fullscreen mode for concept graph
     */
    function toggleFullscreen() {
        const container = document.getElementById('concept-graph-container');
        container.classList.toggle('fullscreen');
        
        // Re-render to adjust dimensions
        const canvas = document.getElementById('concept-graph-canvas');
        if (canvas.querySelector('svg')) {
            // Store current data and re-render
            const svg = canvas.querySelector('svg');
            const hasContent = svg && svg.children.length > 0;
            
            if (hasContent) {
                // Trigger a small delay to let CSS transition complete
                setTimeout(() => {
                    // Get stored concept data from canvas dataset
                    if (canvas.conceptNodes && canvas.conceptRootId) {
                        renderConceptTree(canvas.conceptNodes, canvas.conceptRootId);
                    }
                }, 100);
            }
        }
    }

    /**
     * Render hierarchical concept tree using D3.js
     */
    function renderConceptTree(nodes, rootId) {
        const canvas = document.getElementById('concept-graph-canvas');
        canvas.innerHTML = ''; // Clear previous
        
        // Store for fullscreen re-render
        canvas.conceptNodes = nodes;
        canvas.conceptRootId = rootId;
        
        if (!nodes || nodes.length === 0) {
            canvas.innerHTML = '<div style="padding: 2rem; text-align: center;">No concept data available</div>';
            return;
        }
        
        // Build hierarchy from flat nodes list
        const nodeMap = {};
        nodes.forEach(node => {
            // Initialize with children from backend
            nodeMap[node.id] = { 
                ...node, 
                children: node.children ? node.children.map(childId => nodeMap[childId]).filter(Boolean) : []
            };
        });
        
        // First pass: create all nodes
        nodes.forEach(node => {
            if (!nodeMap[node.id]) {
                nodeMap[node.id] = { ...node, children: [] };
            }
        });
        
        // Second pass: link children using backend's children array
        nodes.forEach(node => {
            if (node.children && node.children.length > 0) {
                nodeMap[node.id].children = node.children
                    .map(childId => nodeMap[childId])
                    .filter(Boolean); // Remove any undefined children
            }
        });
        
        const root = nodeMap[rootId];
        if (!root) {
            canvas.innerHTML = '<div style="padding: 2rem; text-align: center;">Invalid root node</div>';
            return;
        }
        
        // Set up SVG dimensions
        const margin = { top: 40, right: 200, bottom: 40, left: 200 };
        const width = canvas.offsetWidth - margin.left - margin.right;
        const height = Math.max(600, nodes.length * 30); // Increased spacing
        
        // Create SVG
        const svg = d3.select(canvas)
            .append('svg')
            .attr('width', width + margin.left + margin.right)
            .attr('height', height + margin.top + margin.bottom);
        
        const g = svg.append('g')
            .attr('transform', `translate(${margin.left},${margin.top})`);
        
        // Create tree layout
        const treeLayout = d3.tree()
            .size([height, width]);
        
        // Convert to d3 hierarchy
        const hierarchy = d3.hierarchy(root);
        const treeData = treeLayout(hierarchy);
        
        // Get layer colors - consistent scheme
        const getLayerColor = (layer) => {
            if (layer === 0) return '#e0e7ff'; // Light indigo for articles (rightmost)
            if (layer === 1) return '#10b981'; // Green for article concepts
            // All higher layers including root: consistent blue
            return '#3b82f6'; // Solid blue for all aggregated concepts
        };
        
        // Draw links
        const links = g.selectAll('.concept-link')
            .data(treeData.links())
            .enter()
            .append('path')
            .attr('class', 'concept-link')
            .attr('d', d3.linkHorizontal()
                .x(d => d.y)
                .y(d => d.x))
            .attr('data-source-id', d => d.source.data.id)
            .attr('data-target-id', d => d.target.data.id);
        
        // Draw nodes
        const node = g.selectAll('.concept-node')
            .data(treeData.descendants())
            .enter()
            .append('g')
            .attr('class', d => d.data.layer === 0 ? 'concept-node article-node' : 'concept-node')
            .attr('data-node-id', d => d.data.id)
            .attr('transform', d => `translate(${d.y},${d.x})`);
        
        // Node circles (with click handler for path highlighting)
        node.append('circle')
            .attr('r', d => {
                if (d.data.layer === 0) return 4; // Smaller for articles
                if (d.data.layer === 1) return 6; // Medium for layer 1 concepts
                return 8; // Larger for higher layers
            })
            .style('fill', d => getLayerColor(d.data.layer))
            .style('cursor', 'pointer')
            .on('click', function(event, d) {
                event.stopPropagation();
                if (isPathHighlighted) {
                    // If already highlighted, clear on any node click
                    clearPathHighlight(g);
                } else {
                    // Otherwise, highlight the path
                    highlightPathToRoot(d, treeData, g);
                }
            });
        
        // Add white background rectangles for text (for better readability)
        node.append('rect')
            .attr('class', 'text-background')
            .attr('x', d => {
                if (d.children) {
                    // Left side nodes - calculate based on text length
                    const label = d.data.label;
                    const maxLen = 18; // Shorter for left side
                    const displayText = label.length > maxLen ? label.substring(0, maxLen - 3) + '...' : label;
                    return -(displayText.length * 6.5) - 12;
                } else {
                    return 15; // Right side nodes
                }
            })
            .attr('y', -10)
            .attr('width', d => {
                const label = d.data.label;
                let maxLen;
                if (d.children) {
                    maxLen = 18; // Shorter for left-side (parent) nodes
                } else {
                    maxLen = d.data.layer === 0 ? 25 : 30; // Longer for right-side (leaf) nodes
                }
                const displayText = label.length > maxLen ? label.substring(0, maxLen - 3) + '...' : label;
                return displayText.length * 6.5 + 8;
            })
            .attr('height', 18)
            .attr('rx', 3)
            .style('fill', 'white')
            .style('opacity', 0.9);
        
        // Node labels (clickable for article nodes)
        node.each(function(d) {
            const nodeGroup = d3.select(this);
            
            if (d.data.layer === 0 && (d.data.article_url || d.data.article_hn_url)) {
                // For article nodes with URLs, create clickable text with proper link handling
                const textElement = nodeGroup.append('text')
                    .attr('dy', '0.31em')
                    .attr('x', d.children ? -15 : 18)
                    .style('text-anchor', d.children ? 'end' : 'start')
                    .style('font-weight', '400')
                    .style('font-size', '10px')
                    .style('fill', '#2563eb') // Blue color for links
                    .style('text-decoration', 'underline')
                    .style('cursor', 'pointer')
                    .style('pointer-events', 'all') // Ensure text captures pointer events
                    .text(() => {
                        const label = d.data.label;
                        const maxLen = 25;
                        return label.length > maxLen ? label.substring(0, maxLen - 3) + '...' : label;
                    })
                    .attr('title', d.data.label)
                    .on('click', function(event) {
                        event.stopPropagation(); // Prevent path highlighting
                        const url = d.data.article_url || d.data.article_hn_url;
                        window.open(url, '_blank', 'noopener,noreferrer');
                    });
            } else {
                // Regular non-clickable text for concept nodes
                nodeGroup.append('text')
                    .attr('dy', '0.31em')
                    .attr('x', d.children ? -15 : 18)
                    .style('text-anchor', d.children ? 'end' : 'start')
                    .style('font-weight', d.data.layer === 0 ? '400' : '500')
                    .style('font-size', d.data.layer === 0 ? '10px' : '11px')
                    .text(() => {
                        const label = d.data.label;
                        let maxLen;
                        if (d.children) {
                            maxLen = 18; // Shorter for left-side (parent) nodes
                        } else {
                            maxLen = d.data.layer === 0 ? 25 : 30;
                        }
                        return label.length > maxLen ? label.substring(0, maxLen - 3) + '...' : label;
                    })
                    .attr('title', d.data.label);
            }
        });
        
        // Add tooltips on hover
        node.append('title')
            .text(d => {
                if (d.data.layer === 0) {
                    let tooltip = `Article: ${d.data.article_title || d.data.label}`;
                    if (d.data.article_url) {
                        tooltip += `\nURL: ${d.data.article_url}`;
                    } else if (d.data.article_hn_url) {
                        tooltip += `\nHN Discussion: ${d.data.article_hn_url}`;
                    }
                    tooltip += `\n\nClick link to open article\nClick circle to highlight path`;
                    return tooltip;
                }
                let tooltip = `Layer ${d.data.layer}: ${d.data.label}`;
                if (d.data.article_title) {
                    tooltip += `\nArticle: ${d.data.article_title}`;
                }
                if (d.children) {
                    tooltip += `\nChildren: ${d.children.length}`;
                }
                tooltip += `\n\nClick to highlight path / Click again to reset`;
                return tooltip;
            });
    }

    /**
     * Clear path highlighting
     */
    function clearPathHighlight(svgGroup) {
        svgGroup.selectAll('.concept-node').classed('highlighted dimmed', false);
        svgGroup.selectAll('.concept-link').classed('highlighted dimmed', false);
        isPathHighlighted = false;
    }

    /**
     * Highlight path from clicked node to root
     */
    function highlightPathToRoot(clickedNode, treeData, svgGroup) {
        // Clear previous highlights
        clearPathHighlight(svgGroup);
        
        // Get path to root
        const pathNodes = [];
        let current = clickedNode;
        while (current) {
            pathNodes.push(current.data.id);
            current = current.parent;
        }
        
        // Create set of path node IDs for quick lookup
        const pathNodeSet = new Set(pathNodes);
        
        // Highlight nodes in path, dim others
        svgGroup.selectAll('.concept-node').classed('highlighted', function() {
            const nodeId = d3.select(this).attr('data-node-id');
            return pathNodeSet.has(nodeId);
        }).classed('dimmed', function() {
            const nodeId = d3.select(this).attr('data-node-id');
            return !pathNodeSet.has(nodeId);
        });
        
        // Highlight links in path, dim others
        svgGroup.selectAll('.concept-link').classed('highlighted', function() {
            const sourceId = d3.select(this).attr('data-source-id');
            const targetId = d3.select(this).attr('data-target-id');
            // A link is in the path if both source and target are in path
            return pathNodeSet.has(sourceId) && pathNodeSet.has(targetId);
        }).classed('dimmed', function() {
            const sourceId = d3.select(this).attr('data-source-id');
            const targetId = d3.select(this).attr('data-target-id');
            return !(pathNodeSet.has(sourceId) && pathNodeSet.has(targetId));
        });
        
        // Mark as highlighted
        isPathHighlighted = true;
    }

    /**
     * Hide cluster details panel (deprecated - kept for compatibility)
     */
    function hideClusterDetails() {
        hideClusterView();
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
