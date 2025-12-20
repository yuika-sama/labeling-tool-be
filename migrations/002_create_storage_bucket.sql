-- =============================================
-- BƯỚC 1: Tạo Storage Bucket
-- =============================================
-- Chạy query này trong Supabase SQL Editor

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'dataset-files',
  'dataset-files', 
  true,
  52428800, -- 50MB limit
  ARRAY['image/*', 'video/*', 'audio/*', 'text/csv', 'application/vnd.ms-excel']::text[]
)
ON CONFLICT (id) DO NOTHING;

-- =============================================
-- BƯỚC 2: Tạo Storage Policies
-- =============================================

-- Xóa policies cũ nếu có
DROP POLICY IF EXISTS "Admin can upload files" ON storage.objects;
DROP POLICY IF EXISTS "Admin can update files" ON storage.objects;
DROP POLICY IF EXISTS "Admin can delete files" ON storage.objects;
DROP POLICY IF EXISTS "Public can view files" ON storage.objects;

-- Policy 1: Admin có thể upload files
CREATE POLICY "Admin can upload files"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'dataset-files' 
  AND EXISTS (
    SELECT 1 FROM public.users
    WHERE users.id = auth.uid()
    AND users.role = 'admin'
  )
);

-- Policy 2: Admin có thể update files  
CREATE POLICY "Admin can update files"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'dataset-files'
  AND EXISTS (
    SELECT 1 FROM public.users
    WHERE users.id = auth.uid()
    AND users.role = 'admin'
  )
);

-- Policy 3: Admin có thể xóa files
CREATE POLICY "Admin can delete files"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'dataset-files'
  AND EXISTS (
    SELECT 1 FROM public.users
    WHERE users.id = auth.uid()
    AND users.role = 'admin'
  )
);

-- Policy 4: Mọi người có thể xem files (public bucket)
CREATE POLICY "Public can view files"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'dataset-files');

-- =============================================
-- BƯỚC 3: Verify
-- =============================================

-- Kiểm tra bucket đã được tạo
SELECT * FROM storage.buckets WHERE id = 'dataset-files';

-- Kiểm tra policies
SELECT 
  schemaname, 
  tablename, 
  policyname, 
  permissive, 
  roles, 
  cmd
FROM pg_policies 
WHERE tablename = 'objects' 
AND policyname LIKE '%dataset-files%' OR policyname LIKE '%Admin%' OR policyname LIKE '%Public%';

-- =============================================
-- DONE!
-- Sau khi chạy script này:
-- 1. Bucket "dataset-files" đã được tạo
-- 2. Policies đã được setup
-- 3. Admin có thể upload/delete files
-- 4. Public có thể xem files
-- =============================================
