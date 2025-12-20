# Database Migrations

## Tổng quan
Các file migration này cần được chạy trong Supabase SQL Editor để cập nhật database schema.

## Hướng dẫn chạy Migrations

### Bước 1: Truy cập Supabase Dashboard
1. Đăng nhập vào [Supabase Dashboard](https://app.supabase.com)
2. Chọn project của bạn
3. Vào **SQL Editor** ở sidebar bên trái

### Bước 2: Chạy các Migration theo thứ tự

#### Migration 001: File Storage Setup
**File**: `001_add_file_storage.sql`
**Mục đích**: Tạo bảng `dataset_files` để lưu thông tin file
**Status**: ✅ Đã chạy

```sql
-- Chạy file 001_add_file_storage.sql
```

#### Migration 002: Storage Bucket Setup  
**File**: `002_create_storage_bucket.sql` hoặc `SETUP_STORAGE_COMPLETE.sql`
**Mục đích**: Tạo Storage bucket `dataset-files`
**Status**: ✅ Đã chạy

```sql
-- Chạy file SETUP_STORAGE_COMPLETE.sql
```

#### Migration 003: Submissions System ⚠️ CHƯA CHẠY
**File**: `003_add_submissions.sql`
**Mục đích**: Tạo bảng `submissions` để track từng lượt trả lời của user
**Status**: ⚠️ CẦN CHẠY NGAY

**Cách chạy**:
1. Mở file `003_add_submissions.sql`
2. Copy toàn bộ nội dung
3. Paste vào SQL Editor trong Supabase
4. Click **Run** (hoặc Ctrl+Enter)

**Thay đổi**:
- ✅ Tạo bảng `submissions` (id, dataset_id, user_id, status, started_at, submitted_at)
- ✅ Thêm cột `submission_id` vào bảng `answers`
- ✅ Tạo indexes cho performance
- ✅ Cập nhật RLS policies
- ✅ Migration script tự động convert answers hiện có thành submissions

**Kiểm tra sau khi chạy**:
```sql
-- Check submissions table được tạo
SELECT * FROM submissions LIMIT 5;

-- Check answers có submission_id
SELECT id, submission_id, answer_value FROM answers LIMIT 5;

-- Check RLS policies
SELECT tablename, policyname FROM pg_policies 
WHERE tablename IN ('submissions', 'answers');
```

## Chi tiết về Submissions System

### Khái niệm
- **Submission**: Một lượt trả lời hoàn chỉnh của user cho 1 dataset
- Mỗi submission bao gồm nhiều answers
- Theo dõi trạng thái: `in_progress` → `completed`

### Workflow
1. User bắt đầu trả lời → tạo submission với `status='in_progress'`
2. User điền câu trả lời → insert answers với `submission_id`
3. User submit → update submission `status='completed'`, `submitted_at=NOW()`

### API Changes
- **POST /answers/batch**: Giờ nhận `{ dataset_id, answers: [...] }`
- **GET /datasets/:id/answers**: Trả về `{ submissions: [...], total_submissions, total_answers }`

### Frontend Changes
- **DatasetAnswers.jsx**: Hiển thị theo lượt trả lời (submissions)
- **DatasetLabeling.jsx**: Submit với cấu trúc mới có `dataset_id`
- **JSON Export**: Xuất theo submissions, mỗi submission là 1 bộ training data

## Troubleshooting

### Lỗi: relation "submissions" does not exist
**Nguyên nhân**: Chưa chạy migration 003
**Giải pháp**: Chạy file `003_add_submissions.sql`

### Lỗi: column "submission_id" does not exist
**Nguyên nhân**: Migration 003 chạy không thành công
**Giải pháp**: 
1. Kiểm tra lỗi trong SQL Editor
2. Chạy lại migration 003

### Lỗi: RLS policy violation
**Nguyên nhân**: RLS policies chưa được tạo đúng
**Giải pháp**:
```sql
-- Check user role
SELECT auth.uid(), auth.jwt() ->> 'email';

-- Kiểm tra policies
SELECT * FROM pg_policies WHERE tablename = 'submissions';
```

## Rollback (Nếu cần)

Nếu cần rollback migration 003:
```sql
-- Drop foreign key constraint
ALTER TABLE answers DROP CONSTRAINT IF EXISTS answers_submission_id_fkey;

-- Drop column
ALTER TABLE answers DROP COLUMN IF EXISTS submission_id;

-- Drop table
DROP TABLE IF EXISTS submissions CASCADE;
```

⚠️ **CHÚ Ý**: Rollback sẽ mất toàn bộ dữ liệu submissions!

## Best Practices

1. **Backup trước khi chạy migration**
   - Supabase tự động backup, nhưng nên export data quan trọng

2. **Test trong development environment trước**
   - Tạo project test để chạy thử migrations

3. **Chạy migrations trong giờ ít người dùng**
   - Migration 003 có thể mất vài phút với nhiều dữ liệu

4. **Verify sau mỗi migration**
   - Luôn check tables, columns, indexes được tạo đúng

## Contact
Nếu gặp vấn đề, check:
1. Supabase logs: Dashboard → Logs
2. Backend logs: `npm run dev` trong terminal
3. Frontend console: F12 trong browser
