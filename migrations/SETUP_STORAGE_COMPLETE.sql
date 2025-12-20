-- =============================================
-- STORAGE BUCKET SETUP - CHẠY TOÀN BỘ FILE NÀY
-- =============================================
-- Copy toàn bộ file này và paste vào Supabase SQL Editor
-- Sau đó click "Run"

-- =============================================
-- BƯỚC 1: Tạo Storage Bucket
-- =============================================

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('dataset-files', 'dataset-files', true, 52428800)
ON CONFLICT (id) DO NOTHING;

-- =============================================
-- BƯỚC 2: Xóa policies cũ (nếu có)
-- =============================================

DROP POLICY IF EXISTS "Admin can upload files" ON storage.objects;
DROP POLICY IF EXISTS "Admin can update files" ON storage.objects;
DROP POLICY IF EXISTS "Admin can delete files" ON storage.objects;
DROP POLICY IF EXISTS "Public can view files" ON storage.objects;

-- =============================================
-- BƯỚC 3: Tạo Storage Policies
-- =============================================

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

-- Policy 3: Admin có thể delete files
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

-- Policy 4: Mọi người có thể xem files (public)
CREATE POLICY "Public can view files"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'dataset-files');

-- =============================================
-- HOÀN THÀNH!
-- =============================================
-- Bây giờ bạn có thể:
-- 1. Test: cd backend && node test-storage.js
-- 2. Upload files trong app
