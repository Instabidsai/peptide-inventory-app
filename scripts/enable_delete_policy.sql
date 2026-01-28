-- Ensure RLS allows DELETE for own requests
DROP POLICY IF EXISTS "Users can delete own requests" ON public.client_requests;

CREATE POLICY "Users can delete own requests"
ON public.client_requests
FOR DELETE
USING (auth.uid() = user_id);
