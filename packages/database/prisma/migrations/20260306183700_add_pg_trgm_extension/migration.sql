-- Enable pg_trgm extension for trigram-based fuzzy text search.
-- Used by the Global People Search feature (admin/global-search/people).
CREATE EXTENSION IF NOT EXISTS pg_trgm;
