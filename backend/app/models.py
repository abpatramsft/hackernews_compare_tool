from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime


class Story(BaseModel):
    """Model representing a Hacker News story."""
    id: str
    title: str
    text: str  # Used for embedding (title or text content)
    url: Optional[str] = None
    score: int = 0
    author: str
    created_at: datetime
    comments_count: int = 0
    hn_url: Optional[str] = None


# Alias for backward compatibility with existing code
Tweet = Story


class StoryStats(BaseModel):
    """Statistics for a collection of stories."""
    count: int
    most_upvoted: Optional[Story] = None


# Alias for backward compatibility
TweetStats = StoryStats


class SearchRequest(BaseModel):
    """Request model for searching stories."""
    query: str = Field(..., description="Search query for Hacker News")
    section: str = Field(..., description="Section identifier (top or bottom)")


class SearchResponse(BaseModel):
    """Response model for story search."""
    tweets: List[Tweet]  # Keep tweets for backward compatibility
    stories: List[Story] = Field(default_factory=list)  # New field
    stats: TweetStats
    search_id: str


class EmbedRequest(BaseModel):
    """Request model for generating embeddings."""
    search_id: str = Field(..., description="Search ID from previous search")


class EmbedResponse(BaseModel):
    """Response model for embedding generation."""
    embedding_complete: bool
    tweet_count: int  # Keep for backward compatibility
    story_count: int = Field(default=0)  # New field
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
    tweet_texts: List[str] = Field(..., description="Story/tweet text for each point")
    tweet_ids: List[str] = Field(..., description="Story/tweet ID for each point")
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
    tweet_ids: List[str] = Field(..., description="List of story/tweet IDs in the cluster")


class SummaryResponse(BaseModel):
    """Response model for cluster summary."""
    title: str = Field(..., description="Generated title for the cluster")
    summary: str = Field(..., description="Summary of stories in the cluster")
    tweet_count: int = Field(..., description="Number of stories in the cluster")


class HealthResponse(BaseModel):
    """Health check response."""
    status: str
    message: str
