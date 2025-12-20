import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { supabase } from '../config/supabase.js';

const router = express.Router();

// Đăng ký
router.post('/register', async (req, res) => {
  try {
    const { username, email, password, role = 'user' } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({ error: 'Vui lòng cung cấp đầy đủ thông tin' });
    }

    // Trim khoảng trắng thừa
    const trimmedEmail = email.trim().toLowerCase();
    const trimmedUsername = username.trim();
    const trimmedPassword = password.trim();

    // Kiểm tra user đã tồn tại
    const { data: existingUser } = await supabase
      .from('users')
      .select('*')
      .eq('email', trimmedEmail)
      .single();

    if (existingUser) {
      return res.status(400).json({ error: 'Email đã được sử dụng' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(trimmedPassword, 10);
    console.log('Creating user with hashed password:', trimmedEmail);

    // Tạo user mới
    const { data: newUser, error } = await supabase
      .from('users')
      .insert([
        {
          username: trimmedUsername,
          email: trimmedEmail,
          password: hashedPassword,
          role: role === 'admin' ? 'admin' : 'user' // Chỉ admin hoặc user
        }
      ])
      .select()
      .single();

    if (error) {
      return res.status(500).json({ error: 'Không thể tạo tài khoản' });
    }

    // Tạo token
    const token = jwt.sign(
      { userId: newUser.id, role: newUser.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json({
      message: 'Đăng ký thành công',
      token,
      user: {
        id: newUser.id,
        username: newUser.username,
        email: newUser.email,
        role: newUser.role
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Đăng nhập
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Vui lòng cung cấp email và mật khẩu' });
    }

    // Trim khoảng trắng thừa
    const trimmedEmail = email.trim().toLowerCase();
    const trimmedPassword = password.trim();

    // Tìm user
    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('email', trimmedEmail)
      .single();

    if (error || !user) {
      console.log('User not found:', trimmedEmail);
      return res.status(401).json({ error: 'Email hoặc mật khẩu không đúng' });
    }

    console.log('User found:', user.email, 'Password hash exists:', !!user.password);

    // Kiểm tra password
    const isValidPassword = await bcrypt.compare(trimmedPassword, user.password);
    console.log('Password comparison result:', isValidPassword);
    
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Email hoặc mật khẩu không đúng' });
    }

    // Tạo token
    const token = jwt.sign(
      { userId: user.id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      message: 'Đăng nhập thành công',
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Lấy thông tin user hiện tại
router.get('/me', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    
    if (!token) {
      return res.status(401).json({ error: 'Chưa đăng nhập' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    const { data: user, error } = await supabase
      .from('users')
      .select('id, username, email, role, created_at')
      .eq('id', decoded.userId)
      .single();

    if (error || !user) {
      return res.status(401).json({ error: 'Token không hợp lệ' });
    }

    res.json({ user });
  } catch (error) {
    res.status(401).json({ error: 'Token không hợp lệ' });
  }
});

export default router;
