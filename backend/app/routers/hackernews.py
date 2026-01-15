from fastapi import APIRouter, HTTPException
from app.models import SearchRequest, SearchResponse, SearchWithContentRequest, StoryStats
from app.services.hackernews_service import hackernews_service

router = APIRouter(prefix="/hackernews", tags=["hackernews"])


@router.post("/search", response_model=SearchResponse)
async def search_stories(request: SearchRequest):
    """
    Search for Hacker News stories on a given topic from the last 5 days.

    Args:
        request: SearchRequest with query and section

    Returns:
        SearchResponse with stories, stats, and search_id
    """
    try:
        stories, stats, search_id = await hackernews_service.search_stories(
            query=request.query,
            section=request.section,
            limit=100,
            days=5
        )

        return SearchResponse(
            stories=stories,
            stats=stats,
            search_id=search_id
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error searching Hacker News: {str(e)}")


@router.post("/search_with_content", response_model=SearchResponse)
async def search_stories_with_content(request: SearchWithContentRequest):
    """
    Search for Hacker News stories and fetch article content in parallel.

    Args:
        request: SearchWithContentRequest with query, section, limit, and days

    Returns:
        SearchResponse with stories including content fields, stats, and search_id
    """
    try:
        stories, stats, search_id = await hackernews_service.search_stories_with_content(
            query=request.query,
            section=request.section,
            limit=request.limit,
            days=request.days
        )

        return SearchResponse(
            stories=stories,
            stats=stats,
            search_id=search_id
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error searching Hacker News with content: {str(e)}")


@router.get("/stats/{search_id}", response_model=StoryStats)
async def get_stats(search_id: str):
    """
    Get statistics for a previous search.

    Args:
        search_id: Search ID from previous search

    Returns:
        StoryStats object
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
