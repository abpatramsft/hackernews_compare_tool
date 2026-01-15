from fastapi import APIRouter, HTTPException
from app.models import (
    EmbedRequest, EmbedResponse,
    ClusterRequest, ClusterResponse,
    SummaryRequest, SummaryResponse
)
from app.services.hackernews_service import hackernews_service
from app.services.embedding_service import embedding_service
from app.services.clustering_service import clustering_service
from app.services.llm_service import llm_service

router = APIRouter(prefix="/analysis", tags=["analysis"])


@router.post("/embed", response_model=EmbedResponse)
async def generate_embeddings(request: EmbedRequest):
    """
    Generate embeddings for stories from a search.

    Args:
        request: EmbedRequest with search_id

    Returns:
        EmbedResponse with completion status
    """
    try:
        # Retrieve stories from cache
        stories = hackernews_service.get_cached_stories(request.search_id)

        if not stories:
            raise HTTPException(status_code=404, detail="Search ID not found or no stories available")

        # Generate embeddings
        embeddings = embedding_service.generate_embeddings(stories, request.search_id)

        return EmbedResponse(
            embedding_complete=True,
            tweet_count=len(stories),  # Keep for backward compatibility
            story_count=len(stories),
            message=f"Successfully generated embeddings for {len(stories)} stories"
        )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error generating embeddings: {str(e)}")


@router.post("/cluster", response_model=ClusterResponse)
async def cluster_tweets(request: ClusterRequest):
    """
    Perform UMAP dimensionality reduction and clustering on embedded stories.

    Args:
        request: ClusterRequest with search_id, algorithm, and optional n_clusters

    Returns:
        ClusterResponse with visualization data
    """
    try:
        # Retrieve stories and embeddings
        stories = hackernews_service.get_cached_stories(request.search_id)
        embeddings = embedding_service.get_embeddings(request.search_id)

        if not stories or len(embeddings) == 0:
            raise HTTPException(
                status_code=404,
                detail="Search ID not found or embeddings not generated. Call /embed first."
            )

        # Check minimum stories for clustering
        if len(stories) < 2:
            return ClusterResponse(
                success=False,
                visualization_data=None,
                message=f"Not enough stories for clustering (found {len(stories)}, need at least 2)"
            )

        # Perform clustering analysis
        cluster_data = clustering_service.analyze_and_cluster(
            search_id=request.search_id,
            embeddings=embeddings,
            tweets=stories,  # Pass stories as tweets (they're compatible)
            algorithm=request.algorithm,
            n_clusters=request.n_clusters
        )

        return ClusterResponse(
            success=True,
            visualization_data=cluster_data,
            message=f"Successfully clustered {len(stories)} stories"
        )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error clustering tweets: {str(e)}")


@router.post("/summarize", response_model=SummaryResponse)
async def summarize_cluster(request: SummaryRequest):
    """
    Generate a title and summary for a cluster using LLM.

    Args:
        request: SummaryRequest with search_id, cluster_id, and tweet_ids (story IDs)

    Returns:
        SummaryResponse with title and summary
    """
    try:
        # Retrieve stories from cache
        all_stories = hackernews_service.get_cached_stories(request.search_id)

        if not all_stories:
            raise HTTPException(status_code=404, detail="Search ID not found")

        # Filter stories by IDs in the cluster
        cluster_stories = [s for s in all_stories if s.id in request.tweet_ids]

        if not cluster_stories:
            raise HTTPException(status_code=404, detail="No stories found for the given IDs")

        # Generate summary using LLM (with caching)
        summary_data = llm_service.generate_cluster_summary(
            cluster_stories, 
            request.cluster_id,
            search_id=request.search_id,
            tweet_ids=request.tweet_ids
        )

        return SummaryResponse(
            title=summary_data["title"],
            summary=summary_data["summary"],
            tweet_count=len(cluster_stories)
        )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error generating summary: {str(e)}")
