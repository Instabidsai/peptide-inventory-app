-- Composite indexes for notifications table to fix slow fetches (6-9.4s)
-- Covers: unread count query (user_id + is_read) and list query (user_id + created_at)
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
  ON public.notifications(user_id, is_read)
  WHERE is_read = false;

CREATE INDEX IF NOT EXISTS idx_notifications_user_created
  ON public.notifications(user_id, created_at DESC);
