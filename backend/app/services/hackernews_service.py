import asyncio
from datetime import datetime, timedelta
from typing import List, Dict, Any, Optional
from urllib.parse import urlparse
import httpx
import uuid
from bs4 import BeautifulSoup
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
            "hitsPerPage": min(limit, settings.MAX_STORIES_PER_SEARCH),
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

    def _extract_domain(self, url: str) -> Optional[str]:
        """Return hostname without www from a URL."""
        if not url:
            return None
        try:
            parsed = urlparse(url)
            return parsed.netloc.replace("www.", "")
        except Exception:
            return None

    async def _fetch_article_content(self, url: str, timeout: float = 10.0) -> Dict[str, Any]:
        """Fetch and extract article content from a URL."""
        if not url:
            return {"success": False, "error": "No URL provided"}

        try:
            async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
                headers = {
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
                }
                response = await client.get(url, headers=headers)
                response.raise_for_status()

                soup = BeautifulSoup(response.text, "html.parser")

                # Strip out noise
                for tag in soup(["script", "style", "nav", "header", "footer", "aside", "ads"]):
                    tag.decompose()

                # Title extraction
                title = None
                if soup.title:
                    title = soup.title.string
                elif soup.find("h1"):
                    title = soup.find("h1").get_text(strip=True)

                # Content extraction
                content = ""
                article = soup.find("article")
                if article:
                    content = article.get_text(separator="\n", strip=True)
                else:
                    for selector in ["main", ".content", ".post-content", ".article-body", "#content"]:
                        elem = soup.select_one(selector)
                        if elem:
                            content = elem.get_text(separator="\n", strip=True)
                            break

                    if not content and soup.body:
                        content = soup.body.get_text(separator="\n", strip=True)

                lines = [line.strip() for line in content.split("\n") if line.strip()]
                content = "\n".join(lines)

                max_chars = 5000
                if len(content) > max_chars:
                    content = content[:max_chars] + "... [truncated]"

                return {
                    "success": True,
                    "title": title,
                    "content": content,
                    "content_length": len(content)
                }

        except httpx.TimeoutException:
            return {"success": False, "error": "Timeout"}
        except httpx.HTTPStatusError as e:
            return {"success": False, "error": f"HTTP {e.response.status_code}"}
        except Exception as e:
            return {"success": False, "error": str(e)}

    async def search_stories_with_content(
        self,
        query: str,
        section: str,
        limit: int = 100,
        days: int = 5
    ) -> tuple[List[Story], StoryStats, str]:
        """
        Search for Hacker News stories and fetch article content in parallel.
        Will fetch all results up to the specified limit from the lookback window.
        """
        endpoint = "search_by_date"

        params = {
            "query": query,
            "hitsPerPage": min(limit, settings.MAX_STORIES_PER_SEARCH),
            "tags": "story"
        }

        if days:
            timestamp = int((datetime.utcnow() - timedelta(days=days)).timestamp())
            params["numericFilters"] = f"created_at_i>{timestamp}"

        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(f"{ALGOLIA_URL}/{endpoint}", params=params, timeout=30.0)
                response.raise_for_status()
                data = response.json()

            hits = data.get("hits", [])
            urls = [hit.get("url") for hit in hits]

            content_results = await asyncio.gather(
                *(self._fetch_article_content(url) for url in urls),
                return_exceptions=True
            )

            stories = []
            for idx, hit in enumerate(hits):
                url = hit.get("url")
                content_data = content_results[idx]

                # Normalize exception into error dict
                if isinstance(content_data, Exception):
                    content_data = {"success": False, "error": str(content_data)}

                created_at_str = hit.get("created_at")
                if created_at_str:
                    try:
                        if created_at_str.endswith("Z"):
                            created_at_str = created_at_str.replace("Z", "+00:00")
                        created_at = datetime.fromisoformat(created_at_str)
                    except (ValueError, AttributeError):
                        created_at = datetime.utcnow()
                else:
                    created_at = datetime.utcnow()

                content_text = content_data.get("content") if content_data.get("success") else None

                story = Story(
                    id=str(hit.get("objectID", "")),
                    title=hit.get("title", ""),
                    text=content_text or hit.get("title", ""),
                    url=url,
                    domain=self._extract_domain(url),
                    score=hit.get("points", 0),
                    author=hit.get("author", ""),
                    created_at=created_at,
                    comments_count=hit.get("num_comments", 0),
                    hn_url=f"https://news.ycombinator.com/item?id={hit.get('objectID')}",
                    content=content_text,
                    content_fetch_success=content_data.get("success"),
                    content_fetch_error=content_data.get("error") if not content_data.get("success") else None
                )
                stories.append(story)

            stats = self._calculate_stats(stories)
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
            return [], StoryStats(count=0, most_upvoted=None), f"{section}_{query}_error"
        except Exception as e:
            print(f"Unexpected error: {e}")
            return [], StoryStats(count=0, most_upvoted=None), f"{section}_{query}_error"

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
