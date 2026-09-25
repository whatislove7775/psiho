def photo_url(profile) -> str | None:
    """Public URL of the specialist's photo, or None. Safe for any profile object."""
    try:
        photo = profile.photo
    except Exception:  # RelatedObjectDoesNotExist
        return None
    if not photo or not photo.image:
        return None
    return photo.image.url
