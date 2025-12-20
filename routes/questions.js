import express from 'express';
import { supabase } from '../config/supabase.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = express.Router();

// Lấy tất cả câu hỏi cho 1 dataset
router.get('/dataset/:datasetId', authenticate, async (req, res) => {
  try {
    const { datasetId } = req.params;

    const { data: questions, error } = await supabase
      .from('questions')
      .select('*')
      .eq('dataset_id', datasetId)
      .order('created_at', { ascending: true });

    if (error) {
      return res.status(500).json({ error: 'Không thể lấy câu hỏi' });
    }

    res.json({ questions });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Thêm câu hỏi mới cho dataset (chỉ admin)
router.post('/', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { dataset_id, question_text, answer_type, options } = req.body;

    if (!dataset_id || !question_text || !answer_type) {
      return res.status(400).json({ error: 'Thiếu thông tin bắt buộc' });
    }

    const { data: question, error } = await supabase
      .from('questions')
      .insert([
        {
          dataset_id,
          question_text,
          answer_type,
          options: options || null
        }
      ])
      .select()
      .single();

    if (error) {
      return res.status(500).json({ error: 'Không thể tạo câu hỏi' });
    }

    res.status(201).json({ message: 'Tạo câu hỏi thành công', question });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Cập nhật câu hỏi (chỉ admin)
router.put('/:id', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const { question_text, answer_type, options } = req.body;

    const updateData = {};
    if (question_text !== undefined) updateData.question_text = question_text;
    if (answer_type !== undefined) updateData.answer_type = answer_type;
    if (options !== undefined) updateData.options = options;

    const { data: question, error } = await supabase
      .from('questions')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return res.status(500).json({ error: 'Không thể cập nhật câu hỏi' });
    }

    res.json({ message: 'Cập nhật câu hỏi thành công', question });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Xóa câu hỏi (chỉ admin)
router.delete('/:id', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { id } = req.params;

    // Xóa các câu trả lời liên quan trước
    await supabase.from('answers').delete().eq('question_id', id);

    const { error } = await supabase
      .from('questions')
      .delete()
      .eq('id', id);

    if (error) {
      return res.status(500).json({ error: 'Không thể xóa câu hỏi' });
    }

    res.json({ message: 'Xóa câu hỏi thành công' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
