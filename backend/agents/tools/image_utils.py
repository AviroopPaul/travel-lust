"""
Image utilities for travel destinations, hotels, and activities.
Uses DuckDuckGo image search for reliable, free images without API keys.
Falls back to Lorem Picsum for placeholder images if search fails.

OPTIMIZATION: Functions are designed to make minimal API calls.
Use get_category_image() for batch operations instead of per-item calls.
"""

from typing import Optional

try:
    from ddgs import DDGS
except ImportError:
    from duckduckgo_search import DDGS


# Simple in-memory cache for the current session
_image_cache: dict = {}


def _get_cache_key(category: str, destination: str) -> str:
    """Generate a cache key for the image."""
    return f"{category}:{destination}".lower().strip()


def _search_images(query: str, max_results: int = 1, size: str = "Medium") -> list[str]:
    """
    Search for multiple images using DuckDuckGo.
    
    Args:
        query: Search query string
        max_results: Number of images to return
        size: Image size filter ("Small", "Medium", "Large", "Wallpaper")

    Returns:
        List of image URLs
    """
    results = []
    try:
        with DDGS() as ddgs:
            for result in ddgs.images(query, max_results=max_results, size=size):
                if result.get('image'):
                    results.append(result['image'])
                    if len(results) >= max_results:
                        break
    except Exception as e:
        print(f"[ImageUtils] DuckDuckGo search failed for '{query}': {e}")
    return results


def _search_image(query: str, size: str = "Medium") -> Optional[str]:
    """
    Search for a SINGLE image using DuckDuckGo.
    """
    urls = _search_images(query, max_results=1, size=size)
    return urls[0] if urls else None


def _get_picsum_fallback(width: int = 800, height: int = 600, seed: str = "") -> str:
    """
    Get a Lorem Picsum placeholder image URL.
    Uses seed for deterministic images based on the query.
    """
    numeric_seed = abs(hash(seed)) % 1000
    return f"https://picsum.photos/seed/{numeric_seed}/{width}/{height}"


def get_destination_image(destination: str) -> str:
    """
    Get a SINGLE image URL for a travel destination.
    Makes only 1 API call and caches the result.

    Args:
        destination: The destination name (city, country, etc.)

    Returns:
        Single image URL
    """
    cache_key = _get_cache_key("destination", destination)

    if cache_key in _image_cache:
        return _image_cache[cache_key]

    query = f"{destination} travel landmark scenic"
    url = _search_image(query, size="Large")

    if not url:
        url = _get_picsum_fallback(800, 600, seed=f"dest_{destination}")

    _image_cache[cache_key] = url
    return url


def get_destination_images(destination: str, count: int = 3) -> list[str]:
    """
    Get image URLs for a travel destination.
    Makes 1 API call for multiple results.

    Args:
        destination: The destination name (city, country, etc.)
        count: Number of images to return (default 3)

    Returns:
        List of unique image URLs
    """
    cache_key = _get_cache_key("destination_list", f"{destination}_{count}")
    
    if cache_key in _image_cache:
        return _image_cache[cache_key]

    query = f"{destination} travel landmark scenic"
    urls = _search_images(query, max_results=count, size="Large")

    # If we didn't get enough images, fill with fallbacks
    while len(urls) < count:
        urls.append(_get_picsum_fallback(800, 600, seed=f"dest_{destination}_{len(urls)}"))

    _image_cache[cache_key] = urls
    return urls


def get_hotels_image(destination: str) -> str:
    """
    Get a SINGLE hotel image for a destination.
    Makes only 1 API call, caches result.
    Use this for ALL hotels in the destination.

    Args:
        destination: The destination/city

    Returns:
        Image URL for hotels in this destination
    """
    cache_key = _get_cache_key("hotel", destination)

    if cache_key in _image_cache:
        return _image_cache[cache_key]

    query = f"{destination} luxury hotel exterior"
    url = _search_image(query, size="Medium")

    if not url:
        url = _get_picsum_fallback(600, 400, seed=f"hotel_{destination}")

    _image_cache[cache_key] = url
    return url


def get_activities_image(destination: str) -> str:
    """
    Get an activity/tourism image for a destination.
    Uses placeholder only - no API call to save resources.

    Args:
        destination: The destination/city

    Returns:
        Image URL for activities in this destination
    """
    # Use placeholder directly - no API call needed for activity thumbnails
    return _get_picsum_fallback(600, 400, seed=f"activity_{destination}")


# Legacy functions for backwards compatibility (now optimized)
def get_hotel_image(hotel_name: str, destination: str) -> str:
    """
    Get an image URL for a specific hotel.

    Args:
        hotel_name: The hotel name
        destination: The destination/city

    Returns:
        Image URL
    """
    cache_key = _get_cache_key("hotel_specific", f"{hotel_name}_{destination}")

    if cache_key in _image_cache:
        return _image_cache[cache_key]

    query = f"{hotel_name} {destination} hotel exterior"
    url = _search_image(query, size="Medium")

    if not url:
        url = _get_picsum_fallback(600, 400, seed=f"hotel_{hotel_name}_{destination}")

    _image_cache[cache_key] = url
    return url


def get_activity_image(activity_name: str, destination: str) -> str:
    """
    Get an image URL for an activity.
    NOTE: Now uses destination-based caching - same image for all activities.

    Args:
        activity_name: The activity name (ignored for optimization)
        destination: The destination/city

    Returns:
        Image URL
    """
    return get_activities_image(destination)


def clear_image_cache():
    """Clear the image cache. Useful between different trip searches."""
    global _image_cache
    _image_cache = {}
