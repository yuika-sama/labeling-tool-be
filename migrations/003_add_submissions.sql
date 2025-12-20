-- =============================================
-- Migration: Add Submissions Table
-- Description: Thêm bảng submissions để track từng lượt trả lời
-- Date: 2025-12-19
-- =============================================

-- 1. Tạo bảng submissions
-- Mỗi submission đại diện cho 1 lượt trả lời của user cho 1 dataset
CREATE TABLE IF NOT EXISTS submissions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  dataset_id UUID REFERENCES datasets(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  status VARCHAR(50) DEFAULT 'in_progress', -- in_progress, completed
  started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  submitted_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Thêm cột submission_id vào bảng answers
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'answers' 
    AND column_name = 'submission_id'
  ) THEN
    ALTER TABLE answers ADD COLUMN submission_id UUID REFERENCES submissions(id) ON DELETE CASCADE;
  END IF;
END $$;

-- 3. Tạo indexes
CREATE INDEX IF NOT EXISTS idx_submissions_dataset ON submissions(dataset_id);
CREATE INDEX IF NOT EXISTS idx_submissions_user ON submissions(user_id);
CREATE INDEX IF NOT EXISTS idx_submissions_status ON submissions(status);
CREATE INDEX IF NOT EXISTS idx_submissions_created_at ON submissions(created_at);
CREATE INDEX IF NOT EXISTS idx_answers_submission ON answers(submission_id);

-- 4. Tạo function và trigger để auto-update updated_at
CREATE OR REPLACE FUNCTION update_submissions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_submissions_updated_at ON submissions;
CREATE TRIGGER trigger_update_submissions_updated_at
  BEFORE UPDATE ON submissions
  FOR EACH ROW
  EXECUTE FUNCTION update_submissions_updated_at();

-- 5. Thêm RLS policies cho submissions
ALTER TABLE submissions ENABLE ROW LEVEL SECURITY;

-- Policy: User chỉ thấy submissions của mình
DROP POLICY IF EXISTS "Users can view own submissions" ON submissions;
CREATE POLICY "Users can view own submissions"
ON submissions FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
    AND users.role = 'admin'
  )
);

-- Policy: User có thể tạo submissions
DROP POLICY IF EXISTS "Users can create submissions" ON submissions;
CREATE POLICY "Users can create submissions"
ON submissions FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

-- Policy: User có thể update submissions của mình
DROP POLICY IF EXISTS "Users can update own submissions" ON submissions;
CREATE POLICY "Users can update own submissions"
ON submissions FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- Policy: Admin có thể xóa submissions
DROP POLICY IF EXISTS "Admins can delete submissions" ON submissions;
CREATE POLICY "Admins can delete submissions"
ON submissions FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
    AND users.role = 'admin'
  )
);

-- 6. Cập nhật RLS policies cho answers để include submission_id check
DROP POLICY IF EXISTS "Users can view answers" ON answers;
CREATE POLICY "Users can view answers"
ON answers FOR SELECT
TO authenticated
USING (
  -- User có thể xem answers của submissions mình tạo
  EXISTS (
    SELECT 1 FROM submissions
    WHERE submissions.id = answers.submission_id
    AND submissions.user_id = auth.uid()
  )
  OR
  -- Admin có thể xem tất cả
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
    AND users.role = 'admin'
  )
);

-- 7. Comments
COMMENT ON TABLE submissions IS 'Lưu trữ các lượt trả lời (submission session) của user cho dataset';
COMMENT ON COLUMN submissions.id IS 'ID của lượt trả lời';
COMMENT ON COLUMN submissions.dataset_id IS 'Dataset mà user đang trả lời';
COMMENT ON COLUMN submissions.user_id IS 'User thực hiện lượt trả lời';
COMMENT ON COLUMN submissions.status IS 'Trạng thái: in_progress (đang làm), completed (đã hoàn thành)';
COMMENT ON COLUMN submissions.started_at IS 'Thời điểm bắt đầu lượt trả lời';
COMMENT ON COLUMN submissions.submitted_at IS 'Thời điểm submit hoàn tất';

-- 8. Migration dữ liệu cũ (nếu có)
-- Tạo submissions cho các answers hiện có (group theo user + dataset + ngày)
DO $$
DECLARE
  answer_record RECORD;
  new_submission_id UUID;
  current_user_id UUID;
  current_dataset_id UUID;
  answer_date_value DATE;
BEGIN
  -- Loop qua các answers chưa có submission_id
  FOR answer_record IN 
    SELECT DISTINCT user_id, dataset_id, DATE(created_at) as answer_date
    FROM answers 
    WHERE submission_id IS NULL
    ORDER BY user_id, dataset_id, answer_date
  LOOP
    current_user_id := answer_record.user_id;
    current_dataset_id := answer_record.dataset_id;
    answer_date_value := answer_record.answer_date;
    
    -- Tạo submission mới
    INSERT INTO submissions (dataset_id, user_id, status, started_at, submitted_at)
    VALUES (current_dataset_id, current_user_id, 'completed', answer_date_value, answer_date_value)
    RETURNING id INTO new_submission_id;
    
    -- Gán submission_id cho các answers cùng user, dataset, và ngày
    UPDATE answers
    SET submission_id = new_submission_id
    WHERE user_id = current_user_id
      AND dataset_id = current_dataset_id
      AND DATE(created_at) = answer_date_value
      AND submission_id IS NULL;
  END LOOP;
END $$;

-- =============================================
-- COMPLETED - Submissions table đã được tạo
-- =============================================
-- Chạy file này trong Supabase SQL Editor
-- Sau đó update backend code để sử dụng submissions
