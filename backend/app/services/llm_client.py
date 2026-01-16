"""
LLM Client Module

Provides reusable functions for interacting with Azure OpenAI.
Used across different services (LLMService, ConceptGraphService, etc.)
"""

from openai import OpenAI
import json
import re
from typing import Dict, Any, List, Optional, Callable
from app.config import settings


def get_client() -> OpenAI:
    """
    Get Azure OpenAI client instance.
    
    Returns:
        Configured OpenAI client
    """
    return OpenAI(
        base_url=settings.AZURE_OPENAI_ENDPOINT,
        api_key=settings.AZURE_OPENAI_API_KEY
    )


def get_deployment_name() -> str:
    """
    Get the deployment name for Azure OpenAI.
    
    Returns:
        Deployment name string
    """
    return settings.AZURE_OPENAI_DEPLOYMENT_NAME


def call_llm(
    prompt: str,
    system_prompt: str = "You are a helpful AI assistant.",
    temperature: float = 0.7,
    max_tokens: int = 500,
    client: Optional[OpenAI] = None
) -> str:
    """
    Make a call to the LLM and return the response text.
    
    Args:
        prompt: User prompt
        system_prompt: System prompt (default: generic assistant)
        temperature: Sampling temperature (0.0-2.0)
        max_tokens: Maximum tokens in response
        client: Optional pre-initialized client (creates new if None)
        
    Returns:
        Response text from LLM
        
    Raises:
        Exception: If LLM call fails
    """
    if client is None:
        client = get_client()
    
    deployment_name = get_deployment_name()
    
    try:
        response = client.chat.completions.create(
            model=deployment_name,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": prompt}
            ],
            temperature=temperature,
            max_tokens=max_tokens
        )
        
        return response.choices[0].message.content
    
    except Exception as e:
        raise Exception(f"LLM call failed: {str(e)}")


def parse_json_response(
    response_text: str,
    fallback_parser: Optional[Callable[[str], Any]] = None
) -> Any:
    """
    Parse JSON response from LLM with fallback handling.
    
    Args:
        response_text: Raw response text from LLM
        fallback_parser: Optional fallback function if JSON parsing fails
        
    Returns:
        Parsed JSON object or fallback result
        
    Raises:
        json.JSONDecodeError: If parsing fails and no fallback provided
    """
    # Try to extract JSON from markdown code blocks if present
    json_match = re.search(r'```(?:json)?\s*(\{.*?\}|\[.*?\])\s*```', response_text, re.DOTALL)
    if json_match:
        response_text = json_match.group(1)
    
    # Try direct JSON parsing
    try:
        return json.loads(response_text.strip())
    except json.JSONDecodeError:
        # Try to find JSON in the text
        json_pattern = r'(\{.*?\}|\[.*?\])'
        matches = re.findall(json_pattern, response_text, re.DOTALL)
        
        for match in matches:
            try:
                return json.loads(match)
            except json.JSONDecodeError:
                continue
        
        # If fallback parser provided, use it
        if fallback_parser:
            return fallback_parser(response_text)
        
        # No fallback, raise error
        raise json.JSONDecodeError(f"Could not parse JSON from response: {response_text[:100]}", response_text, 0)


def parse_list_response(response_text: str) -> List[str]:
    """
    Parse a list response from LLM, handling various formats.
    
    Tries to parse JSON array first, then falls back to extracting
    items from numbered/bulleted lists or line-separated text.
    
    Args:
        response_text: Raw response text from LLM
        
    Returns:
        List of extracted strings
    """
    # Try JSON parsing first
    try:
        result = parse_json_response(response_text)
        if isinstance(result, list):
            return [str(item).strip() for item in result if item]
    except json.JSONDecodeError:
        pass
    
    # Fallback: extract from numbered or bulleted list
    lines = response_text.strip().split('\n')
    items = []
    
    for line in lines:
        line = line.strip()
        if not line:
            continue
        
        # Remove common list prefixes: "1. ", "- ", "* ", etc.
        cleaned = re.sub(r'^(\d+\.|[-*•])\s*', '', line)
        cleaned = cleaned.strip('"\'')
        
        if cleaned:
            items.append(cleaned)
    
    return items


def parse_mapping_response(response_text: str) -> Dict[str, str]:
    """
    Parse a mapping/dictionary response from LLM.
    
    Args:
        response_text: Raw response text from LLM
        
    Returns:
        Dictionary mapping keys to values
    """
    try:
        result = parse_json_response(response_text)
        if isinstance(result, dict):
            # Convert all keys and values to lowercase strings for consistency
            return {str(k).lower().strip(): str(v).lower().strip() for k, v in result.items()}
    except json.JSONDecodeError:
        pass
    
    # Fallback: try to parse "key: value" or "key -> value" format
    mapping = {}
    lines = response_text.strip().split('\n')
    
    for line in lines:
        line = line.strip()
        if not line:
            continue
        
        # Try different separators
        for separator in [':', '->', '=', '→']:
            if separator in line:
                parts = line.split(separator, 1)
                if len(parts) == 2:
                    key = parts[0].strip().strip('"\'').lower()
                    value = parts[1].strip().strip('"\'').lower()
                    if key and value:
                        mapping[key] = value
                break
    
    return mapping
