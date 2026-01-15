from datetime import datetime, timedelta
from typing import List, Dict, Any
import httpx
import uuid
from app.config import settings
from app.models import Story, StoryStats

ALGOLIA_URL = "https://hn.algolia.com/api/v1"


class HackerNewsService:
    """Service for interacting with Hacker News API via Algolia."""

    def __init__(self):
        """Initialize Hacker News API client."""
        self.cache: Dict[str, Dict[str, Any]] = {}

    async def search_stories(
        self, 
        query: str, 
        section: str,
        limit: int = 100,
        days: int = 5
    ) -> tuple[List[Story], StoryStats, str]:
        """
        Search for Hacker News stories on a given topic.

        Args:
            query: Search query string
            section: Section identifier (top or bottom)
            limit: Maximum number of results (default 100)
            days: Number of days to look back (default 5)

        Returns:
            Tuple of (stories list, stats, search_id)
        """
        endpoint = "search_by_date"
        
        params = {
            "query": query,
            "hitsPerPage": min(limit, settings.MAX_TWEETS_PER_SEARCH),
            "tags": "story"  # Only stories, not comments
        }
        
        # Add date filter
        if days:
            timestamp = int((datetime.utcnow() - timedelta(days=days)).timestamp())
            params["numericFilters"] = f"created_at_i>{timestamp}"

        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(f"{ALGOLIA_URL}/{endpoint}", params=params, timeout=30.0)
                response.raise_for_status()
                data = response.json()

                # Process stories
                stories = []
                if data.get("hits"):
                    for hit in data.get("hits", []):
                        # Parse created_at date
                        created_at_str = hit.get("created_at")
                        if created_at_str:
                            # Handle ISO format with or without timezone
                            try:
                                if created_at_str.endswith("Z"):
                                    created_at_str = created_at_str.replace("Z", "+00:00")
                                created_at = datetime.fromisoformat(created_at_str)
                            except (ValueError, AttributeError):
                                # Fallback to current time if parsing fails
                                created_at = datetime.utcnow()
                        else:
                            created_at = datetime.utcnow()
                        
                        story = Story(
                            id=str(hit.get("objectID", "")),
                            title=hit.get("title", ""),
                            text=hit.get("title", ""),  # Use title as text for embedding
                            url=hit.get("url"),
                            score=hit.get("points", 0),
                            author=hit.get("author", ""),
                            created_at=created_at,
                            comments_count=hit.get("num_comments", 0),
                            hn_url=f"https://news.ycombinator.com/item?id={hit.get('objectID')}"
                        )
                        stories.append(story)

                # Calculate statistics
                stats = self._calculate_stats(stories)

                # Generate search ID and cache results
                search_id = f"{section}_{query}_{uuid.uuid4().hex[:8]}"
                self.cache[search_id] = {
                    'stories': stories,
                    'stats': stats,
                    'query': query,
                    'section': section,
                    'timestamp': datetime.utcnow()
                }

                return stories, stats, search_id

        except httpx.HTTPError as e:
            print(f"Hacker News API Error: {e}")
            # Return empty results on error
            return [], StoryStats(count=0, most_upvoted=None), f"{section}_{query}_error"
        except Exception as e:
            print(f"Unexpected error: {e}")
            return [], StoryStats(count=0, most_upvoted=None), f"{section}_{query}_error"

    def _calculate_stats(self, stories: List[Story]) -> StoryStats:
        """
        Calculate statistics for a list of stories.

        Args:
            stories: List of Story objects

        Returns:
            StoryStats object
        """
        if not stories:
            return StoryStats(count=0, most_upvoted=None)

        # Find most upvoted story
        most_upvoted = max(stories, key=lambda s: s.score)

        return StoryStats(
            count=len(stories),
            most_upvoted=most_upvoted
        )

    def get_cached_stories(self, search_id: str) -> List[Story]:
        """
        Retrieve cached stories by search ID.

        Args:
            search_id: Search ID from previous search

        Returns:
            List of Story objects
        """
        if search_id in self.cache:
            return self.cache[search_id]['stories']
        return []

    def get_cached_stats(self, search_id: str) -> StoryStats:
        """
        Retrieve cached stats by search ID.

        Args:
            search_id: Search ID from previous search

        Returns:
            StoryStats object
        """
        if search_id in self.cache:
            return self.cache[search_id]['stats']
        return StoryStats(count=0, most_upvoted=None)

    def clear_old_cache(self, max_age_hours: int = 24):
        """
        Clear cache entries older than specified hours.

        Args:
            max_age_hours: Maximum age in hours before clearing
        """
        current_time = datetime.utcnow()
        expired_keys = []

        for search_id, data in self.cache.items():
            if (current_time - data['timestamp']).total_seconds() > (max_age_hours * 3600):
                expired_keys.append(search_id)

        for key in expired_keys:
            del self.cache[key]


# Global Hacker News service instance
hackernews_service = HackerNewsService()
