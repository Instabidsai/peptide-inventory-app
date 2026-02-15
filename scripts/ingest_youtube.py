"""
YouTube -> Peptide AI Knowledge Base Pipeline
=============================================
Usage:
    uv run python scripts/ingest_youtube.py "https://www.youtube.com/watch?v=VIDEO_ID"
    uv run python scripts/ingest_youtube.py VIDEO_ID
    uv run python scripts/ingest_youtube.py --channel "https://www.youtube.com/@ChannelName"

What it does:
1. Pulls transcript from YouTube (free, no API key)
2. Cleans with GPT-4o-mini — removes filler, keeps science, adds topic headers
3. Chunks by topic with overlap
4. Embeds with text-embedding-3-small -> stores in Supabase pgvector
5. Tracks ingested videos (no duplicates)
"""

import os
import re
import sys
import time
from pathlib import Path
from datetime import datetime, timezone

from dotenv import load_dotenv
from openai import OpenAI
from youtube_transcript_api import YouTubeTranscriptApi
from supabase import create_client

# ── Load env ────────────────────────────────────────────
env_path = Path(__file__).parent.parent / ".env"
load_dotenv(env_path)

SUPABASE_URL = os.environ.get("VITE_SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
OPENAI_KEY = os.environ.get("OPENAI_API_KEY", "")

if not SUPABASE_URL or not SUPABASE_KEY:
    print("ERROR: Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env")
    sys.exit(1)
if not OPENAI_KEY:
    print("ERROR: Missing OPENAI_API_KEY in .env")
    sys.exit(1)

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
openai = OpenAI(api_key=OPENAI_KEY)

# ── Config ──────────────────────────────────────────────
EMBEDDING_MODEL = "text-embedding-3-small"
CLEANUP_MODEL = "gpt-4o-mini"
CHUNK_TARGET_WORDS = 500
CHUNK_OVERLAP_WORDS = 75

# ── Step 1: Extract transcript ──────────────────────────
def extract_video_id(url_or_id: str) -> str:
    """Extract YouTube video ID from URL or return as-is if already an ID."""
    # Already a bare ID
    if re.match(r'^[\w-]{11}$', url_or_id):
        return url_or_id
    # Standard URL
    m = re.search(r'[?&]v=([\w-]{11})', url_or_id)
    if m:
        return m.group(1)
    # Short URL
    m = re.search(r'youtu\.be/([\w-]{11})', url_or_id)
    if m:
        return m.group(1)
    # URL with /watch/ path
    m = re.search(r'/watch/([\w-]{11})', url_or_id)
    if m:
        return m.group(1)
    print(f"ERROR: Could not extract video ID from: {url_or_id}")
    sys.exit(1)


def _build_ytt(cookies_path: str = ""):
    """Build YouTubeTranscriptApi instance, optionally with cookies for IP ban bypass."""
    if cookies_path:
        import http.cookiejar
        import requests
        cj = http.cookiejar.MozillaCookieJar(cookies_path)
        cj.load(ignore_discard=True, ignore_expires=True)
        session = requests.Session()
        session.cookies = cj
        return YouTubeTranscriptApi(http_client=session)
    return YouTubeTranscriptApi()


def fetch_transcript(video_id: str, cookies_path: str = "") -> str:
    """Fetch YouTube transcript using youtube-transcript-api.

    If cookies_path is provided, uses browser cookies to bypass IP bans.
    Export cookies from Chrome with a cookie export extension (Netscape format).
    """
    print(f"  [1/5] Fetching transcript for {video_id}...")
    try:
        ytt = _build_ytt(cookies_path)
        if cookies_path:
            print(f"         (using cookies from {cookies_path})")
        transcript = ytt.fetch(video_id, languages=["en"])
        # Combine all segments
        full_text = " ".join([segment.text for segment in transcript])
        print(f"         Got {len(full_text):,} chars ({len(full_text.split()):,} words)")
        return full_text
    except Exception as e:
        print(f"  ERROR fetching transcript: {e}")
        if "blocking" in str(e).lower() or "ip" in str(e).lower():
            print("  TIP: YouTube is blocking your IP. Try --cookies <path> to bypass.")
            print("       Export cookies from Chrome: use 'Get cookies.txt LOCALLY' extension")
            print("       Save as cookies.txt, then: --cookies cookies.txt")
        else:
            print("  TIP: Video may not have captions, or may be private/age-restricted.")
        raise RuntimeError(f"Transcript fetch failed for {video_id}: {e}")


# ── Step 2: Preprocess (quick regex pass) ───────────────
def preprocess(text: str) -> str:
    """Quick regex cleanup before LLM pass. Saves ~10% tokens."""
    # Remove [Music], [Applause], etc.
    text = re.sub(r'\[.*?\]', '', text)
    # Remove timestamps like 12:34 or 1:23:45
    text = re.sub(r'\b\d{1,2}:\d{2}(:\d{2})?\b', '', text)
    # Remove obvious filler words (conservative — LLM handles the rest)
    text = re.sub(r'\b(um|uh|uhh|umm|hmm|hm)\b', '', text, flags=re.IGNORECASE)
    # Collapse whitespace
    text = re.sub(r'\s+', ' ', text).strip()
    return text


# ── Step 3: LLM cleanup ────────────────────────────────
CLEANUP_PROMPT = """You are a scientific transcript editor specializing in peptide research content.

Clean this raw YouTube transcript for use in a peptide research AI knowledge base.

RULES:
1. REMOVE all filler words (um, uh, like, you know, so basically, actually, right, I mean)
2. REMOVE false starts, repetitions, stutters
3. REMOVE sponsor segments, self-promotion, "subscribe" calls, off-topic tangents
4. REMOVE casual chitchat that has zero scientific value
5. KEEP ALL scientific content — peptide names, dosages, mechanisms of action, study references, protocols, side effects, clinical data
6. KEEP practical advice about usage, timing, stacking, reconstitution
7. ADD proper punctuation and paragraph breaks
8. ADD ## topic headers (in markdown) where the subject changes
9. FIX scientific terminology spelling (e.g. "bpc one fifty seven" -> "BPC-157", "tb five hundred" -> "TB-500")
10. Output clean, well-organized markdown

RAW TRANSCRIPT:
{text}"""


def clean_with_llm(raw_text: str) -> str:
    """Send transcript through GPT-4o-mini for cleanup."""
    print(f"  [2/5] Cleaning with {CLEANUP_MODEL}...")

    # Split into ~8000 char chunks for the LLM (well within context window)
    words = raw_text.split()
    chunk_size = 3000  # words per LLM call
    chunks = []
    for i in range(0, len(words), chunk_size):
        chunks.append(" ".join(words[i:i + chunk_size]))

    cleaned_parts = []
    for i, chunk in enumerate(chunks):
        print(f"         Chunk {i + 1}/{len(chunks)}...", end=" ", flush=True)
        response = openai.chat.completions.create(
            model=CLEANUP_MODEL,
            messages=[
                {"role": "system", "content": "You are a scientific transcript editor. Preserve all peptide research content. Remove everything else."},
                {"role": "user", "content": CLEANUP_PROMPT.format(text=chunk)},
            ],
            temperature=0.1,
        )
        result = response.choices[0].message.content or ""
        cleaned_parts.append(result)
        # Show token usage
        usage = response.usage
        print(f"({usage.total_tokens:,} tokens)" if usage else "")

    cleaned = "\n\n".join(cleaned_parts)
    word_count = len(cleaned.split())
    print(f"         Cleaned: {word_count:,} words (was {len(words):,})")
    return cleaned


# ── Step 4: Topic-based chunking ────────────────────────
def chunk_by_topic(markdown: str) -> list[dict]:
    """Split cleaned markdown at ## headers, with word-based overlap for long sections."""
    sections = re.split(r'(?=^## )', markdown, flags=re.MULTILINE)
    chunks = []

    for section in sections:
        section = section.strip()
        if not section or len(section) < 50:
            continue

        # Extract topic from header
        header_match = re.match(r'^## (.+)$', section, re.MULTILINE)
        topic = header_match.group(1).strip() if header_match else "General"

        words = section.split()
        if len(words) > CHUNK_TARGET_WORDS + 100:
            # Sub-chunk long sections with overlap
            step = CHUNK_TARGET_WORDS - CHUNK_OVERLAP_WORDS
            for i in range(0, len(words), step):
                sub = " ".join(words[i:i + CHUNK_TARGET_WORDS])
                if len(sub.split()) > 30:  # Skip tiny trailing chunks
                    chunks.append({"topic": topic, "content": sub})
        else:
            chunks.append({"topic": topic, "content": section})

    # If no headers were found (LLM didn't add them), fall back to word-based chunking
    if not chunks:
        words = markdown.split()
        step = CHUNK_TARGET_WORDS - CHUNK_OVERLAP_WORDS
        for i in range(0, len(words), step):
            sub = " ".join(words[i:i + CHUNK_TARGET_WORDS])
            if len(sub.split()) > 30:
                chunks.append({"topic": "General", "content": sub})

    print(f"  [3/5] Chunked into {len(chunks)} pieces")
    return chunks


# ── Step 5: Embed and store ─────────────────────────────
def embed_and_store(chunks: list[dict], video_id: str, video_url: str, video_title: str):
    """Generate embeddings and store in Supabase."""
    print(f"  [4/5] Embedding {len(chunks)} chunks...")

    for i, chunk in enumerate(chunks):
        # Generate embedding
        text_for_embedding = chunk["content"].replace("\n", " ")
        response = openai.embeddings.create(
            model=EMBEDDING_MODEL,
            input=text_for_embedding,
        )
        embedding = response.data[0].embedding

        # Store in Supabase
        result = supabase.table("embeddings").insert({
            "content": chunk["content"],
            "embedding": embedding,
            "metadata": {
                "type": "global",
                "source": "youtube_pipeline",
                "video_id": video_id,
                "video_url": video_url,
                "title": video_title,
                "topic": chunk["topic"],
                "chunk_index": i,
                "word_count": len(chunk["content"].split()),
                "ingested_at": datetime.now(timezone.utc).isoformat(),
            }
        }).execute()

        if not result.data:
            print(f"  ERROR storing chunk {i}")
        else:
            print(f"         [{i + 1}/{len(chunks)}] {chunk['topic'][:50]}... ({len(chunk['content'].split())} words)")

    print(f"  [5/5] Stored {len(chunks)} chunks in Supabase!")


# ── Dedup check ─────────────────────────────────────────
def already_ingested(video_id: str) -> bool:
    """Check if this video has already been ingested."""
    result = supabase.table("embeddings") \
        .select("id") \
        .eq("metadata->>video_id", video_id) \
        .eq("metadata->>source", "youtube_pipeline") \
        .limit(1) \
        .execute()

    return len(result.data) > 0 if result.data else False


# ── Save cleaned transcript locally ─────────────────────
def save_transcript(video_id: str, raw: str, cleaned: str):
    """Save raw + cleaned transcripts to local files for reference."""
    out_dir = Path(__file__).parent / "transcripts"
    out_dir.mkdir(exist_ok=True)

    (out_dir / f"{video_id}_raw.txt").write_text(raw, encoding="utf-8")
    (out_dir / f"{video_id}_cleaned.md").write_text(cleaned, encoding="utf-8")
    print(f"         Saved transcripts to scripts/transcripts/{video_id}_*.txt")


# ── Main pipeline ───────────────────────────────────────
def process_video(url_or_id: str, force: bool = False, video_title: str = "", cookies_path: str = ""):
    """Full pipeline: transcript -> clean -> chunk -> embed -> store."""
    video_id = extract_video_id(url_or_id)
    video_url = f"https://www.youtube.com/watch?v={video_id}"

    print(f"\n{'='*60}")
    print(f"  Processing: {video_url}")
    print(f"{'='*60}")

    # Check for duplicates
    if not force and already_ingested(video_id):
        print(f"  SKIP: Video {video_id} already ingested. Use --force to re-ingest.")
        return

    # Step 1: Get transcript
    raw_text = fetch_transcript(video_id, cookies_path=cookies_path)

    # Step 2: Preprocess
    preprocessed = preprocess(raw_text)

    # Step 3: LLM cleanup
    cleaned = clean_with_llm(preprocessed)

    # Save locally for review
    save_transcript(video_id, raw_text, cleaned)

    # Step 4: Chunk
    chunks = chunk_by_topic(cleaned)

    if not chunks:
        print("  ERROR: No chunks produced. Transcript may be too short or empty.")
        return

    # Use provided title, or fall back to first header, or video ID
    if not video_title:
        first_header = re.search(r'^## (.+)$', cleaned, re.MULTILINE)
        video_title = first_header.group(1).strip() if first_header else f"YouTube Video {video_id}"

    # Step 5: Embed and store
    embed_and_store(chunks, video_id, video_url, video_title)

    print(f"\n  DONE! {len(chunks)} knowledge chunks stored for video {video_id}")
    print(f"  Cost estimate: ~$0.01-0.03")


def purge_video(video_id: str):
    """Remove all embeddings for a specific video."""
    print(f"Purging all embeddings for video {video_id}...")
    result = supabase.table("embeddings") \
        .delete() \
        .eq("metadata->>video_id", video_id) \
        .eq("metadata->>source", "youtube_pipeline") \
        .execute()
    count = len(result.data) if result.data else 0
    print(f"  Deleted {count} chunks.")


# ── Channel batch processing ────────────────────────────
def process_channel(channel_url: str, limit: int = 100, force: bool = False, delay: int = 10, cookies_path: str = ""):
    """Pull video IDs from a YouTube channel and process them."""
    try:
        import scrapetube
    except ImportError:
        print("ERROR: scrapetube not installed. Run: uv pip install scrapetube")
        sys.exit(1)

    print(f"\nFetching up to {limit} videos from channel...")
    print(f"  Channel: {channel_url}\n")

    # Extract channel handle or ID
    # scrapetube accepts channel_url directly
    try:
        videos = scrapetube.get_channel(channel_url=channel_url, limit=limit, sort_by="newest")
    except Exception:
        # Try extracting handle and using it
        handle = re.search(r'@([\w.-]+)', channel_url)
        if handle:
            videos = scrapetube.get_channel(channel_url=f"https://www.youtube.com/@{handle.group(1)}", limit=limit, sort_by="newest")
        else:
            print(f"ERROR: Could not parse channel URL: {channel_url}")
            sys.exit(1)

    # Collect all video IDs and titles
    video_list = []
    for v in videos:
        vid = v.get("videoId", "")
        title = ""
        try:
            title = v.get("title", {}).get("runs", [{}])[0].get("text", "")
        except (AttributeError, IndexError, TypeError):
            title = str(v.get("title", ""))
        if vid:
            video_list.append({"id": vid, "title": title})

    print(f"  Found {len(video_list)} videos\n")

    if not video_list:
        print("  No videos found. Check the channel URL.")
        return

    # Process each video
    succeeded = 0
    skipped = 0
    failed = 0
    failed_list = []

    for i, video in enumerate(video_list):
        print(f"\n[{i + 1}/{len(video_list)}] {video['title'][:60]}")

        # Check for duplicates
        if not force and already_ingested(video["id"]):
            print(f"  SKIP: Already ingested.")
            skipped += 1
            continue

        try:
            process_video(video["id"], force=force, video_title=video.get("title", ""), cookies_path=cookies_path)
            succeeded += 1
            # Delay between videos to avoid YouTube rate limiting
            if delay > 0 and i < len(video_list) - 1:
                print(f"  (waiting {delay}s to avoid rate limit...)")
                time.sleep(delay)
        except SystemExit:
            print(f"  FAILED: Could not process {video['id']}")
            failed += 1
            failed_list.append(video)
        except Exception as e:
            print(f"  FAILED: {e}")
            failed += 1
            failed_list.append(video)
            # On rate limit errors, wait extra
            if "blocking" in str(e).lower() or "ip" in str(e).lower():
                wait = 60
                print(f"  Rate limited! Waiting {wait}s...")
                time.sleep(wait)

    # Summary
    print(f"\n{'='*60}")
    print(f"  BATCH COMPLETE")
    print(f"{'='*60}")
    print(f"  Succeeded: {succeeded}")
    print(f"  Skipped (already ingested): {skipped}")
    print(f"  Failed: {failed}")
    if failed_list:
        print(f"\n  Failed videos:")
        for v in failed_list:
            print(f"    - {v['id']}: {v['title'][:50]}")
    print(f"\n  Total chunks in DB:")
    # Quick count
    result = supabase.table("embeddings") \
        .select("id") \
        .eq("metadata->>source", "youtube_pipeline") \
        .execute()
    print(f"    {len(result.data)} chunks across all videos")


# ── CLI ─────────────────────────────────────────────────
if __name__ == "__main__":
    args = sys.argv[1:]

    if not args or args[0] in ("-h", "--help"):
        print("""
YouTube -> Peptide AI Pipeline
==============================
Usage:
  uv run python scripts/ingest_youtube.py <VIDEO_URL_OR_ID>
  uv run python scripts/ingest_youtube.py <URL> --force          (re-ingest even if exists)
  uv run python scripts/ingest_youtube.py --channel <CHANNEL_URL> [--limit N] [--delay N]
  uv run python scripts/ingest_youtube.py --purge <VIDEO_ID>     (delete all chunks for video)
  uv run python scripts/ingest_youtube.py --status               (show ingested videos)

Options:
  --force       Re-ingest even if video already exists
  --limit N     Max videos to fetch from channel (default: 100)
  --delay N     Seconds between videos to avoid rate limit (default: 10)
  --cookies F   Path to cookies.txt file to bypass YouTube IP bans
                Export from Chrome: use 'Get cookies.txt LOCALLY' extension

Examples:
  uv run python scripts/ingest_youtube.py "https://www.youtube.com/watch?v=VIDEO_ID"
  uv run python scripts/ingest_youtube.py --channel "https://www.youtube.com/@drtrevorbachmeyer/videos" --limit 100 --delay 15
  uv run python scripts/ingest_youtube.py --channel "URL" --cookies cookies.txt
  uv run python scripts/ingest_youtube.py --purge e_p5nJ48_6I
""")
        sys.exit(0)

    force = "--force" in args
    args = [a for a in args if a != "--force"]

    # Parse --cookies flag
    cookies_path = ""
    if "--cookies" in args:
        idx = args.index("--cookies")
        if idx + 1 < len(args):
            cookies_path = args[idx + 1]
            args = args[:idx] + args[idx + 2:]
        else:
            print("ERROR: Provide a path after --cookies")
            sys.exit(1)

    if args[0] == "--channel":
        channel_url = args[1] if len(args) > 1 else ""
        limit = 100
        delay = 10
        if "--limit" in args:
            idx = args.index("--limit")
            if idx + 1 < len(args):
                limit = int(args[idx + 1])
        if "--delay" in args:
            idx = args.index("--delay")
            if idx + 1 < len(args):
                delay = int(args[idx + 1])
        if not channel_url:
            print("ERROR: Provide a channel URL after --channel")
            sys.exit(1)
        process_channel(channel_url, limit=limit, force=force, delay=delay, cookies_path=cookies_path)
    elif args[0] == "--purge" and len(args) > 1:
        purge_video(extract_video_id(args[1]))
    elif args[0] == "--status":
        # Show ingested video stats
        result = supabase.table("embeddings") \
            .select("metadata") \
            .eq("metadata->>source", "youtube_pipeline") \
            .execute()
        videos = {}
        for row in (result.data or []):
            vid = row.get("metadata", {}).get("video_id", "unknown")
            title = row.get("metadata", {}).get("title", "")
            if vid not in videos:
                videos[vid] = {"count": 0, "title": title}
            videos[vid]["count"] += 1

        if not videos:
            print("No videos ingested yet.")
        else:
            print(f"\n{'Video ID':<15} {'Chunks':<8} {'Title'}")
            print("-" * 60)
            for vid, info in videos.items():
                print(f"{vid:<15} {info['count']:<8} {info['title'][:40]}")
            print(f"\nTotal: {sum(v['count'] for v in videos.values())} chunks across {len(videos)} videos")
    else:
        for url in args:
            process_video(url, force=force, cookies_path=cookies_path)
