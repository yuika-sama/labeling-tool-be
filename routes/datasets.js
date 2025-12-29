import express from 'express';
import { supabase, supabaseAdmin } from '../config/supabase.js';
import { authenticate, authorize } from '../middleware/auth.js';
import multer from 'multer';
import path from 'path';

const router = express.Router();

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({ storage });

// Lấy tất cả datasets (cả admin và user)
router.get('/', authenticate, async (req, res) => {
  try {
    let query = supabase
      .from('datasets')
      .select(`
        *,
        users:created_by (username, email),
        questions (*)
      `)
      .order('created_at', { ascending: false });

    // Nếu là user thì chỉ lấy datasets đã được publish
    if (req.user.role === 'user') {
      query = query.eq('is_published', true);
    }

    const { data: datasets, error } = await query;

    if (error) {
      return res.status(500).json({ error: 'Không thể lấy danh sách datasets' });
    }

    res.json({ datasets });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Lấy chi tiết 1 dataset
router.get('/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;

    const { data: dataset, error } = await supabase
      .from('datasets')
      .select(`
        *,
        users:created_by (username, email),
        questions (*),
        dataset_files (*)
      `)
      .eq('id', id)
      .single();

    if (error || !dataset) {
      return res.status(404).json({ error: 'Dataset không tồn tại' });
    }

    // User chỉ được xem dataset đã publish
    if (req.user.role === 'user' && !dataset.is_published) {
      return res.status(403).json({ error: 'Không có quyền truy cập dataset này' });
    }

    res.json({ dataset });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Tạo dataset mới (chỉ admin)
router.post('/', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { name, description, file_type, questions, is_published = false } = req.body;

    if (!name || !file_type) {
      return res.status(400).json({ error: 'Vui lòng cung cấp tên và loại file' });
    }

    // Tạo dataset
    const { data: dataset, error: datasetError } = await supabase
      .from('datasets')
      .insert([
        {
          name,
          description,
          file_type,
          created_by: req.user.id,
          is_published
        }
      ])
      .select()
      .single();

    if (datasetError) {
      return res.status(500).json({ error: 'Không thể tạo dataset' });
    }

    // Thêm các câu hỏi nếu có
    if (questions && questions.length > 0) {
      const questionsData = questions.map(q => ({
        dataset_id: dataset.id,
        question_text: q.text,
        answer_type: q.answerType,
        options: q.options || null
      }));

      const { error: questionsError } = await supabase
        .from('questions')
        .insert(questionsData);

      if (questionsError) {
        console.error('Lỗi khi thêm câu hỏi:', questionsError);
      }
    }

    res.status(201).json({ message: 'Tạo dataset thành công', dataset });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Cập nhật dataset (chỉ admin)
router.put('/:id', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, file_type, is_published } = req.body;

    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (file_type !== undefined) updateData.file_type = file_type;
    if (is_published !== undefined) updateData.is_published = is_published;

    const { data: dataset, error } = await supabase
      .from('datasets')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return res.status(500).json({ error: 'Không thể cập nhật dataset' });
    }

    res.json({ message: 'Cập nhật dataset thành công', dataset });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Xóa dataset (chỉ admin)
router.delete('/:id', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { id } = req.params;

    // Xóa các bản ghi liên quan trước
    await supabase.from('answers').delete().eq('dataset_id', id);
    await supabase.from('questions').delete().eq('dataset_id', id);
    await supabase.from('dataset_files').delete().eq('dataset_id', id);

    const { error } = await supabase
      .from('datasets')
      .delete()
      .eq('id', id);

    if (error) {
      return res.status(500).json({ error: 'Không thể xóa dataset' });
    }

    res.json({ message: 'Xóa dataset thành công' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Upload files cho dataset (chỉ admin)
router.post('/:id/files', authenticate, authorize('admin'), upload.array('files', 50), async (req, res) => {
  try {
    const { id } = req.params;
    const files = req.files;

    console.log('Upload request for dataset:', id);
    console.log('Number of files received:', files?.length || 0);

    if (!files || files.length === 0) {
      return res.status(400).json({ error: 'Không có file nào được upload' });
    }

    // Kiểm tra dataset tồn tại
    const { data: dataset, error: datasetError } = await supabase
      .from('datasets')
      .select('*')
      .eq('id', id)
      .single();

    if (datasetError || !dataset) {
      console.error('Dataset not found:', id, datasetError);
      return res.status(404).json({ error: 'Dataset không tồn tại' });
    }

    console.log('Dataset found:', dataset.name);

    // Upload files lên Supabase Storage
    const uploadedFiles = [];
    const errors = [];
    
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const fileName = `${Date.now()}-${file.originalname}`;
      const filePath = `datasets/${id}/${fileName}`;

      console.log(`Uploading file ${i + 1}/${files.length}: ${file.originalname}`);

      // bypass RLS policies
      const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
        .from('dataset-files')
        .upload(filePath, file.buffer, {
          contentType: file.mimetype,
          upsert: false
        });

      if (uploadError) {
        console.error('Lỗi upload file:', file.originalname, uploadError);
        errors.push({ file: file.originalname, error: uploadError.message });
        continue;
      }

      console.log('File uploaded to storage:', filePath);

      // Lấy public URL
      const { data: urlData } = supabaseAdmin.storage
        .from('dataset-files')
        .getPublicUrl(filePath);

      console.log('Public URL generated:', urlData.publicUrl);

      // Lưu thông tin file vào database
      const { data: fileRecord, error: dbError } = await supabase
        .from('dataset_files')
        .insert([
          {
            dataset_id: id,
            file_name: file.originalname,
            file_path: filePath,
            file_url: urlData.publicUrl,
            file_type: file.mimetype,
            file_size: file.size
          }
        ])
        .select()
        .single();

      if (dbError) {
        console.error('Lỗi lưu file vào database:', file.originalname, dbError);
        errors.push({ file: file.originalname, error: dbError.message });
      } else {
        console.log('File saved to database:', fileRecord.id);
        uploadedFiles.push(fileRecord);
      }
    }

    console.log(`Upload completed: ${uploadedFiles.length}/${files.length} files successful`);
    if (errors.length > 0) {
      console.error('Upload errors:', errors);
    }

    res.json({ 
      message: `Upload thành công ${uploadedFiles.length}/${files.length} files`,
      files: uploadedFiles,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Xóa file khỏi dataset (chỉ admin)
router.delete('/:id/files/:fileId', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { id, fileId } = req.params;

    // Lấy thông tin file
    const { data: file } = await supabase
      .from('dataset_files')
      .select('*')
      .eq('id', fileId)
      .eq('dataset_id', id)
      .single();

    if (!file) {
      return res.status(404).json({ error: 'File không tồn tại' });
    }

    // Xóa file từ storage - dùng supabaseAdmin để bypass RLS
    const { error: storageError } = await supabaseAdmin.storage
      .from('dataset-files')
      .remove([file.file_path]);

    if (storageError) {
      console.error('Lỗi xóa file từ storage:', storageError);
    }

    // Xóa record từ database
    const { error: dbError } = await supabase
      .from('dataset_files')
      .delete()
      .eq('id', fileId);

    if (dbError) {
      return res.status(500).json({ error: 'Không thể xóa file' });
    }

    res.json({ message: 'Xóa file thành công' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Lấy tất cả câu trả lời cho dataset (chỉ admin) 
router.get('/:id/answers', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { id } = req.params;

    // Lấy tất cả submissions cho dataset này
    const { data: submissions, error: submissionsError } = await supabase
      .from('submissions')
      .select(`
        *,
        users:user_id (id, username, email)
      `)
      .eq('dataset_id', id)
      .order('submitted_at', { ascending: false });

    if (submissionsError) {
      return res.status(500).json({ error: 'Không thể lấy submissions' });
    }

    // Lấy tất cả answers cho dataset này
    const { data: answers, error: answersError } = await supabase
      .from('answers')
      .select(`
        *,
        questions:question_id (id, question_text, answer_type, options),
        dataset_files:file_id (id, file_name, file_url)
      `)
      .eq('dataset_id', id)
      .order('created_at', { ascending: false });

    if (answersError) {
      return res.status(500).json({ error: 'Không thể lấy câu trả lời' });
    }

    // Group answers by submission
    const submissionsWithAnswers = submissions.map(submission => ({
      ...submission,
      answers: answers.filter(answer => answer.submission_id === submission.id)
    }));

    res.json({ 
      submissions: submissionsWithAnswers,
      total_submissions: submissions.length,
      total_answers: answers.length
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
