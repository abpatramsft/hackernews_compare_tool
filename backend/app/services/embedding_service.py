from sentence_transformers import SentenceTransformer
import numpy as np
from typing import List, Dict
import torch
from cachetools import LRUCache
from app.config import settings
from app.models import Tweet


class EmbeddingService:
    """Service for generating embeddings using sentence-transformers."""

    def __init__(self):
        """Initialize embedding model and cache."""
        # Determine device (GPU if available, otherwise CPU)
        self.device = 'cuda' if torch.cuda.is_available() else 'cpu'
        print(f"Embedding service using device: {self.device}")

        # Load sentence-transformers model
        self.model = SentenceTransformer('all-MiniLM-L6-v2', device=self.device)

        # Initialize cache for embeddings
        self.embedding_cache: LRUCache = LRUCache(maxsize=settings.CACHE_SIZE)

        # Storage for search embeddings
        self.search_embeddings: Dict[str, np.ndarray] = {}

    def preprocess_text(self, text: str) -> str:
        """
        Preprocess story text before embedding.

        Args:
            text: Raw story text

        Returns:
            Preprocessed text
        """
        # Remove excessive whitespace
        text = ' '.join(text.split())
        return text

    def generate_embeddings(self, stories: List[Tweet], search_id: str) -> np.ndarray:
        """
        Generate embeddings for a list of stories/tweets.

        Args:
            stories: List of Story/Tweet objects
            search_id: Unique identifier for this search

        Returns:
            numpy array of shape (n_stories, 384) containing embeddings
        """
        if not stories:
            return np.array([])

        # Check if embeddings already exist for this search
        if search_id in self.search_embeddings:
            print(f"Using cached embeddings for search_id: {search_id}")
            return self.search_embeddings[search_id]

        # Preprocess story texts (use title if available, otherwise text)
        story_texts = []
        for story in stories:
            if hasattr(story, 'title') and story.title:
                story_texts.append(self.preprocess_text(story.title))
            else:
                story_texts.append(self.preprocess_text(story.text))

        # Generate embeddings in batches
        print(f"Generating embeddings for {len(story_texts)} stories...")
        embeddings = self.model.encode(
            story_texts,
            batch_size=settings.EMBEDDING_BATCH_SIZE,
            show_progress_bar=True,
            convert_to_numpy=True,
            normalize_embeddings=True  # Normalize for better clustering
        )

        # Cache the embeddings
        self.search_embeddings[search_id] = embeddings
        print(f"Embeddings generated: shape {embeddings.shape}")

        return embeddings

    def get_embeddings(self, search_id: str) -> np.ndarray:
        """
        Retrieve cached embeddings for a search.

        Args:
            search_id: Search ID

        Returns:
            numpy array of embeddings or empty array if not found
        """
        return self.search_embeddings.get(search_id, np.array([]))

    def clear_embeddings(self, search_id: str):
        """
        Clear embeddings for a specific search from cache.

        Args:
            search_id: Search ID to clear
        """
        if search_id in self.search_embeddings:
            del self.search_embeddings[search_id]

    def get_embedding_dim(self) -> int:
        """
        Get the dimension of embeddings produced by the model.

        Returns:
            Embedding dimension (384 for all-MiniLM-L6-v2)
        """
        return self.model.get_sentence_embedding_dimension()


# Global embedding service instance
embedding_service = EmbeddingService()
