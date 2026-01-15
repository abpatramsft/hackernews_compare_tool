from fastapi import APIRouter, HTTPException
from app.models import SearchRequest, SearchResponse, TweetStats
from app.services.hackernews_service import hackernews_service

router = APIRouter(prefix="/twitter", tags=["hackernews"])


@router.post("/search", response_model=SearchResponse)
async def search_stories(request: SearchRequest):
    """
    Search for Hacker News stories on a given topic from the last 5 days.

    Args:
        request: SearchRequest with query and section

    Returns:
        SearchResponse with stories (as tweets for compatibility), stats, and search_id
    """
    try:
        stories, stats, search_id = await hackernews_service.search_stories(
            query=request.query,
            section=request.section,
            limit=100,
            days=5
        )

        return SearchResponse(
            tweets=stories,  # Keep tweets field for backward compatibility
            stories=stories,  # New field
            stats=stats,
            search_id=search_id
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error searching Hacker News: {str(e)}")


@router.get("/stats/{search_id}", response_model=TweetStats)
async def get_stats(search_id: str):
    """
    Get statistics for a previous search.

    Args:
        search_id: Search ID from previous search

    Returns:
        TweetStats object (contains StoryStats)
    """
    try:
        stats = hackernews_service.get_cached_stats(search_id)

        if stats.count == 0:
            raise HTTPException(status_code=404, detail="Search ID not found or no stories available")

        return stats

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error retrieving stats: {str(e)}")
