-- Allow authenticated users (admin) to delete quote_requests
CREATE POLICY "Admins can delete quote requests"
  ON quote_requests FOR DELETE
  TO authenticated
  USING (true);
