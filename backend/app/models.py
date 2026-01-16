from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime


class Story(BaseModel):
    """Model representing a Hacker News story."""
    id: str
    title: str
    text: str  # Used for embedding (title or text content)
    url: Optional[str] = None
    domain: Optional[str] = None
    score: int = 0
    author: str
    created_at: datetime
    comments_count: int = 0
    hn_url: Optional[str] = None
    content: Optional[str] = None
    content_fetch_success: Optional[bool] = None
    content_fetch_error: Optional[str] = None


class StoryStats(BaseModel):
    """Statistics for a collection of stories."""
    count: int
    most_upvoted: Optional[Story] = None


class SearchRequest(BaseModel):
    """Request model for searching stories."""
    query: str = Field(..., description="Search query for Hacker News")
    section: str = Field(..., description="Section identifier (top or bottom)")


class SearchWithContentRequest(SearchRequest):
    """Request model for searching stories and fetching article content."""
    limit: int = Field(100, ge=1, le=1000, description="Number of stories to fetch (up to MAX_STORIES_PER_SEARCH)")
    days: int = Field(5, ge=1, le=365, description="Lookback window in days")


class SearchResponse(BaseModel):
    """Response model for story search."""
    stories: List[Story]
    stats: StoryStats
    search_id: str


class EmbedRequest(BaseModel):
    """Request model for generating embeddings."""
    search_id: str = Field(..., description="Search ID from previous search")


class EmbedResponse(BaseModel):
    """Response model for embedding generation."""
    embedding_complete: bool
    story_count: int
    message: str


class ClusterRequest(BaseModel):
    """Request model for clustering analysis."""
    search_id: str = Field(..., description="Search ID to cluster")
    algorithm: str = Field(default="kmeans", description="Clustering algorithm (only kmeans is supported)")
    n_clusters: Optional[int] = Field(default=None, description="Number of clusters (auto-determined if not provided)")


class ClusterData(BaseModel):
    """Data structure for cluster visualization."""
    x: List[float] = Field(..., description="X coordinates (UMAP dimension 1)")
    y: List[float] = Field(..., description="Y coordinates (UMAP dimension 2)")
    cluster_labels: List[int] = Field(..., description="Cluster label for each point")
    story_texts: List[str] = Field(..., description="Story text for each point")
    story_ids: List[str] = Field(..., description="Story ID for each point")
    story_urls: List[Optional[str]] = Field(..., description="Story URL for each point")
    colors: List[str] = Field(..., description="Color for each point")
    cluster_info: Dict[int, Dict[str, Any]] = Field(..., description="Info about each cluster")


class ClusterResponse(BaseModel):
    """Response model for clustering."""
    success: bool
    visualization_data: Optional[ClusterData] = None
    message: str


class SummaryRequest(BaseModel):
    """Request model for cluster summarization."""
    search_id: str = Field(..., description="Search ID")
    cluster_id: int = Field(..., description="Cluster ID to summarize")
    story_ids: List[str] = Field(..., description="List of story IDs in the cluster")


class SummaryResponse(BaseModel):
    """Response model for cluster summary."""
    title: str = Field(..., description="Generated title for the cluster")
    summary: str = Field(..., description="Summary of stories in the cluster")
    story_count: int = Field(..., description="Number of stories in the cluster")


class ClusterGraphNode(BaseModel):
    """Represents a node in the cluster graph (a cluster)."""
    id: int = Field(..., description="Cluster ID")
    label: str = Field(..., description="Cluster label")
    size: int = Field(..., description="Number of stories in cluster")
    color: str = Field(..., description="Cluster color (hex)")
    avg_engagement: float = Field(..., description="Average engagement (likes) in cluster")
    story_ids: List[str] = Field(..., description="List of story IDs in this cluster")


class ClusterGraphEdge(BaseModel):
    """Represents an edge between two clusters (similarity connection)."""
    source: int = Field(..., description="Source cluster ID")
    target: int = Field(..., description="Target cluster ID")
    similarity: float = Field(..., ge=0, le=1, description="Cosine similarity between clusters (0-1)")


class ClusterGraphData(BaseModel):
    """Data structure for cluster similarity graph visualization."""
    nodes: List[ClusterGraphNode] = Field(..., description="List of cluster nodes")
    edges: List[ClusterGraphEdge] = Field(..., description="List of similarity edges between clusters")
    n_clusters: int = Field(..., description="Total number of clusters")


class ClusterGraphRequest(BaseModel):
    """Request model for cluster graph."""
    search_id: str = Field(..., description="Search ID with clustered results")


class ClusterGraphResponse(BaseModel):
    """Response model for cluster graph."""
    success: bool = Field(..., description="Whether graph generation succeeded")
    graph_data: Optional[ClusterGraphData] = None
    message: str = Field(..., description="Status message")


class ConceptGraphNode(BaseModel):
    """Represents a node in the concept graph hierarchy."""
    id: str = Field(..., description="Unique node identifier")
    label: str = Field(..., description="Concept label")
    layer: int = Field(..., description="Layer in hierarchy (1=article concepts, higher=aggregated)")
    children: List[str] = Field(default_factory=list, description="List of child node IDs")
    parent: Optional[str] = Field(None, description="Parent node ID")
    article_id: Optional[str] = Field(None, description="Article ID (for layer 0 article nodes)")
    article_title: Optional[str] = Field(None, description="Article title (for layer 0 article nodes)")
    article_url: Optional[str] = Field(None, description="Article URL (for layer 0 article nodes)")
    article_hn_url: Optional[str] = Field(None, description="HN discussion URL (for layer 0 article nodes)")


class ConceptGraphRequest(BaseModel):
    """Request model for concept graph generation."""
    search_id: str = Field(..., description="Search ID with clustered results")
    cluster_id: int = Field(..., description="Cluster ID to generate concept graph for")


class ConceptGraphResponse(BaseModel):
    """Response model for concept graph."""
    success: bool = Field(..., description="Whether graph generation succeeded")
    nodes: List[ConceptGraphNode] = Field(default_factory=list, description="List of concept nodes")
    root_id: Optional[str] = Field(None, description="Root node ID")
    layer_count: int = Field(0, description="Total number of layers in graph")
    message: str = Field(..., description="Status message")


class HealthResponse(BaseModel):
    """Health check response."""
    status: str
    message: str


