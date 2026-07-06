import express from 'express';
import { protect } from '../middlewares/auth.middleware.js';
import { upload } from '../middlewares/multer.middleware.js';
import {
  getMyConversations,
  getOrCreateConversation,
  getMessages,
  uploadChatImage
} from '../controllers/chat.controller.js';

const router = express.Router();

// Protect all chat routes (works for both customer and vendor due to protect logic)
router.use(protect);

router.post('/upload', upload.single('chatImage'), uploadChatImage);

router.route('/conversations')
  .get(getMyConversations)
  .post(getOrCreateConversation);

router.get('/conversations/:id/messages', getMessages);

export default router;
