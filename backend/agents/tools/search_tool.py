try:
    from ddgs import DDGS
except ImportError:
    from duckduckgo_search import DDGS
from typing import List, Dict


def web_search(query: str, max_results: int = 5) -> str:
    """
    Performs a web search using DuckDuckGo and returns a formatted string of results.

    Args:
        query: The search query string.
        max_results: Maximum number of results to return.

    Returns:
        A string containing the search results (titles, URLs, snippets).
    """
    print(f"[SearchTool] Searching for: {query}")
    try:
        with DDGS() as ddgs:
            results = list(ddgs.text(query, max_results=max_results))

        if not results:
            return "No search results found."

        formatted_results = []
        for i, res in enumerate(results, 1):
            title = res.get('title', 'No Title')
            body = res.get('body', 'No Description')
            url = res.get('href') or res.get('url') or res.get('link') or 'No URL'
            formatted_results.append(
                f"{i}. {title}\n   URL: {url}\n   {body}"
            )

        return "\n\n".join(formatted_results)
    except Exception as e:
        return f"Error during search: {str(e)}"


def image_search(query: str, max_results: int = 3) -> List[str]:
    """
    Performs an image search using DuckDuckGo and returns a list of image URLs.

    Args:
        query: The search query string.
        max_results: Maximum number of results to return.

    Returns:
        A list of image URLs.
    """
    print(f"[SearchTool] Searching images for: {query}")
    try:
        with DDGS() as ddgs:
            results = list(ddgs.images(query, max_results=max_results))

        if not results:
            return []

        return [res.get('image') for res in results if res.get('image')]
    except Exception as e:
        print(f"Error during image search: {str(e)}")
        return []
