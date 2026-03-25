import fs from "node:fs";
import path from "node:path";
import multer from "multer";

const uploadDir = process.env.UPLOAD_DIR ?? "./uploads";
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, uploadDir),
  filename: (_, file, cb) => {
    const name = `${Date.now()}-${Math.round(Math.random() * 1e9)}${path.extname(file.originalname)}`;
    cb(null, name);
  },
});

export const upload = multer({ storage });

/** Multer em memória — para áudio/imagem processados em tempo real (sem salvar em disco). */
export const memUpload = multer({ storage: multer.memoryStorage() });

