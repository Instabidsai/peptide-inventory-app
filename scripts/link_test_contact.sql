-- Create Dummy Contact for Messaging Test
INSERT INTO public.contacts (id, name, email, tier, linked_user_id)
VALUES (
  gen_random_uuid(),
  'Test Client Thread',
  'client_test_thread@test.com',
  'family',
  'b98dfae6-c45a-45ff-bb20-f91096c75dc9' -- The UID we just got
)
ON CONFLICT (email) DO UPDATE 
SET linked_user_id = 'b98dfae6-c45a-45ff-bb20-f91096c75dc9';
