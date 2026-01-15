import umap
import numpy as np
from sklearn.cluster import KMeans
from typing import List, Dict, Any
from app.models import Story, ClusterData


class ClusteringService:
    """Service for dimensionality reduction and clustering using UMAP and KMeans."""

    def __init__(self):
        """Initialize clustering service."""
        self.cluster_results: Dict[str, Dict[str, Any]] = {}

    def reduce_dimensions(self, embeddings: np.ndarray) -> np.ndarray:
        """
        Reduce embeddings to 2D using UMAP.

        Args:
            embeddings: High-dimensional embeddings (n_samples, n_features)

        Returns:
            2D embeddings (n_samples, 2)
        """
        if len(embeddings) < 2:
            return embeddings

        # Configure UMAP for dimensionality reduction
        reducer = umap.UMAP(
            n_components=2,
            n_neighbors=min(15, len(embeddings) - 1),  # Adjust for small datasets
            min_dist=0.1,
            metric='cosine',
            random_state=42
        )

        print(f"Reducing {embeddings.shape} to 2D using UMAP...")
        embedding_2d = reducer.fit_transform(embeddings)
        print(f"UMAP reduction complete: {embedding_2d.shape}")

        return embedding_2d

    def cluster_kmeans(self, embedding_2d: np.ndarray, n_clusters: int) -> np.ndarray:
        """
        Cluster 2D embeddings using KMeans.

        Args:
            embedding_2d: 2D embeddings (n_samples, 2)
            n_clusters: Number of clusters

        Returns:
            Cluster labels array
        """
        # Ensure n_clusters is valid
        n_clusters = min(n_clusters, len(embedding_2d))
        n_clusters = max(2, n_clusters)  # At least 2 clusters

        clusterer = KMeans(
            n_clusters=n_clusters,
            random_state=42,
            n_init=10
        )

        print(f"Clustering with KMeans (n_clusters={n_clusters})...")
        labels = clusterer.fit_predict(embedding_2d)
        print(f"KMeans clustering complete: {n_clusters} clusters")

        return labels

    def determine_optimal_clusters(self, n_samples: int) -> int:
        """
        Determine optimal number of clusters based on sample size.

        Args:
            n_samples: Number of samples

        Returns:
            Optimal number of clusters
        """
        if n_samples < 5:
            return max(1, n_samples)
        elif n_samples < 10:
            return 2
        elif n_samples < 20:
            return 3
        elif n_samples < 50:
            return 4
        elif n_samples < 100:
            return 5
        else:
            # Use elbow method approximation: sqrt(n/2)
            return min(10, max(5, int(np.sqrt(n_samples / 2))))

    def generate_colors(self, n_clusters: int) -> Dict[int, str]:
        """
        Generate distinct colors for clusters.

        Args:
            n_clusters: Number of clusters

        Returns:
            Dictionary mapping cluster labels to hex color codes
        """
        # Predefined color palette
        colors = [
            '#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8',
            '#F7DC6F', '#BB8FCE', '#85C1E2', '#F8B739', '#52B788',
            '#E63946', '#A8DADC', '#457B9D', '#F1FAEE', '#E76F51'
        ]

        # Create color map
        color_map = {}

        # Assign colors to clusters (KMeans doesn't have noise points, so all labels are >= 0)
        for i in range(n_clusters):
            color_map[i] = colors[i % len(colors)]

        return color_map

    def analyze_and_cluster(
        self,
        search_id: str,
        embeddings: np.ndarray,
        stories: List[Story],
        algorithm: str = 'kmeans',
        n_clusters: int = None
    ) -> ClusterData:
        """
        Perform complete analysis: dimensionality reduction and clustering.

        Args:
            search_id: Unique search identifier
            embeddings: High-dimensional embeddings
            stories: List of Story objects
            algorithm: Clustering algorithm (only 'kmeans' is supported)
            n_clusters: Number of clusters (auto-determined if not provided)

        Returns:
            ClusterData object for visualization
        """
        # Reduce dimensions to 2D
        embedding_2d = self.reduce_dimensions(embeddings)

        # Determine number of clusters if not provided
        if n_clusters is None:
            n_clusters = self.determine_optimal_clusters(len(embedding_2d))
            print(f"Auto-determining clusters: {n_clusters}")

        # Perform clustering (only KMeans is supported)
        if algorithm != 'kmeans':
            print(f"Warning: Only 'kmeans' algorithm is supported. Using KMeans instead of '{algorithm}'.")
        
        labels = self.cluster_kmeans(embedding_2d, n_clusters)

        # Generate color map
        unique_labels = set(labels)
        n_clusters_found = len(unique_labels)
        color_map = self.generate_colors(n_clusters_found)

        # Prepare cluster info
        cluster_info = {}
        for label in unique_labels:
            cluster_stories_list = [stories[i] for i, l in enumerate(labels) if l == label]
            # Calculate average score (support both score and likes fields)
            avg_score = 0
            if cluster_stories_list:
                scores = []
                for s in cluster_stories_list:
                    if hasattr(s, 'score'):
                        scores.append(s.score)
                    elif hasattr(s, 'likes'):
                        scores.append(s.likes)
                avg_score = sum(scores) / len(scores) if scores else 0
            
            cluster_info[int(label)] = {
                'size': len(cluster_stories_list),
                'avg_likes': avg_score,  # Keep field name for compatibility
                'label': f"Cluster {label}"
            }

        # Create ClusterData for visualization
        # Use title if available, otherwise text
        story_texts = []
        for story in stories:
            if hasattr(story, 'title') and story.title:
                story_texts.append(story.title)
            else:
                story_texts.append(story.text)
        
        cluster_data = ClusterData(
            x=embedding_2d[:, 0].tolist(),
            y=embedding_2d[:, 1].tolist(),
            cluster_labels=[int(l) for l in labels],
            story_texts=story_texts,
            story_ids=[story.id for story in stories],
            story_urls=[story.url or story.hn_url for story in stories],
            colors=[color_map[int(l)] for l in labels],
            cluster_info=cluster_info
        )

        # Cache results
        self.cluster_results[search_id] = {
            'cluster_data': cluster_data,
            'labels': labels,
            'embedding_2d': embedding_2d
        }

        return cluster_data

    def get_cluster_results(self, search_id: str) -> Dict[str, Any]:
        """
        Retrieve cached cluster results.

        Args:
            search_id: Search ID

        Returns:
            Cluster results dictionary
        """
        return self.cluster_results.get(search_id, {})


# Global clustering service instance
clustering_service = ClusteringService()
