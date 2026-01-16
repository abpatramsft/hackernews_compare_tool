"""
Concept Graph Service

Builds a hierarchical concept graph from article texts by:
1. Extracting 2-4 technical concepts per article (Layer 1)
2. Recursively aggregating concepts into broader themes (Layer 2, 3, etc.)
3. Continuing until reaching a single root concept (Cluster Theme)

Adapted for Hacker News technical articles with HN-specific prompts.
"""

from typing import List, Dict, Optional, Any
from dataclasses import dataclass, field
from app.models import Story
from app.services import llm_client


@dataclass
class ConceptNode:
    """Represents a node in the concept graph."""
    id: str
    label: str
    layer: int
    children: List[str] = field(default_factory=list)  # IDs of child nodes
    parent: Optional[str] = None  # ID of parent node
    article_id: Optional[str] = None  # For layer 0 nodes (article nodes)
    article_title: Optional[str] = None  # For layer 0 nodes
    article_url: Optional[str] = None  # For layer 0 nodes
    article_hn_url: Optional[str] = None  # For layer 0 nodes


class ConceptGraphService:
    """Service for generating hierarchical concept graphs from articles."""
    
    def __init__(self):
        """Initialize the concept graph service."""
        self.client = llm_client.get_client()
        # Cache for concept graphs: key = "search_id:cluster_id"
        self.concept_cache = {}
    
    def _get_cache_key(self, search_id: str, cluster_id: int) -> str:
        """Generate cache key for concept graph."""
        return f"{search_id}:{cluster_id}"
    
    def extract_article_concepts(
        self, 
        article_text: str, 
        article_title: str
    ) -> List[str]:
        """
        Extract 2-4 high-level technical concepts from an article using LLM.
        
        Args:
            article_text: Article content (or title if content unavailable)
            article_title: Article title
            
        Returns:
            List of 2-4 concept strings
        """
        system_prompt = """You are an expert at analyzing Hacker News technical discussions.
Extract 2-4 core technical themes from the article, focusing on:
- Technologies, frameworks, or tools mentioned
- Engineering problems or challenges addressed
- Innovative approaches or solutions
- Industry trends or developments

Each concept should be a short phrase (2-5 words) that captures a key technical theme."""

        user_prompt = f"""Analyze this Hacker News article and extract 2-4 technical concepts:

Title: {article_title}

Content:
{article_text[:1500]}  # Limit to ~1000 tokens

Return ONLY a JSON array of concept strings. Example format:
["concept one", "concept two", "concept three"]

If you cannot identify meaningful concepts, return an empty array []."""

        try:
            response_text = llm_client.call_llm(
                prompt=user_prompt,
                system_prompt=system_prompt,
                temperature=0.5,  # Lower temperature for more focused extraction
                max_tokens=200,
                client=self.client
            )
            
            # Parse JSON response
            concepts = llm_client.parse_json_response(
                response_text,
                fallback_parser=llm_client.parse_list_response
            )
            
            if isinstance(concepts, list):
                return [str(c).lower().strip() for c in concepts[:4] if c]
            
            return llm_client.parse_list_response(response_text)[:4]
        
        except Exception as e:
            print(f"Error extracting concepts for article '{article_title}': {e}")
            # Fallback: use article title as single concept
            return [article_title.lower()[:50]]
    
    def aggregate_concepts(self, concepts: List[str]) -> List[str]:
        """
        Aggregate multiple concepts into fewer, broader themes using LLM.
        
        Args:
            concepts: List of concept strings to aggregate
            
        Returns:
            List of broader concept strings (roughly half the input count)
        """
        if len(concepts) <= 1:
            return concepts
        
        # Target roughly half, minimum 1
        target_count = max(1, len(concepts) // 2)
        
        system_prompt = """You are an expert at categorizing and synthesizing Hacker News technical discussions.
Group related concepts into broader technical themes."""

        user_prompt = f"""You are given {len(concepts)} technical concepts from Hacker News articles.
Merge and group these into {target_count} broader technical themes.

Concepts to aggregate:
{chr(10).join([f"{i+1}. {c}" for i, c in enumerate(concepts)])}

Each new theme should be a short phrase (2-6 words) that represents a category of concepts.
Focus on technical domains, problem areas, or technology categories.

Return ONLY a JSON array of the {target_count} broader theme strings. Example format:
["broader theme one", "broader theme two"]"""

        try:
            response_text = llm_client.call_llm(
                prompt=user_prompt,
                system_prompt=system_prompt,
                temperature=0.5,
                max_tokens=300,
                client=self.client
            )
            
            # Parse JSON response
            broader = llm_client.parse_json_response(
                response_text,
                fallback_parser=llm_client.parse_list_response
            )
            
            if isinstance(broader, list):
                return [str(c).lower().strip() for c in broader if c]
            
            return llm_client.parse_list_response(response_text)[:target_count]
        
        except Exception as e:
            print(f"Error aggregating concepts: {e}")
            # Fallback: return first half
            return concepts[:target_count] if target_count > 0 else concepts
    
    def map_concepts_to_broader(
        self, 
        concepts: List[str], 
        broader_concepts: List[str]
    ) -> Dict[str, List[str]]:
        """
        Map each concept to its broader category using LLM.
        
        Args:
            concepts: List of concept strings
            broader_concepts: List of broader category strings
            
        Returns:
            Dictionary mapping broader concepts to lists of child concept indices
        """
        system_prompt = """You are an expert at categorizing technical concepts.
Map each specific concept to the most appropriate broader category."""

        user_prompt = f"""Map each concept to the most appropriate broader category.

Concepts:
{chr(10).join([f"{i+1}. {c}" for i, c in enumerate(concepts)])}

Broader categories:
{chr(10).join([f"{i+1}. {c}" for i, c in enumerate(broader_concepts)])}

Return ONLY a JSON object mapping each concept to a broader category. Format:
{{"concept1": "broader_category1", "concept2": "broader_category2", ...}}

Each concept should map to exactly one broader category."""

        try:
            response_text = llm_client.call_llm(
                prompt=user_prompt,
                system_prompt=system_prompt,
                temperature=0.3,  # Lower temperature for consistent mapping
                max_tokens=400,
                client=self.client
            )
            
            mapping = llm_client.parse_mapping_response(response_text)
            
            # Convert to dict of broader -> list of concept indices
            result = {bc: [] for bc in broader_concepts}
            
            for i, concept in enumerate(concepts):
                broader = mapping.get(concept.lower(), None)
                
                # Find matching broader concept
                matched = False
                for bc in broader_concepts:
                    if broader and bc.lower() in broader.lower() or broader and broader in bc.lower():
                        result[bc].append(i)
                        matched = True
                        break
                
                # Fallback to round-robin if no match
                if not matched:
                    result[broader_concepts[i % len(broader_concepts)]].append(i)
            
            return result
        
        except Exception as e:
            print(f"Error mapping concepts: {e}")
            # Fallback: round-robin distribution
            result = {bc: [] for bc in broader_concepts}
            for i, concept in enumerate(concepts):
                result[broader_concepts[i % len(broader_concepts)]].append(i)
            return result
    
    def generate_root_concept(self, concepts: List[str]) -> str:
        """
        Generate a single root concept from final layer concepts.
        
        Args:
            concepts: Final layer concepts to synthesize
            
        Returns:
            Single root concept string
        """
        if len(concepts) == 1:
            return concepts[0]
        
        system_prompt = """You are an expert at synthesizing Hacker News technical discussions.
Create a single overarching theme that captures the essence of multiple technical concepts."""

        user_prompt = f"""Synthesize these {len(concepts)} technical themes into ONE single concept that captures the overarching theme:

Themes:
{chr(10).join([f"{i+1}. {c}" for i, c in enumerate(concepts)])}

Return ONLY a single phrase (3-8 words) representing the cluster's overarching technical theme.
Do not include quotes or any other text."""

        try:
            response_text = llm_client.call_llm(
                prompt=user_prompt,
                system_prompt=system_prompt,
                temperature=0.6,
                max_tokens=100,
                client=self.client
            )
            
            return response_text.strip('"\'').lower()
        
        except Exception as e:
            print(f"Error generating root concept: {e}")
            # Fallback: combine concepts with slashes
            return " / ".join(concepts[:3])
    
    def build_concept_tree(
        self, 
        stories: List[Story], 
        search_id: str,
        cluster_id: int
    ) -> Dict[str, Any]:
        """
        Build hierarchical concept graph from articles.
        
        Args:
            stories: List of Story objects (should be top 50 by score)
            search_id: Search ID for caching
            cluster_id: Cluster ID
            
        Returns:
            Dictionary with 'nodes' list and 'root_id' string
        """
        # Check cache
        cache_key = self._get_cache_key(search_id, cluster_id)
        if cache_key in self.concept_cache:
            print(f"Returning cached concept graph for cluster {cluster_id}")
            return self.concept_cache[cache_key]
        
        print(f"Building concept graph for cluster {cluster_id} with {len(stories)} articles...")
        
        nodes: Dict[str, ConceptNode] = {}
        
        # Step 0: Create article nodes (Layer 0 - rightmost leaf nodes)
        print(f"[Step 0] Creating article nodes...")
        article_node_ids = []
        for story in stories:
            article_node_id = f"L0_article_{story.id}"
            nodes[article_node_id] = ConceptNode(
                id=article_node_id,
                label=story.title[:60],  # Use title as label
                layer=0,
                children=[],
                parent=None,
                article_id=story.id,
                article_title=story.title,
                article_url=story.url,
                article_hn_url=story.hn_url
            )
            article_node_ids.append(article_node_id)
        
        print(f"  → Created {len(article_node_ids)} article nodes")
        
        # Step 1: Extract concepts from each article (Layer 1)
        print(f"[Step 1] Extracting concepts from {len(stories)} articles...")
        article_concepts = {}  # article_id -> list of concept_ids
        concept_label_to_id = {}  # concept_label -> concept_id (for deduplication)
        
        for story in stories:
            # Use content if available, otherwise use title
            article_text = story.content if story.content and story.content_fetch_success else story.title
            
            concepts = self.extract_article_concepts(article_text, story.title)
            
            # Create concept nodes for this article
            story_concept_ids = []
            for concept in concepts:
                # Normalize concept for ID generation (lowercase, replace spaces/slashes)
                concept_normalized = concept.lower().strip()
                
                # Check if this concept already exists
                if concept_normalized in concept_label_to_id:
                    # Concept exists - add this article as a child
                    concept_id = concept_label_to_id[concept_normalized]
                    article_node_id = f"L0_article_{story.id}"
                    
                    if article_node_id not in nodes[concept_id].children:
                        nodes[concept_id].children.append(article_node_id)
                        nodes[article_node_id].parent = concept_id
                    
                    story_concept_ids.append(concept_id)
                else:
                    # Create new concept node
                    concept_id = f"L1_{concept.replace(' ', '_').replace('/', '_')[:50]}"
                    article_node_id = f"L0_article_{story.id}"
                    
                    nodes[concept_id] = ConceptNode(
                        id=concept_id,
                        label=concept,
                        layer=1,
                        children=[article_node_id],
                        parent=None,
                        article_id=None,
                        article_title=None
                    )
                    
                    nodes[article_node_id].parent = concept_id
                    concept_label_to_id[concept_normalized] = concept_id
                    story_concept_ids.append(concept_id)
            
            article_concepts[story.id] = story_concept_ids
        
        all_layer1_concepts = list(concept_label_to_id.values())
        print(f"  → Extracted {len(all_layer1_concepts)} unique concepts from {len(stories)} articles")
        
        if not all_layer1_concepts:
            print("No concepts extracted, returning empty graph")
            return {"nodes": [], "root_id": None, "layer_count": 0}
        
        # Step 2: Recursive aggregation
        print("[Step 2] Aggregating concepts into higher layers...")
        current_layer = 1
        current_concept_ids = all_layer1_concepts
        
        while len(current_concept_ids) > 1:
            current_layer += 1
            current_concepts = [nodes[cid].label for cid in current_concept_ids]
            
            print(f"  Layer {current_layer}: Aggregating {len(current_concepts)} concepts...")
            
            # Aggregate to broader concepts
            broader_concepts = self.aggregate_concepts(current_concepts)
            print(f"    → Generated {len(broader_concepts)} broader concepts")
            
            # If no reduction, force it or break
            if len(broader_concepts) >= len(current_concepts):
                if len(current_concepts) <= 2:
                    break
                broader_concepts = broader_concepts[:max(1, len(current_concepts)//2)]
            
            # Map concepts to broader categories
            mapping = self.map_concepts_to_broader(current_concepts, broader_concepts)
            
            # Create new layer nodes
            new_concept_ids = []
            for broader in broader_concepts:
                concept_id = f"L{current_layer}_{broader.replace(' ', '_').replace('/', '_')[:30]}"
                child_indices = mapping.get(broader, [])
                child_ids = [current_concept_ids[i] for i in child_indices if i < len(current_concept_ids)]
                
                nodes[concept_id] = ConceptNode(
                    id=concept_id,
                    label=broader,
                    layer=current_layer,
                    children=child_ids,
                    parent=None
                )
                new_concept_ids.append(concept_id)
                
                # Update parent references for children
                for child_id in child_ids:
                    if child_id in nodes:
                        nodes[child_id].parent = concept_id
            
            current_concept_ids = new_concept_ids
        
        # Step 3: Generate root concept
        print("[Step 3] Generating root concept...")
        current_concepts = [nodes[cid].label for cid in current_concept_ids]
        root_concept = self.generate_root_concept(current_concepts)
        print(f"  → Root concept: {root_concept}")
        
        root_id = "root"
        nodes[root_id] = ConceptNode(
            id=root_id,
            label=root_concept,
            layer=current_layer + 1,
            children=current_concept_ids,
            parent=None
        )
        
        # Update parent references
        for child_id in current_concept_ids:
            if child_id in nodes:
                nodes[child_id].parent = root_id
        
        # Prepare result
        result = {
            "nodes": [
                {
                    "id": node.id,
                    "label": node.label,
                    "layer": node.layer,
                    "children": node.children,
                    "parent": node.parent,
                    "article_id": node.article_id,
                    "article_title": node.article_title,
                    "article_url": node.article_url,
                    "article_hn_url": node.article_hn_url
                }
                for node in nodes.values()
            ],
            "root_id": root_id,
            "layer_count": current_layer + 1
        }
        
        # Cache result
        self.concept_cache[cache_key] = result
        print(f"Concept graph built successfully with {len(nodes)} nodes across {current_layer + 1} layers")
        
        return result


# Global concept graph service instance
concept_graph_service = ConceptGraphService()
