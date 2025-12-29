# Tool Gán Nhãn Dữ Liệu - Labeling Tool - Backend side

Tool gán nhãn dữ liệu với phân quyền Admin/User, lưu trữ trên Supabase, và backend API riêng biệt.

## Thành viên thực hiện (GROUP CVF25PRJ01)
* Nguyễn Đức Anh - B22DCPT009

## Cấu trúc Database (Supabase)

Bạn cần tạo các bảng sau trong Supabase:

### 1. Bảng `users`
```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  username VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  role VARCHAR(50) NOT NULL CHECK (role IN ('admin', 'user')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);
```

### 2. Bảng `datasets`
```sql
CREATE TABLE datasets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  file_type VARCHAR(50) NOT NULL,
  created_by UUID REFERENCES users(id),
  is_published BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_datasets_created_by ON datasets(created_by);
CREATE INDEX idx_datasets_published ON datasets(is_published);
```

### 3. Bảng `questions`
```sql
CREATE TABLE questions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  dataset_id UUID REFERENCES datasets(id) ON DELETE CASCADE,
  question_text TEXT NOT NULL,
  answer_type VARCHAR(50) NOT NULL,
  options JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_questions_dataset ON questions(dataset_id);
```

### 4. Bảng `dataset_files`
```sql
CREATE TABLE dataset_files (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  dataset_id UUID REFERENCES datasets(id) ON DELETE CASCADE,
  file_name VARCHAR(255) NOT NULL,
  file_path TEXT NOT NULL,
  file_url TEXT NOT NULL,
  file_type VARCHAR(100),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_dataset_files_dataset ON dataset_files(dataset_id);
```

### 5. Bảng `answers`
```sql
CREATE TABLE answers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  dataset_id UUID REFERENCES datasets(id) ON DELETE CASCADE,
  question_id UUID REFERENCES questions(id) ON DELETE CASCADE,
  file_id UUID REFERENCES dataset_files(id) ON DELETE SET NULL,
  answer_value TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_answers_user ON answers(user_id);
CREATE INDEX idx_answers_dataset ON answers(dataset_id);
CREATE INDEX idx_answers_question ON answers(question_id);
CREATE INDEX idx_answers_file ON answers(file_id);
```

### 6. Storage Bucket
Tạo một storage bucket tên `dataset-files` trong Supabase Storage với quyền public read.

## Cài đặt

1. Clone repository và vào thư mục backend:
```bash
cd backend
```

2. Cài đặt dependencies:
```bash
npm install
```

3. Tạo file `.env` từ `.env.example`:
```bash
cp .env.example .env
```

4. Điền thông tin Supabase vào file `.env`:
- `SUPABASE_URL`: URL của project Supabase
- `SUPABASE_ANON_KEY`: Anon key từ Supabase
- `SUPABASE_SERVICE_KEY`: Service role key từ Supabase
- `JWT_SECRET`: Chuỗi bí mật để mã hóa JWT

5. Chạy server:
```bash
# Development
npm run dev

# Production
npm start
```

Server sẽ chạy tại `http://localhost:5000`

## API Endpoints

### Authentication
- `POST /api/auth/register` - Đăng ký tài khoản mới
- `POST /api/auth/login` - Đăng nhập
- `GET /api/auth/me` - Lấy thông tin user hiện tại

### Datasets
- `GET /api/datasets` - Lấy danh sách datasets
- `GET /api/datasets/:id` - Lấy chi tiết dataset
- `POST /api/datasets` - Tạo dataset mới (Admin only)
- `PUT /api/datasets/:id` - Cập nhật dataset (Admin only)
- `DELETE /api/datasets/:id` - Xóa dataset (Admin only)
- `POST /api/datasets/:id/files` - Upload files cho dataset (Admin only)
- `GET /api/datasets/:id/answers` - Lấy tất cả câu trả lời (Admin only)

### Questions
- `GET /api/questions/dataset/:datasetId` - Lấy câu hỏi của dataset
- `POST /api/questions` - Thêm câu hỏi (Admin only)
- `PUT /api/questions/:id` - Cập nhật câu hỏi (Admin only)
- `DELETE /api/questions/:id` - Xóa câu hỏi (Admin only)

### Answers
- `POST /api/answers` - Submit câu trả lời
- `POST /api/answers/batch` - Submit nhiều câu trả lời
- `GET /api/answers/my-answers/:datasetId` - Lấy câu trả lời của user
- `DELETE /api/answers/:id` - Xóa câu trả lời

## Quyền truy cập

### Admin
- Tạo, sửa, xóa datasets
- Tạo, sửa, xóa câu hỏi
- Upload files cho datasets
- Xem tất cả câu trả lời
- Publish/unpublish datasets

### User
- Xem datasets đã được publish
- Trả lời câu hỏi
- Xem câu trả lời của mình
- Sửa/xóa câu trả lời của mình

## Deploy

Để deploy backend:

1. Chọn nền tảng: Railway, Render, Heroku, hoặc VPS
2. Set environment variables
3. Deploy code
4. Cập nhật CORS settings nếu cần

## Lưu ý

- Tất cả requests cần có JWT token trong header (trừ login/register)
- Format: `Authorization: Bearer <token>`
- Token có thời hạn 7 ngày
