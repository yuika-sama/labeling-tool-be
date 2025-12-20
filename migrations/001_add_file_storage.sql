-- =============================================
-- Migration: Add File Storage Support
-- Description: Tạo bảng dataset_files và storage bucket
-- =============================================

-- 1. Kiểm tra và tạo bảng dataset_files nếu chưa tồn tại
CREATE TABLE IF NOT EXISTS dataset_files (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  dataset_id UUID REFERENCES datasets(id) ON DELETE CASCADE,
  file_name VARCHAR(255) NOT NULL,
  file_path TEXT NOT NULL,
  file_url TEXT NOT NULL,
  file_type VARCHAR(100),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Thêm các cột còn thiếu nếu chưa có
DO $$ 
BEGIN
  -- Thêm cột file_size nếu chưa có
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'dataset_files' 
    AND column_name = 'file_size'
  ) THEN
    ALTER TABLE dataset_files ADD COLUMN file_size BIGINT;
  END IF;
END $$;

-- Tạo indexes cho performance
CREATE INDEX IF NOT EXISTS idx_dataset_files_dataset ON dataset_files(dataset_id);
CREATE INDEX IF NOT EXISTS idx_dataset_files_created_at ON dataset_files(created_at);

-- Thêm trigger để tự động cập nhật updated_at
CREATE OR REPLACE FUNCTION update_dataset_files_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_dataset_files_updated_at ON dataset_files;
CREATE TRIGGER trigger_update_dataset_files_updated_at
  BEFORE UPDATE ON dataset_files
  FOR EACH ROW
  EXECUTE FUNCTION update_dataset_files_updated_at();

-- 2. Thêm comment cho bảng và các cột (chỉ cho các cột tồn tại)
COMMENT ON TABLE dataset_files IS 'Lưu trữ thông tin các file được upload cho datasets';

DO $$
BEGIN
  -- Comment cho các cột cơ bản (luôn có)
  COMMENT ON COLUMN dataset_files.id IS 'ID duy nhất của file';
  COMMENT ON COLUMN dataset_files.dataset_id IS 'ID của dataset chứa file này';
  COMMENT ON COLUMN dataset_files.file_name IS 'Tên gốc của file';
  COMMENT ON COLUMN dataset_files.file_path IS 'Đường dẫn lưu trữ trong storage bucket';
  COMMENT ON COLUMN dataset_files.file_url IS 'URL công khai để truy cập file';
  
  -- Comment cho cột file_type nếu có
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'dataset_files' AND column_name = 'file_type') THEN
    COMMENT ON COLUMN dataset_files.file_type IS 'MIME type của file';
  END IF;
  
  -- Comment cho cột file_size nếu có
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'dataset_files' AND column_name = 'file_size') THEN
    COMMENT ON COLUMN dataset_files.file_size IS 'Kích thước file (bytes)';
  END IF;
END $$;

-- 3. Cấp quyền truy cập
-- Admin có thể làm mọi thứ
GRANT ALL ON dataset_files TO authenticated;

-- Cho phép anonymous đọc files từ published datasets
CREATE OR REPLACE FUNCTION can_read_dataset_file(file_dataset_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM datasets 
    WHERE id = file_dataset_id 
    AND is_published = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Row Level Security (RLS) Policies
ALTER TABLE dataset_files ENABLE ROW LEVEL SECURITY;

-- Policy: Admin có thể làm mọi thứ
DROP POLICY IF EXISTS "Admin full access to dataset_files" ON dataset_files;
CREATE POLICY "Admin full access to dataset_files"
  ON dataset_files
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
    )
  );

-- Policy: User có thể xem files từ published datasets
DROP POLICY IF EXISTS "Users can view published dataset files" ON dataset_files;
CREATE POLICY "Users can view published dataset files"
  ON dataset_files
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM datasets
      WHERE datasets.id = dataset_files.dataset_id
      AND datasets.is_published = true
    )
  );

-- Policy: Cho phép anonymous xem files từ published datasets (nếu cần)
DROP POLICY IF EXISTS "Anonymous can view published dataset files" ON dataset_files;
CREATE POLICY "Anonymous can view published dataset files"
  ON dataset_files
  FOR SELECT
  TO anon
  USING (
    EXISTS (
      SELECT 1 FROM datasets
      WHERE datasets.id = dataset_files.dataset_id
      AND datasets.is_published = true
    )
  );

-- 5. Thêm cột file_count vào bảng datasets (nếu chưa có)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'datasets' 
    AND column_name = 'file_count'
  ) THEN
    ALTER TABLE datasets ADD COLUMN file_count INTEGER DEFAULT 0;
  END IF;
END $$;

-- Tạo function để tự động cập nhật file_count
CREATE OR REPLACE FUNCTION update_dataset_file_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE datasets 
    SET file_count = file_count + 1 
    WHERE id = NEW.dataset_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE datasets 
    SET file_count = GREATEST(0, file_count - 1) 
    WHERE id = OLD.dataset_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Tạo trigger cho file_count
DROP TRIGGER IF EXISTS trigger_update_dataset_file_count ON dataset_files;
CREATE TRIGGER trigger_update_dataset_file_count
  AFTER INSERT OR DELETE ON dataset_files
  FOR EACH ROW
  EXECUTE FUNCTION update_dataset_file_count();

-- 6. Cập nhật file_count cho các datasets hiện có
UPDATE datasets 
SET file_count = (
  SELECT COUNT(*) 
  FROM dataset_files 
  WHERE dataset_files.dataset_id = datasets.id
);

-- =============================================
-- Verification Queries (chạy để kiểm tra)
-- =============================================

-- Kiểm tra bảng đã được tạo
SELECT EXISTS (
  SELECT FROM information_schema.tables 
  WHERE table_name = 'dataset_files'
) AS table_exists;

-- Kiểm tra indexes
SELECT indexname, indexdef 
FROM pg_indexes 
WHERE tablename = 'dataset_files';

-- Kiểm tra RLS policies
SELECT * FROM pg_policies WHERE tablename = 'dataset_files';

-- =============================================
-- DONE! 
-- =============================================
-- Sau khi chạy script này, bạn cần:
-- 1. Tạo Storage Bucket trong Supabase Dashboard
-- 2. Xem file storage_bucket_setup.md để biết cách setup
-- =============================================
