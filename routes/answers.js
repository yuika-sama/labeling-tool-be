import express from 'express';
import { supabase } from '../config/supabase.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = express.Router();

// Submit câu trả lời (user và admin)
router.post('/', authenticate, async (req, res) => {
  try {
    const { dataset_id, file_id, question_id, answer_value } = req.body;

    if (!dataset_id || !question_id || answer_value === undefined) {
      return res.status(400).json({ error: 'Thiếu thông tin bắt buộc' });
    }

    // Kiểm tra dataset tồn tại và đã publish
    const { data: dataset } = await supabase
      .from('datasets')
      .select('*')
      .eq('id', dataset_id)
      .single();

    if (!dataset) {
      return res.status(404).json({ error: 'Dataset không tồn tại' });
    }

    if (req.user.role === 'user' && !dataset.is_published) {
      return res.status(403).json({ error: 'Dataset chưa được công bố' });
    }

    // Lưu hoặc cập nhật câu trả lời
    const { data: existingAnswer } = await supabase
      .from('answers')
      .select('*')
      .eq('user_id', req.user.id)
      .eq('dataset_id', dataset_id)
      .eq('question_id', question_id)
      .eq('file_id', file_id || null)
      .maybeSingle();

    let result;
    if (existingAnswer) {
      // Cập nhật câu trả lời cũ
      const { data, error } = await supabase
        .from('answers')
        .update({ answer_value })
        .eq('id', existingAnswer.id)
        .select()
        .single();

      if (error) {
        return res.status(500).json({ error: 'Không thể cập nhật câu trả lời' });
      }
      result = data;
    } else {
      // Tạo câu trả lời mới
      const { data, error } = await supabase
        .from('answers')
        .insert([
          {
            user_id: req.user.id,
            dataset_id,
            question_id,
            file_id: file_id || null,
            answer_value
          }
        ])
        .select()
        .single();

      if (error) {
        return res.status(500).json({ error: 'Không thể lưu câu trả lời' });
      }
      result = data;
    }

    res.json({ message: 'Lưu câu trả lời thành công', answer: result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Submit nhiều câu trả lời cùng lúc (1 lượt trả lời - 1 submission)
router.post('/batch', authenticate, async (req, res) => {
  try {
    const { answers, dataset_id } = req.body; // Array of {file_id, question_id, answer_value}

    if (!dataset_id) {
      return res.status(400).json({ error: 'Thiếu dataset_id' });
    }

    if (!answers || !Array.isArray(answers) || answers.length === 0) {
      return res.status(400).json({ error: 'Danh sách câu trả lời không hợp lệ' });
    }

    console.log('Creating submission for user:', req.user.id, 'dataset:', dataset_id);

    // Tạo submission mới (1 lượt trả lời)
    const { data: submission, error: submissionError } = await supabase
      .from('submissions')
      .insert([
        {
          dataset_id: dataset_id,
          user_id: req.user.id,
          status: 'in_progress',
          started_at: new Date().toISOString()
        }
      ])
      .select()
      .single();

    if (submissionError) {
      console.error('Error creating submission:', submissionError);
      return res.status(500).json({ error: 'Không thể tạo lượt trả lời: ' + submissionError.message });
    }

    console.log('Submission created:', submission.id);

    const results = [];
    const errors = [];

    // Lưu từng câu trả lời với submission_id
    for (const answer of answers) {
      const { file_id, question_id, answer_value } = answer;

      if (!question_id || answer_value === undefined || answer_value === '') {
        continue; // Skip empty answers
      }

      try {
        const { data, error } = await supabase
          .from('answers')
          .insert([
            {
              submission_id: submission.id,
              user_id: req.user.id,
              dataset_id: dataset_id,
              question_id,
              file_id: file_id || null,
              answer_value: String(answer_value)
            }
          ])
          .select()
          .single();

        if (error) throw error;
        results.push(data);
      } catch (err) {
        console.error('Error saving answer:', err);
        errors.push({ answer, error: err.message });
      }
    }

    // Cập nhật submission thành completed
    const { error: updateError } = await supabase
      .from('submissions')
      .update({ 
        status: 'completed',
        submitted_at: new Date().toISOString()
      })
      .eq('id', submission.id);

    if (updateError) {
      console.error('Error updating submission status:', updateError);
    }

    console.log(`Saved ${results.length}/${answers.length} answers to submission ${submission.id}`);

    res.json({ 
      message: `Lưu thành công ${results.length} câu trả lời`,
      submission_id: submission.id,
      results,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (error) {
    console.error('Batch submit error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Lấy câu trả lời của user hiện tại cho 1 dataset
router.get('/my-answers/:datasetId', authenticate, async (req, res) => {
  try {
    const { datasetId } = req.params;

    const { data: answers, error } = await supabase
      .from('answers')
      .select(`
        *,
        questions:question_id (question_text, answer_type, options),
        dataset_files:file_id (file_name, file_url)
      `)
      .eq('user_id', req.user.id)
      .eq('dataset_id', datasetId);

    if (error) {
      return res.status(500).json({ error: 'Không thể lấy câu trả lời' });
    }

    res.json({ answers });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Xóa câu trả lời (chỉ user tự xóa của mình hoặc admin)
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;

    // Kiểm tra câu trả lời
    const { data: answer } = await supabase
      .from('answers')
      .select('*')
      .eq('id', id)
      .single();

    if (!answer) {
      return res.status(404).json({ error: 'Câu trả lời không tồn tại' });
    }

    // Chỉ cho phép user xóa câu trả lời của mình hoặc admin xóa bất kỳ
    if (req.user.role !== 'admin' && answer.user_id !== req.user.id) {
      return res.status(403).json({ error: 'Không có quyền xóa câu trả lời này' });
    }

    const { error } = await supabase
      .from('answers')
      .delete()
      .eq('id', id);

    if (error) {
      return res.status(500).json({ error: 'Không thể xóa câu trả lời' });
    }

    res.json({ message: 'Xóa câu trả lời thành công' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
