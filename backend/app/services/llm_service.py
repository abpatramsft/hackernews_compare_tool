from openai import OpenAI
import json
from typing import List, Dict, Any
from app.config import settings
from app.models import Tweet


class LLMService:
    """Service for generating cluster summaries using Azure OpenAI."""

    def __init__(self):
        """Initialize Azure OpenAI client."""
        self.client = OpenAI(
            base_url=settings.AZURE_OPENAI_ENDPOINT,
            api_key=settings.AZURE_OPENAI_API_KEY
        )
        self.deployment_name = settings.AZURE_OPENAI_DEPLOYMENT_NAME
        # Cache for cluster summaries: key = (search_id, cluster_id, story_ids_hash)
        self.summary_cache = {}

    def format_tweets_for_llm(self, tweets: List[Tweet]) -> str:
        """
        Format stories/tweets for LLM input.

        Args:
            tweets: List of Tweet/Story objects

        Returns:
            Formatted string of stories
        """
        formatted = []
        for i, story in enumerate(tweets[:20], 1):  # Limit to 20 stories to save tokens
            # Use title if available, otherwise text
            text = story.title if hasattr(story, 'title') and story.title else story.text
            score = story.score if hasattr(story, 'score') else (story.likes if hasattr(story, 'likes') else 0)
            formatted.append(f"{i}. {text} (Score: {score})")

        return "\n".join(formatted)

    def _get_cache_key(self, search_id: str, cluster_id: int, tweet_ids: List[str]) -> str:
        """
        Generate a cache key for a cluster summary.
        
        Args:
            search_id: Search ID
            cluster_id: Cluster ID
            tweet_ids: List of story/tweet IDs in the cluster (sorted for consistency)
            
        Returns:
            Cache key string
        """
        # Sort IDs to ensure consistent cache key regardless of order
        sorted_ids = sorted(tweet_ids)
        return f"{search_id}:{cluster_id}:{','.join(sorted_ids)}"

    def generate_cluster_summary(
        self, 
        tweets: List[Tweet], 
        cluster_id: int, 
        search_id: str = None,
        tweet_ids: List[str] = None
    ) -> Dict[str, str]:
        """
        Generate a title and summary for a cluster of tweets.
        Results are cached to avoid redundant LLM calls.

        Args:
            tweets: List of Tweet objects in the cluster
            cluster_id: Cluster identifier
            search_id: Optional search ID for caching
            tweet_ids: Optional list of tweet IDs for caching

        Returns:
            Dictionary with 'title' and 'summary' keys
        """
        if not tweets:
            return {
                "title": f"Empty Cluster {cluster_id}",
                "summary": "This cluster contains no tweets."
            }

        # Check cache if search_id and tweet_ids are provided
        if search_id and tweet_ids:
            cache_key = self._get_cache_key(search_id, cluster_id, tweet_ids)
            if cache_key in self.summary_cache:
                print(f"Returning cached summary for cluster {cluster_id} (search_id: {search_id})")
                return self.summary_cache[cache_key]

        # Format tweets for the prompt
        tweets_text = self.format_tweets_for_llm(tweets)

        # Create system and user prompts
        system_prompt = """You are an expert at analyzing and summarizing Hacker News discussions.
Given a cluster of stories about a topic, provide:
1. A concise title (5-8 words) that captures the main theme
2. A 2-3 sentence summary of the key points being discussed

Be objective and focus on the common themes across the stories."""

        user_prompt = f"""Analyze these {len(tweets)} stories from a cluster and provide a title and summary:

Stories:
{tweets_text}

Respond in JSON format:
{{
    "title": "...",
    "summary": "..."
}}"""

        try:
            # Call Azure OpenAI API
            response = self.client.chat.completions.create(
                model=self.deployment_name,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                temperature=0.7,
                max_tokens=300
            )

            # Extract and parse response
            response_text = response.choices[0].message.content

            # Try to parse JSON response
            try:
                result = json.loads(response_text)
                summary_data = {
                    "title": result.get("title", f"Cluster {cluster_id}"),
                    "summary": result.get("summary", "Summary not available.")
                }
            except json.JSONDecodeError:
                # If JSON parsing fails, use the raw text
                summary_data = {
                    "title": f"Cluster {cluster_id} Analysis",
                    "summary": response_text
                }

            # Cache the result if search_id and tweet_ids are provided
            if search_id and tweet_ids:
                cache_key = self._get_cache_key(search_id, cluster_id, tweet_ids)
                self.summary_cache[cache_key] = summary_data
                print(f"Cached summary for cluster {cluster_id} (search_id: {search_id})")

            return summary_data

        except Exception as e:
            print(f"Error generating summary: {e}")
            error_result = {
                "title": f"Cluster {cluster_id}",
                "summary": f"Error generating summary: {str(e)}"
            }
            # Don't cache errors
            return error_result

    def generate_batch_summaries(self, clusters: Dict[int, List[Tweet]]) -> Dict[int, Dict[str, str]]:
        """
        Generate summaries for multiple clusters.

        Args:
            clusters: Dictionary mapping cluster IDs to lists of tweets

        Returns:
            Dictionary mapping cluster IDs to summaries
        """
        summaries = {}
        for cluster_id, tweets in clusters.items():
            summaries[cluster_id] = self.generate_cluster_summary(tweets, cluster_id)

        return summaries


# Global LLM service instance
llm_service = LLMService()
