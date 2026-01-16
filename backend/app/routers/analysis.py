from fastapi import APIRouter, HTTPException
from app.models import (
    EmbedRequest, EmbedResponse,
    ClusterRequest, ClusterResponse,
    SummaryRequest, SummaryResponse,
    ClusterGraphRequest, ClusterGraphResponse,
    ConceptGraphRequest, ConceptGraphResponse, ConceptGraphNode
)
from app.services.hackernews_service import hackernews_service
from app.services.embedding_service import embedding_service
from app.services.clustering_service import clustering_service
from app.services.llm_service import llm_service
from app.services.concept_graph_service import concept_graph_service

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
            story_count=len(stories),
            message=f"Successfully generated embeddings for {len(stories)} stories"
        )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error generating embeddings: {str(e)}")


@router.post("/cluster", response_model=ClusterResponse)
async def cluster_stories(request: ClusterRequest):
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
            stories=stories,
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
        raise HTTPException(status_code=500, detail=f"Error clustering stories: {str(e)}")


@router.post("/summarize", response_model=SummaryResponse)
async def summarize_cluster(request: SummaryRequest):
    """
    Generate a title and summary for a cluster using LLM.

    Args:
        request: SummaryRequest with search_id, cluster_id, and story_ids

    Returns:
        SummaryResponse with title and summary
    """
    try:
        # Retrieve stories from cache
        all_stories = hackernews_service.get_cached_stories(request.search_id)

        if not all_stories:
            raise HTTPException(status_code=404, detail="Search ID not found")

        # Filter stories by IDs in the cluster
        cluster_stories = [s for s in all_stories if s.id in request.story_ids]

        if not cluster_stories:
            raise HTTPException(status_code=404, detail="No stories found for the given IDs")

        # Generate summary using LLM (with caching)
        summary_data = llm_service.generate_cluster_summary(
            cluster_stories, 
            request.cluster_id,
            search_id=request.search_id,
            story_ids=request.story_ids
        )

        return SummaryResponse(
            title=summary_data["title"],
            summary=summary_data["summary"],
            story_count=len(cluster_stories)
        )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error generating summary: {str(e)}")


@router.post("/cluster-graph", response_model=ClusterGraphResponse)
async def generate_cluster_graph(request: ClusterGraphRequest):
    """
    Generate a cluster similarity graph for knowledge graph visualization.

    Args:
        request: ClusterGraphRequest with search_id

    Returns:
        ClusterGraphResponse with node and edge data for graph visualization
    """
    try:
        # Check if clustering has been performed
        cluster_results = clustering_service.get_cluster_results(request.search_id)
        
        if not cluster_results:
            raise HTTPException(
                status_code=404,
                detail="No cluster results found for this search_id. Call /cluster first."
            )

        # Calculate cluster graph
        graph_data_dict = clustering_service.calculate_cluster_graph(request.search_id)

        # Build response
        from app.models import ClusterGraphData, ClusterGraphNode, ClusterGraphEdge
        
        nodes = [ClusterGraphNode(**node) for node in graph_data_dict['nodes']]
        edges = [ClusterGraphEdge(**edge) for edge in graph_data_dict['edges']]
        
        graph_data = ClusterGraphData(
            nodes=nodes,
            edges=edges,
            n_clusters=graph_data_dict['n_clusters']
        )

        return ClusterGraphResponse(
            success=True,
            graph_data=graph_data,
            message=f"Successfully generated graph for {graph_data_dict['n_clusters']} clusters"
        )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error generating cluster graph: {str(e)}")


@router.post("/concept-graph", response_model=ConceptGraphResponse)
async def generate_concept_graph(request: ConceptGraphRequest):
    """
    Generate hierarchical concept graph for a specific cluster.
    
    Extracts technical concepts from articles, recursively aggregates them
    into broader themes, and builds a hierarchical tree structure.
    
    Args:
        request: ConceptGraphRequest with search_id and cluster_id
        
    Returns:
        ConceptGraphResponse with hierarchical concept nodes
    """
    try:
        # Check if clustering has been performed
        cluster_results = clustering_service.get_cluster_results(request.search_id)
        
        if not cluster_results:
            raise HTTPException(
                status_code=404,
                detail="No cluster results found for this search_id. Call /cluster first."
            )
        
        # Get stories and labels
        stories = cluster_results['stories']
        labels = cluster_results['labels']
        
        # Filter stories for this cluster
        cluster_stories = [
            story for story, label in zip(stories, labels)
            if label == request.cluster_id
        ]
        
        if not cluster_stories:
            raise HTTPException(
                status_code=404,
                detail=f"No stories found for cluster {request.cluster_id}"
            )
        
        # Sort by score descending and take top 50
        cluster_stories.sort(key=lambda s: s.score, reverse=True)
        top_stories = cluster_stories[:50]
        
        print(f"Generating concept graph for cluster {request.cluster_id} with {len(top_stories)} stories (out of {len(cluster_stories)} total)")
        
        # Build concept tree
        result = concept_graph_service.build_concept_tree(
            stories=top_stories,
            search_id=request.search_id,
            cluster_id=request.cluster_id
        )
        
        # Convert to response model
        nodes = [ConceptGraphNode(**node) for node in result['nodes']]
        
        return ConceptGraphResponse(
            success=True,
            nodes=nodes,
            root_id=result['root_id'],
            layer_count=result['layer_count'],
            message=f"Successfully generated concept graph with {len(nodes)} concepts across {result['layer_count']} layers"
        )
    
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Error generating concept graph: {str(e)}")

