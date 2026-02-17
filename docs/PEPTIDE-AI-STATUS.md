# Peptide AI — Current Status (Feb 15, 2026)

## What's Built & Working

### Edge Functions (Supabase)
- **`chat-with-ai`** (v7, ACTIVE, verify_jwt: false)
  - GPT-4o-search-preview with web search
  - Conversation persistence (ai_conversations + ai_messages)
  - Health profile extraction after every message (GPT-4o-mini)
  - Learned insights accumulation
  - Live health data context (inventory, protocols, body comp, meals)
  - RAG via pgvector embeddings
  - Type coercion for extraction bug fix

- **`process-health-document`** (v4, ACTIVE, verify_jwt: false)
  - Upload PDF/PNG/JPEG → GPT-4o Vision text extraction
  - Auto-chunking + embedding generation
  - Lab value extraction → health profile
  - Document insights → learned insights

### Database Tables
| Table | Purpose | RLS |
|-------|---------|-----|
| `ai_conversations` | Chat session containers | Yes |
| `ai_messages` | All chat messages | Yes |
| `ai_health_profiles` | Structured health data per user | Yes |
| `ai_learned_insights` | Research/protocol/lab insights | Yes |
| `ai_documents` | Uploaded document records | Yes |

### Storage
- Bucket: `health-documents` (private, 10MB limit)

### Frontend Components
- `src/components/ai/AIChatInterface.tsx` — Main chat UI with file upload
- `src/components/ai/PeptideAIKnowledgePanel.tsx` — Knowledge drawer (health profile, insights, docs)
- `src/hooks/use-ai.ts` — Chat hook with optimistic UI + auto-refresh
- `src/hooks/use-ai-knowledge.ts` — Knowledge panel data + refresh

### Verified Working (API Tests)
- Chat with GPT-4o responses
- Conversation persistence across sessions
- Health profile extraction from brain dumps
- Cross-session memory recall
- Learned insights accumulation
- Web search with real URLs/citations
- TypeScript + Vite build clean

### Needs Visual Testing (Browser)
- Knowledge Panel UI (color-coded cards, lab flags, expandable sections)
- Paperclip file upload button in chat
- "New Chat" button
- Auto-refresh animation after each message
- Document processing status indicator

### Known Issues
- Document processing step 7 (lab extraction) can timeout on large documents
- gpt-4o-search-preview doesn't support `temperature` parameter
- Bundle size warning (942 kB main chunk)

### Training Data
- YouTube ingestion scripts ready: `scripts/ingest_bochman.ts`, `scripts/ingest_whisper.ts`
- Manual text ingestion: `scripts/ingest_manual.ts`
- Not yet run with real content — knowledge base is mostly empty

## OpenAI Costs
- Chat: gpt-4o-search-preview (~$5/1M input, $15/1M output + $30/1K searches)
- Extraction: gpt-4o-mini (~$0.15/1M input, $0.60/1M output)
- Embeddings: text-embedding-3-small ($0.02/1M tokens)
- Document processing: gpt-4o vision ($5/1M input)
