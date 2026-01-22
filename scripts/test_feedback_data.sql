-- Insert a test contact if not exists
INSERT INTO public.contacts (id, name, type, org_id, tier)
VALUES ('00000000-0000-0000-0000-000000000001', 'Test Client', 'customer', (SELECT id FROM organizations LIMIT 1), 'family')
ON CONFLICT (id) DO NOTHING;

-- Insert a test protocol
INSERT INTO public.protocols (id, name, contact_id, org_id)
VALUES ('00000000-0000-0000-0000-000000000002', 'Test Protocol', '00000000-0000-0000-0000-000000000001', (SELECT id FROM organizations LIMIT 1))
ON CONFLICT (id) DO NOTHING;

-- Insert test feedback (Unread, Unreplied)
INSERT INTO public.protocol_feedback (id, protocol_id, rating, comment, created_at)
VALUES ('00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000002', 4, 'Great results so far!', NOW())
ON CONFLICT (id) DO NOTHING;

-- Insert test feedback (Replied, Unread by Client)
INSERT INTO public.protocol_feedback (id, protocol_id, rating, comment, created_at, admin_response, response_at, is_read_by_client)
VALUES ('00000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000002', 2, 'Feeling dizzy.', NOW() - INTERVAL '1 day', 'Please reduce dosage.', NOW(), false)
ON CONFLICT (id) DO NOTHING;
