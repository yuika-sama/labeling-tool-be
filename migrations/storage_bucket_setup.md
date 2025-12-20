# Setup Storage Bucket trong Supabase

## Bước 1: Tạo Storage Bucket

### Cách 1: Qua Supabase Dashboard (Khuyến nghị)

1. Truy cập Supabase Dashboard: https://app.supabase.com
2. Chọn project của bạn
3. Vào menu **Storage** ở sidebar bên trái
4. Click nút **"New bucket"**
5. Điền thông tin:
   - **Name**: `dataset-files`
   - **Public bucket**: ✅ Bật (để user có thể xem files)
   - **File size limit**: 50MB (hoặc tùy nhu cầu)
   - **Allowed MIME types**: Để trống hoặc chỉ định: `image/*,video/*,audio/*,text/csv`
6. Click **"Create bucket"**

### Cách 2: Qua SQL (Nếu cần)

```sql
-- Tạo bucket bằng SQL
INSERT INTO storage.buckets (id, name, public)
VALUES ('dataset-files', 'dataset-files', true);
```

## Bước 2: Cấu hình Storage Policies

Chạy các SQL queries sau trong SQL Editor của Supabase:

```sql
-- =============================================
-- Storage Policies cho bucket 'dataset-files'
-- =============================================

-- 1. Policy: Admin có thể upload files
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

-- 2. Policy: Admin có thể update files
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

-- 3. Policy: Admin có thể xóa files
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

-- 4. Policy: Mọi người có thể xem files (public bucket)
CREATE POLICY "Anyone can view files"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'dataset-files');

-- Nếu muốn chỉ cho phép authenticated users xem:
-- DROP POLICY "Anyone can view files" ON storage.objects;
-- CREATE POLICY "Authenticated users can view files"
-- ON storage.objects FOR SELECT
-- TO authenticated
-- USING (bucket_id = 'dataset-files');
```

## Bước 3: Kiểm tra Setup

### Kiểm tra bucket đã được tạo:

```sql
SELECT * FROM storage.buckets WHERE id = 'dataset-files';
```

### Kiểm tra policies:

```sql
SELECT * FROM pg_policies 
WHERE tablename = 'objects' 
AND policyname LIKE '%dataset-files%';
```

### Test upload file qua API:

```javascript
// Trong code, test upload:
const { data, error } = await supabase.storage
  .from('dataset-files')
  .upload('test/test.txt', new Blob(['Hello World'], { type: 'text/plain' }));

console.log(data, error);
```

## Bước 4: Cấu hình Backend

Đảm bảo file `.env` có đúng thông tin:

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_KEY=your-service-role-key
JWT_SECRET=your-jwt-secret
PORT=5000
```

## Bước 5: Test Upload từ Backend

Chạy backend và test upload API:

```bash
# Terminal 1: Start backend
cd backend
npm run dev

# Terminal 2: Test upload
curl -X POST http://localhost:5000/api/datasets/YOUR_DATASET_ID/files \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -F "files=@/path/to/your/image.jpg"
```

## Troubleshooting

### Lỗi: "new row violates row-level security policy"
- Kiểm tra RLS policies đã được tạo đúng
- Đảm bảo user có role 'admin'

### Lỗi: "Bucket not found"
- Kiểm tra tên bucket đúng là 'dataset-files'
- Kiểm tra bucket đã được tạo trong Dashboard

### Lỗi: "Policy not found"
- Chạy lại các SQL tạo policies
- Kiểm tra policies trong Dashboard > Storage > Policies

### Files không hiển thị được
- Kiểm tra bucket có được set là public không
- Kiểm tra CORS settings trong Dashboard

## Cấu trúc thư mục trong Storage

Bucket sẽ lưu files theo cấu trúc:

```
dataset-files/
├── datasets/
│   ├── {dataset-id}/
│   │   ├── {timestamp}-{original-filename}
│   │   ├── {timestamp}-{original-filename}
│   │   └── ...
│   └── ...
└── ...
```

## URL Format

Files sẽ có URL dạng:

```
https://your-project.supabase.co/storage/v1/object/public/dataset-files/datasets/{dataset-id}/{filename}
```

## Giới hạn

- File size mặc định: 50MB
- Có thể tăng lên trong Dashboard > Storage > Settings
- Quota tùy thuộc vào plan Supabase (Free: 1GB, Pro: 100GB)

---

✅ **Sau khi hoàn tất các bước trên, hệ thống file storage đã sẵn sàng!**
